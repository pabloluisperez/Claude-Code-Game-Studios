/**
 * Calendar — visual grid centered on the in-game "hoy" (current Saturday).
 *
 * Returns the raw event list (decorated with each event's real date) plus the
 * fixture list, so the Svelte page can pin them on a month-grid.
 *
 * Story: MVP UX fixes — visual calendar grid
 * Control Manifest: 2026-05-19
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  calendarEvents,
  sponsors,
  fixtures,
  clubs,
  playthroughs,
  eq,
  and,
  asc,
  or,
  desc,
  alias,
} from '@smt/db';
import { weekToDate } from '@smt/shared';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  // Bug B3 fix (playtest 2026-05-21 Pablo): hide resolved/expired
  // decision-type events from the calendar so they don't accumulate as
  // stale clutter. Pending events (still decidable) and announcements
  // (consumed=true ones for context) remain. Match fixtures are tracked
  // separately via the fixtures table.
  const events = (
    await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.playthroughId, activePlaythrough.id))
      .orderBy(asc(calendarEvents.week))
  ).filter((e) => {
    // Decision-type events whose state is no longer actionable: drop them.
    const isDecisionType =
      e.type === 'sponsor_offer' ||
      e.type === 'tv_auction' ||
      e.type === 'tv_midseason_offer';
    if (isDecisionType && (e.status === 'resolved' || e.status === 'expired')) {
      return false;
    }
    return true;
  });

  // User's fixtures (so the calendar also pins matchdays).
  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const userFixtures = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      matchday: fixtures.matchday,
      status: fixtures.status,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      or(
        eq(fixtures.homeClubId, activePlaythrough.clubId),
        eq(fixtures.awayClubId, activePlaythrough.clubId),
      ),
    )
    .orderBy(asc(fixtures.week));

  return {
    hasPlaythrough: true as const,
    currentWeek: activePlaythrough.currentWeek,
    today: weekToDate(activePlaythrough.currentWeek),
    events: events.map((e) => ({ ...e, date: weekToDate(e.week) })),
    fixtures: userFixtures.map((f) => ({
      ...f,
      date: weekToDate(f.week),
      isHome: f.homeClubId === activePlaythrough.clubId,
      opponent: f.homeClubId === activePlaythrough.clubId ? f.awayName : f.homeName,
    })),
  };
};

export const actions: Actions = {
  decide: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const eventId = String(form.get('eventId') ?? '');
    const choice = String(form.get('choice') ?? '');

    if (!eventId || !choice) {
      return fail(400, { error: 'Faltan eventId o choice.' });
    }

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const [evt] = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.playthroughId, active.id),
        ),
      )
      .limit(1);
    if (!evt) return fail(404, { error: 'Evento no encontrado.' });
    if (evt.status !== 'pending') {
      return fail(400, { error: 'Evento ya resuelto o expirado.' });
    }

    const metadata = evt.metadata as {
      kind: string;
      brand?: string;
      weeklyAmountEurK?: number;
      contractWeeks?: number;
      qualityDelta?: number;
    };

    await db.transaction(async (tx) => {
      await tx
        .update(calendarEvents)
        .set({
          status: 'resolved',
          metadata: {
            ...metadata,
            resolvedChoice: choice,
            resolvedAt: new Date().toISOString(),
          },
          consumed: true,
        })
        .where(eq(calendarEvents.id, eventId));

      // Side effect: sponsor offer accepted → create sponsor row so finance
      // immediately picks up the new revenue. Also auto-expire competing
      // sponsor offers for the same week (the user can only sign one).
      if (
        metadata.kind === 'sponsor_offer' &&
        choice === 'accept' &&
        metadata.brand &&
        metadata.weeklyAmountEurK &&
        metadata.contractWeeks
      ) {
        await tx.insert(sponsors).values({
          playthroughId: active.id,
          clubId: active.clubId,
          name: metadata.brand,
          tier: 1,
          weeklyEurK: metadata.weeklyAmountEurK,
          qualityContribution: metadata.qualityDelta ?? 0,
          status: 'active',
          startedWeek: active.currentWeek,
          endsWeek: active.currentWeek + metadata.contractWeeks,
        });

        // Auto-expire competing sponsor offers for the same week.
        await tx
          .update(calendarEvents)
          .set({
            status: 'expired',
            consumed: true,
          })
          .where(
            and(
              eq(calendarEvents.playthroughId, active.id),
              eq(calendarEvents.type, 'sponsor_offer'),
              eq(calendarEvents.week, evt.week),
              eq(calendarEvents.status, 'pending'),
            ),
          );
      }
    });

    return { ok: true, choice };
  },
};

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
  players,
  playthroughs,
  staff,
  staffMessages,
  seasons,
  leagues,
  eq,
  and,
  asc,
  or,
  desc,
  alias,
} from '@smt/db';
import {
  weekToDate,
  dayOfSeasonToDate,
  renderNarrative,
  contractRenewalTemplates,
  sponsorRenewalTemplates,
} from '@smt/shared';

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

  // Sprint 12 walkthrough fix (Pablo Part B): day-precise cursor.
  const currentDayOfSeason =
    activePlaythrough.currentDayOfSeason ?? activePlaythrough.currentWeek * 7;
  const dayInWeek = currentDayOfSeason % 7;

  return {
    hasPlaythrough: true as const,
    currentWeek: activePlaythrough.currentWeek,
    currentDayOfSeason,
    dayInWeek,
    today: weekToDate(activePlaythrough.currentWeek),
    todayPrecise: dayOfSeasonToDate(currentDayOfSeason),
    // Each event carries a date computed from scheduledDayOfSeason when
    // present (Sprint 12+ STOP events with mid-week semantics); legacy
    // events without it fall back to week*7 (start of their week).
    events: events.map((e) => ({
      ...e,
      date: weekToDate(e.week),
      datePrecise: dayOfSeasonToDate(e.scheduledDayOfSeason ?? e.week * 7),
    })),
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
      // Contract renewal fields (Pablo 2026-05-25)
      playerId?: string;
      playerName?: string;
      currentSalaryEurK?: number;
      demandedSalaryEurK?: number;
      proposedContractWeeks?: number;
      contractEndWeek?: number;
      skill?: number;
      form?: number;
      age?: number;
      // Sponsor renewal fields (Pablo 2026-05-26)
      sponsorId?: string;
      tier?: number;
      currentWeeklyEurK?: number;
      proposedWeeklyEurK?: number;
    };

    // Counter-offer salary (only relevant for contract_renewal kind).
    const counterSalaryEurK = Number(form.get('counterSalaryEurK') ?? 0) || 0;

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

      // Pablo 2026-05-26: sponsor_renewal side effects.
      // accept → extend the sponsor row's endsWeek + update weeklyEurK to proposed
      // decline → no-op (sponsor expires at its endsWeek; Phase 8c-bis-2 handles flip)
      if (
        metadata.kind === 'sponsor_renewal' &&
        metadata.sponsorId &&
        metadata.proposedWeeklyEurK &&
        metadata.contractWeeks
      ) {
        if (choice === 'renew' || choice === 'accept') {
          const { sponsors } = await import('@smt/db');
          await tx
            .update(sponsors)
            .set({
              weeklyEurK: metadata.proposedWeeklyEurK,
              endsWeek: active.currentWeek + metadata.contractWeeks,
              updatedAt: new Date(),
            })
            .where(eq(sponsors.id, metadata.sponsorId));

          // Narrative reaction (Sprint 26 wiring of sponsorRenewalTemplates).
          const [seasonRow] = await tx
            .select({ n: seasons.seasonNumber })
            .from(seasons)
            .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
            .where(and(eq(leagues.playthroughId, active.id), eq(seasons.status, 'active')))
            .orderBy(desc(seasons.seasonNumber))
            .limit(1);
          const [notifier] = await tx
            .select({ id: staff.id })
            .from(staff)
            .where(
              and(
                eq(staff.playthroughId, active.id),
                or(
                  eq(staff.role, 'finance_director'),
                  eq(staff.role, 'commercial_director'),
                  eq(staff.role, 'head_coach'),
                ),
                eq(staff.status, 'active'),
              ),
            )
            .limit(1);
          if (notifier) {
            const body = renderNarrative(sponsorRenewalTemplates, {
              seed: active.currentWeek * 53 + (metadata.brand?.length ?? 0),
              variables: {
                sponsorName: metadata.brand ?? 'El patrocinador',
                amountEurK: metadata.proposedWeeklyEurK,
              },
            });
            if (body) {
              await tx.insert(staffMessages).values({
                playthroughId: active.id,
                staffId: notifier.id,
                week: active.currentWeek,
                season: seasonRow?.n ?? 1,
                priority: 'ROUTINE',
                templateKey: 'sponsor:renewed',
                content: `🤝 ${body}`,
                isRead: false,
              });
            }
          }
        }
      }

      // Pablo 2026-05-25: contract_renewal side effects.
      // Negotiation outcome rules:
      //   accept   → renew at demanded salary, extend by proposedContractWeeks
      //   counter  → player evaluates counterSalary vs demanded:
      //                ≥100% → accept
      //                70-100% (deterministic by player+week hash) → accept ~50%
      //                <70% → reject (player walks at contract end)
      //   reject   → mark resolved, player walks at contract end (no extension)
      if (
        metadata.kind === 'contract_renewal' &&
        metadata.playerId &&
        metadata.demandedSalaryEurK &&
        metadata.proposedContractWeeks
      ) {
        const demanded = metadata.demandedSalaryEurK;
        const weeks = metadata.proposedContractWeeks;

        let outcome: 'renewed' | 'counter_pending' | 'walked' = 'walked';
        let finalSalary = metadata.currentSalaryEurK ?? demanded;

        if (choice === 'accept') {
          outcome = 'renewed';
          finalSalary = demanded;
        } else if (choice === 'counter' && counterSalaryEurK > 0) {
          const ratio = counterSalaryEurK / demanded;
          if (ratio >= 1.0) {
            outcome = 'renewed';
            finalSalary = counterSalaryEurK;
          } else if (ratio >= 0.7) {
            // Deterministic 50/50 by (playerId + week) hash modulo 2.
            const seed = (metadata.playerId + ':' + active.currentWeek).split('').reduce(
              (a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffffff,
              7,
            );
            if ((Math.abs(seed) & 1) === 1) {
              outcome = 'renewed';
              finalSalary = counterSalaryEurK;
            } else {
              // Player rejects this counter → walks at end (one-shot, no re-counter).
              outcome = 'walked';
            }
          } else {
            outcome = 'walked';
          }
        } else if (choice === 'reject') {
          outcome = 'walked';
        }

        if (outcome === 'renewed') {
          await tx
            .update(players)
            .set({
              salaryEurK: finalSalary,
              contractStartWeek: active.currentWeek,
              contractEndWeek: active.currentWeek + weeks,
              contractStatus: 'in_contract',
              weeksUnsigned: 0,
            })
            .where(eq(players.id, metadata.playerId));

          // Narrative reaction (Sprint 26 wiring of contractRenewalTemplates).
          const playerName = metadata.playerName ?? 'El jugador';
          const [seasonRow] = await tx
            .select({ n: seasons.seasonNumber })
            .from(seasons)
            .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
            .where(and(eq(leagues.playthroughId, active.id), eq(seasons.status, 'active')))
            .orderBy(desc(seasons.seasonNumber))
            .limit(1);
          const [notifier] = await tx
            .select({ id: staff.id })
            .from(staff)
            .where(
              and(
                eq(staff.playthroughId, active.id),
                or(eq(staff.role, 'head_coach'), eq(staff.role, 'scouting_director')),
                eq(staff.status, 'active'),
              ),
            )
            .limit(1);
          if (notifier) {
            const body = renderNarrative(contractRenewalTemplates, {
              seed: active.currentWeek * 47 + playerName.length,
              variables: { playerName },
            });
            if (body) {
              await tx.insert(staffMessages).values({
                playthroughId: active.id,
                staffId: notifier.id,
                week: active.currentWeek,
                season: seasonRow?.n ?? 1,
                priority: 'ROUTINE',
                templateKey: 'contract:renewed',
                content: `✍️ ${body}`,
                isRead: false,
              });
            }
          }
        }
        // For 'walked' outcome we don't touch the player — contract still
        // expires at contractEndWeek per existing data; downstream lifecycle
        // logic handles the transition to free agent.

        // Record outcome in event metadata so /calendar shows what happened.
        await tx
          .update(calendarEvents)
          .set({
            metadata: {
              ...metadata,
              resolvedChoice: choice,
              resolvedOutcome: outcome,
              resolvedFinalSalaryEurK: finalSalary,
              resolvedAt: new Date().toISOString(),
            },
          })
          .where(eq(calendarEvents.id, eventId));
      }
    });

    return { ok: true, choice };
  },
};

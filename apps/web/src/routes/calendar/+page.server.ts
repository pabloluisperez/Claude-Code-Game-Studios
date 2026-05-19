/**
 * Calendar — list season calendar events + decision action.
 *
 * On accept of a sponsor_offer we additionally insert a `sponsors` row so the
 * finance page reflects new weekly revenue immediately.
 *
 * Story: Event scheduling follow-up (EVENT-SYSTEM-006)
 * Control Manifest: 2026-05-19
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  calendarEvents,
  sponsors,
  playthroughs,
  eq,
  and,
  asc,
  desc,
} from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const events = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.playthroughId, activePlaythrough.id))
    .orderBy(asc(calendarEvents.week));

  return { hasPlaythrough: true as const, events };
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
          metadata: { ...metadata, resolvedChoice: choice, resolvedAt: new Date().toISOString() },
          consumed: true,
        })
        .where(eq(calendarEvents.id, eventId));

      // Side effect: sponsor offer accepted → create sponsor row.
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
      }
    });

    return { ok: true, choice };
  },
};

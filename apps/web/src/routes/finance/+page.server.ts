/**
 * Finance dashboard — snapshots history + sponsors + season-ticket controls.
 *
 * Story: Season tickets stub
 * Control Manifest: 2026-05-20
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  sponsors,
  clubs,
  playthroughs,
  eq,
  desc,
} from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const snapshots = await db
    .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, activePlaythrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(4);

  const sponsorRows = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.playthroughId, activePlaythrough.id))
    .orderBy(desc(sponsors.tier));

  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  return {
    hasPlaythrough: true as const,
    snapshots: snapshots.map((s) => ({
      week: s.week,
      state: s.worldState as Record<string, number>,
    })),
    sponsors: sponsorRows,
    club: club
      ? {
          seasonTicketPriceEur: club.seasonTicketPriceEur,
          seasonTicketHolders: club.seasonTicketHolders,
          fanBase: club.fanBase,
        }
      : null,
  };
};

export const actions: Actions = {
  setTicketPrice: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const raw = Number(form.get('priceEur') ?? NaN);
    if (!Number.isFinite(raw) || raw < 5 || raw > 200) {
      return fail(400, { error: 'Precio fuera de rango (5-200 €).' });
    }

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    // Adjust holder count based on the new price vs market reference (35€).
    // - 25€ or less → +10% holders (cap at fanBase × 0.4)
    // - 50€ or more → -10% holders (floor at 50)
    // - in between → no change
    const [club] = await db.select().from(clubs).where(eq(clubs.id, active.clubId)).limit(1);
    if (!club) return fail(400, { error: 'Club no encontrado.' });

    let holders = club.seasonTicketHolders;
    if (raw <= 25) {
      holders = Math.min(Math.round(club.fanBase * 0.4), Math.round(holders * 1.1));
    } else if (raw >= 50) {
      holders = Math.max(50, Math.round(holders * 0.9));
    }

    await db
      .update(clubs)
      .set({
        seasonTicketPriceEur: Math.round(raw),
        seasonTicketHolders: holders,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, active.clubId));

    return { ok: true, priceEur: Math.round(raw), holders };
  },
};

/**
 * /shop — Tienda (#39, reworked Pablo 2026-05-27).
 *
 * Two separate actions per merch kind:
 *   - manufacture: place an order (takes merchLeadTimeWeeks weeks, debited
 *     upfront). Stock arrives when the advance pipeline ticks the order down.
 *   - setSalePrice: change the sale price (instant).
 * Concessions: just a sale price (no stock).
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, clubs, playthroughs, worldSnapshots, eq, and, desc } from '@smt/db';
import { merchUnitCost, merchBatchCost, merchLeadTimeWeeks, type MerchKind } from '@smt/shared';

const MERCH_KINDS: readonly MerchKind[] = ['scarf', 'cap', 'shirt'];
const CONCESSIONS = ['food', 'soda', 'beer', 'water'] as const;

const COLS = {
  scarf: { price: 'merchScarfPrice', stock: 'merchScarfStock', mfgQty: 'merchScarfMfgQty', mfgWeeks: 'merchScarfMfgWeeksLeft', unitCost: 'merchScarfUnitCost' },
  cap: { price: 'merchCapPrice', stock: 'merchCapStock', mfgQty: 'merchCapMfgQty', mfgWeeks: 'merchCapMfgWeeksLeft', unitCost: 'merchCapUnitCost' },
  shirt: { price: 'merchShirtPrice', stock: 'merchShirtStock', mfgQty: 'merchShirtMfgQty', mfgWeeks: 'merchShirtMfgWeeksLeft', unitCost: 'merchShirtUnitCost' },
} as const;

async function activeFor(userId: string) {
  const [pt] = await db
    .select({ id: playthroughs.id, clubId: playthroughs.clubId })
    .from(playthroughs)
    .where(eq(playthroughs.userId, userId))
    .orderBy(desc(playthroughs.updatedAt))
    .limit(1);
  return pt ?? null;
}

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };

  const [club] = await db
    .select({
      merchScarfPrice: clubs.merchScarfPrice, merchScarfStock: clubs.merchScarfStock,
      merchScarfMfgQty: clubs.merchScarfMfgQty, merchScarfMfgWeeksLeft: clubs.merchScarfMfgWeeksLeft, merchScarfUnitCost: clubs.merchScarfUnitCost,
      merchCapPrice: clubs.merchCapPrice, merchCapStock: clubs.merchCapStock,
      merchCapMfgQty: clubs.merchCapMfgQty, merchCapMfgWeeksLeft: clubs.merchCapMfgWeeksLeft, merchCapUnitCost: clubs.merchCapUnitCost,
      merchShirtPrice: clubs.merchShirtPrice, merchShirtStock: clubs.merchShirtStock,
      merchShirtMfgQty: clubs.merchShirtMfgQty, merchShirtMfgWeeksLeft: clubs.merchShirtMfgWeeksLeft, merchShirtUnitCost: clubs.merchShirtUnitCost,
      concessionFoodPrice: clubs.concessionFoodPrice,
      concessionSodaPrice: clubs.concessionSodaPrice,
      concessionBeerPrice: clubs.concessionBeerPrice,
      concessionWaterPrice: clubs.concessionWaterPrice,
    })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  // Cost curve for the slider live readout (unit cost + total at any qty up to 5000).
  const costCurve = MERCH_KINDS.map((kind) => ({
    kind,
    points: [50, 100, 250, 500, 1000, 2000, 3000, 5000].map((q) => ({
      qty: q,
      unitCost: merchUnitCost(kind, q),
      total: merchBatchCost(kind, q),
      weeks: merchLeadTimeWeeks(q),
    })),
  }));

  return { hasPlaythrough: true as const, club: club ?? null, costCurve };
};

export const actions: Actions = {
  manufacture: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const kind = String(form.get('kind') ?? '') as MerchKind;
    const qty = Math.floor(Number(form.get('qty') ?? 0));
    if (!MERCH_KINDS.includes(kind)) return fail(400, { error: 'Producto inválido.' });
    if (!Number.isFinite(qty) || qty < 50 || qty > 100000) return fail(400, { error: 'Cantidad inválida (mín 50).' });

    const active = await activeFor(locals.user.id);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const c = COLS[kind];

    const result = await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ mfgQty: clubs[c.mfgQty], stock: clubs[c.stock] })
        .from(clubs)
        .where(eq(clubs.id, active.clubId))
        .limit(1);
      if ((cur?.mfgQty ?? 0) > 0) {
        return { error: 'Ya hay un pedido en fabricación para este producto.' };
      }
      const unitCost = Math.round(merchUnitCost(kind, qty));
      const cost = merchBatchCost(kind, qty);
      const weeks = merchLeadTimeWeeks(qty);

      await tx
        .update(clubs)
        .set({
          [c.mfgQty]: qty,
          [c.mfgWeeks]: weeks,
          [c.unitCost]: unitCost,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, active.clubId));

      // Debit cost upfront (commitment, like stadium obras).
      const [snap] = await tx
        .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
        .from(worldSnapshots)
        .where(eq(worldSnapshots.playthroughId, active.id))
        .orderBy(desc(worldSnapshots.week))
        .limit(1);
      if (snap) {
        const ws = { ...(snap.worldState as Record<string, number>) };
        ws['financial_balance'] = (ws['financial_balance'] ?? 0) - cost;
        await tx
          .update(worldSnapshots)
          .set({ worldState: ws })
          .where(and(eq(worldSnapshots.playthroughId, active.id), eq(worldSnapshots.week, snap.week)));
      }
      return { ok: true, qty, cost, weeks };
    });

    if ('error' in result) return fail(400, { error: result.error });
    return { ok: true, action: 'manufacture' as const, kind, qty: result.qty, cost: result.cost, weeks: result.weeks };
  },

  setSalePrice: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const kind = String(form.get('kind') ?? '') as MerchKind;
    const price = Math.floor(Number(form.get('price') ?? 0));
    if (!MERCH_KINDS.includes(kind)) return fail(400, { error: 'Producto inválido.' });
    if (!Number.isFinite(price) || price < 1 || price > 500) return fail(400, { error: 'Precio inválido.' });

    const active = await activeFor(locals.user.id);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db.update(clubs).set({ [COLS[kind].price]: price, updatedAt: new Date() }).where(eq(clubs.id, active.clubId));
    return { ok: true, action: 'setSalePrice' as const, kind, price };
  },

  setConcessionPrice: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const item = String(form.get('item') ?? '');
    const price = Math.floor(Number(form.get('price') ?? 0));
    if (!CONCESSIONS.includes(item as (typeof CONCESSIONS)[number])) return fail(400, { error: 'Producto inválido.' });
    if (!Number.isFinite(price) || price < 1 || price > 50) return fail(400, { error: 'Precio inválido.' });

    const active = await activeFor(locals.user.id);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const col =
      item === 'food' ? 'concessionFoodPrice'
      : item === 'soda' ? 'concessionSodaPrice'
      : item === 'beer' ? 'concessionBeerPrice'
      : 'concessionWaterPrice';
    await db.update(clubs).set({ [col]: price, updatedAt: new Date() }).where(eq(clubs.id, active.clubId));
    return { ok: true, action: 'setConcessionPrice' as const, item, price };
  },
};

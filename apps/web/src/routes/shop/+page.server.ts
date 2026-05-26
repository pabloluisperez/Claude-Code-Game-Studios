/**
 * /shop — Tienda (#39, Pablo 2026-05-27). Manage merch prices + manufacture
 * stock, and set concession prices. Sales happen automatically on home matches
 * (economy-tick commercialRevenue).
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, clubs, playthroughs, worldSnapshots, eq, and, desc } from '@smt/db';
import { merchUnitCost, merchBatchCost, type MerchKind } from '@smt/shared';

const MERCH_KINDS: readonly MerchKind[] = ['scarf', 'cap', 'shirt'];
const CONCESSIONS = ['food', 'soda', 'beer', 'water'] as const;

const PRICE_COL: Record<MerchKind, 'merchScarfPrice' | 'merchCapPrice' | 'merchShirtPrice'> = {
  scarf: 'merchScarfPrice', cap: 'merchCapPrice', shirt: 'merchShirtPrice',
};
const STOCK_COL: Record<MerchKind, 'merchScarfStock' | 'merchCapStock' | 'merchShirtStock'> = {
  scarf: 'merchScarfStock', cap: 'merchCapStock', shirt: 'merchShirtStock',
};

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
      merchScarfPrice: clubs.merchScarfPrice,
      merchScarfStock: clubs.merchScarfStock,
      merchCapPrice: clubs.merchCapPrice,
      merchCapStock: clubs.merchCapStock,
      merchShirtPrice: clubs.merchShirtPrice,
      merchShirtStock: clubs.merchShirtStock,
      concessionFoodPrice: clubs.concessionFoodPrice,
      concessionSodaPrice: clubs.concessionSodaPrice,
      concessionBeerPrice: clubs.concessionBeerPrice,
      concessionWaterPrice: clubs.concessionWaterPrice,
    })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  const costCurve = MERCH_KINDS.map((kind) => ({
    kind,
    samples: [100, 500, 1000, 2000].map((q) => ({ qty: q, unitCost: merchUnitCost(kind, q) })),
  }));

  return { hasPlaythrough: true as const, club: club ?? null, costCurve };
};

export const actions: Actions = {
  manufacture: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const kind = String(form.get('kind') ?? '') as MerchKind;
    const qty = Math.floor(Number(form.get('qty') ?? 0));
    const price = Math.floor(Number(form.get('price') ?? 0));
    if (!MERCH_KINDS.includes(kind)) return fail(400, { error: 'Producto inválido.' });
    if (!Number.isFinite(qty) || qty < 0 || qty > 100000) return fail(400, { error: 'Cantidad inválida.' });
    if (!Number.isFinite(price) || price < 1 || price > 500) return fail(400, { error: 'Precio inválido.' });

    const active = await activeFor(locals.user.id);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const cost = merchBatchCost(kind, qty);

    await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ stock: clubs[STOCK_COL[kind]] })
        .from(clubs)
        .where(eq(clubs.id, active.clubId))
        .limit(1);
      await tx
        .update(clubs)
        .set({
          [PRICE_COL[kind]]: price,
          [STOCK_COL[kind]]: (cur?.stock ?? 0) + qty,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, active.clubId));

      // Debit manufacturing cost from the latest world snapshot balance.
      if (qty > 0 && cost > 0) {
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
      }
    });

    return { ok: true, action: 'manufacture' as const, kind, qty, cost };
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

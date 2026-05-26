/**
 * Tienda (#39, Pablo 2026-05-27): merchandise manufacturing + match-day
 * commercial sales (merch + concessions). Pure functions — no I/O, no rng
 * (sales use a seeded jitter passed by the caller for determinism).
 */

export type MerchKind = 'scarf' | 'cap' | 'shirt';

/** Base manufacturing cost per unit (€) at low volume, before scale discount. */
export const MERCH_BASE_COST: Readonly<Record<MerchKind, number>> = Object.freeze({
  scarf: 6,
  cap: 5,
  shirt: 18,
});

/** Floor cost per unit (€) — scale discount never goes below this. */
export const MERCH_FLOOR_COST: Readonly<Record<MerchKind, number>> = Object.freeze({
  scarf: 3,
  cap: 2.5,
  shirt: 10,
});

/**
 * Unit manufacturing cost with economies of scale.
 * Bigger batches → cheaper per unit. discount = log10(qty)/10 capped so a
 * 1000-unit order is ~30% cheaper than a 10-unit order, floored per kind.
 */
export function merchUnitCost(kind: MerchKind, qty: number): number {
  if (qty <= 0) return MERCH_BASE_COST[kind];
  const base = MERCH_BASE_COST[kind];
  const floor = MERCH_FLOOR_COST[kind];
  const discount = Math.min(0.5, Math.log10(Math.max(1, qty)) / 10);
  const cost = base * (1 - discount);
  return Math.max(floor, Math.round(cost * 100) / 100);
}

/** Total cost to manufacture `qty` units of `kind`. */
export function merchBatchCost(kind: MerchKind, qty: number): number {
  return Math.round(merchUnitCost(kind, qty) * qty);
}

// ── Match-day commercial sales ───────────────────────────────────────────────

/** Buyer propensity per merch kind (fraction of attendance that wants one). */
const MERCH_PROPENSITY: Readonly<Record<MerchKind, number>> = Object.freeze({
  scarf: 0.08,
  cap: 0.05,
  shirt: 0.02,
});

/** Reference price per kind — at this price, propensity is unchanged. */
const MERCH_REF_PRICE: Readonly<Record<MerchKind, number>> = Object.freeze({
  scarf: 15,
  cap: 12,
  shirt: 40,
});

export interface MerchLine {
  readonly kind: MerchKind;
  readonly price: number;
  readonly stock: number;
}

export interface MerchSaleResult {
  readonly kind: MerchKind;
  readonly sold: number;
  readonly revenue: number;
  readonly remainingStock: number;
}

/**
 * Compute merch sales for one home match.
 *   demand = attendance × propensity × priceFactor
 *   priceFactor = (ref/price) clamped [0.3, 1.8]  (dearer → fewer sales)
 *   sold = min(stock, round(demand × jitter))
 */
export function computeMerchSales(
  line: MerchLine,
  attendance: number,
  jitter: number,
): MerchSaleResult {
  const propensity = MERCH_PROPENSITY[line.kind];
  const ref = MERCH_REF_PRICE[line.kind];
  const priceFactor = Math.max(0.3, Math.min(1.8, ref / Math.max(1, line.price)));
  const demand = attendance * propensity * priceFactor * jitter;
  const sold = Math.max(0, Math.min(line.stock, Math.round(demand)));
  return {
    kind: line.kind,
    sold,
    revenue: sold * line.price,
    remainingStock: line.stock - sold,
  };
}

// ── Concessions (no stock — made fresh) ──────────────────────────────────────

export type ConcessionKind = 'food' | 'soda' | 'beer' | 'water';

/** Base buy-rate per attendee at the reference price. */
const CONCESSION_BASE_RATE: Readonly<Record<ConcessionKind, number>> = Object.freeze({
  food: 0.35,
  soda: 0.4,
  beer: 0.3,
  water: 0.25,
});
const CONCESSION_REF_PRICE: Readonly<Record<ConcessionKind, number>> = Object.freeze({
  food: 4,
  soda: 3,
  beer: 5,
  water: 2,
});

export interface ConcessionPrices {
  readonly food: number;
  readonly soda: number;
  readonly beer: number;
  readonly water: number;
}

/**
 * Total concession revenue for one home match.
 * Per item: buyers = attendance × baseRate × priceFactor; revenue += buyers × price.
 * priceFactor = (ref/price) clamped [0.4, 1.5].
 */
export function computeConcessionRevenue(
  prices: ConcessionPrices,
  attendance: number,
  jitter: number,
): number {
  const kinds: ConcessionKind[] = ['food', 'soda', 'beer', 'water'];
  let total = 0;
  for (const k of kinds) {
    const price = prices[k];
    const ref = CONCESSION_REF_PRICE[k];
    const priceFactor = Math.max(0.4, Math.min(1.5, ref / Math.max(1, price)));
    const buyers = attendance * CONCESSION_BASE_RATE[k] * priceFactor * jitter;
    total += buyers * price;
  }
  return Math.round(total);
}

/**
 * F4: `cost_of_item` — computes the EUR-K cost of buying a stadium-upgrade item.
 *
 * Cost = BASE_COST_TIER[tier] × TRACK_MULTIPLIER[track] × optional modifiers.
 * Modifiers compose multiplicatively (not additively).
 *
 * Per `design/gdd/stadium-upgrades.md §4 F4`. Story STADIUM-UPGRADES-004.
 */

import type { ItemTier, Track } from './types.js';

/** Base cost in EUR-K (€000) per tier, before track multiplier. */
export const BASE_COST_TIER: Record<ItemTier, number> = {
  1: 15,
  2: 55,
  3: 130,
  4: 340,
};

/** Per-track price scaling. Pitch is cheapest; gradas most expensive. */
export const TRACK_MULTIPLIER: Record<Track, number> = {
  gradas: 1.4,
  pitch: 0.8,
  servicios: 0.9,
  training: 1.1,
  academy: 1.0,
};

/** Manager Construction-skill (T3+) discount: 15% off. */
export const CONSTRUCTION_SKILL_DISCOUNT = 0.15;

export type CostModifiers = {
  /** True if the manager has Construction skill at tier 3+. */
  constructionSkill?: boolean;
  /** Decimal in [0, 1]. 0.30 = 30% subsidy from an active event offer. */
  subsidyPct?: number;
};

/**
 * Compute the cost in EUR-K. Modifier order is multiplicative:
 * `base × track × (1 - construction) × (1 - subsidy)`.
 *
 * Rounds to integer EUR-K (per economy.md F-revenue-flow grain).
 */
export function costOfItem(
  item: { tier: ItemTier; track: Track },
  modifiers: CostModifiers = {},
): number {
  let cost = BASE_COST_TIER[item.tier] * TRACK_MULTIPLIER[item.track];
  if (modifiers.constructionSkill) {
    cost *= 1 - CONSTRUCTION_SKILL_DISCOUNT;
  }
  if (modifiers.subsidyPct && modifiers.subsidyPct > 0) {
    cost *= 1 - Math.min(1, modifiers.subsidyPct);
  }
  return Math.round(cost);
}

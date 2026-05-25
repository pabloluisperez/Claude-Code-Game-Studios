/**
 * F5: `stadium_capacity` — computes total seating from base capacity + Gradas items.
 *
 * Per `design/gdd/stadium-upgrades.md §4 F5`. Story STADIUM-UPGRADES-004.
 *
 * Authoritative source for STADIUM_CAPACITY_BASE is `economy.md F1`.
 */

import type { ItemTier } from './types.js';

/** Base capacity by division. MVP supports D2 + D1. */
export const STADIUM_CAPACITY_BASE: Record<'D1' | 'D2', number> = {
  D1: 12000,
  D2: 6000,
};

/**
 * Capacity added per completed Gradas item, tiered. Higher tiers contribute
 * more capacity (late-game acceleration — per GDD §4 rationale).
 */
export const CAPACITY_PER_GRADA_ITEM: Record<ItemTier, number> = {
  1: 700,
  2: 1100,
  3: 2000,
  4: 2700,
};

/**
 * Compute total stadium capacity for a division given the count of completed
 * Gradas items at each tier.
 */
export function stadiumCapacity(
  division: 'D1' | 'D2',
  completedGradasByTier: Record<ItemTier, number>,
): number {
  let total = STADIUM_CAPACITY_BASE[division];
  for (const tier of [1, 2, 3, 4] as ItemTier[]) {
    const count = Math.max(0, completedGradasByTier[tier] ?? 0);
    total += count * CAPACITY_PER_GRADA_ITEM[tier];
  }
  return total;
}

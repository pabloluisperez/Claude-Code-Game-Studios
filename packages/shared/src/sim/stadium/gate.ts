/**
 * F6: tier-up "reformas" gate — second gate in city-progression.md.
 *
 * The player must have completed ≥ 70% of items in level N to satisfy the
 * reformas gate for city tier N+1. This runs in series with the existing
 * métricas gate from city-progression.md §3.2.
 *
 * Per `design/gdd/stadium-upgrades.md §4 F6`. Story STADIUM-UPGRADES-004.
 */

import type { ItemTier } from './types.js';

/** Fraction of items at level N that must be Complete for tier-up gate to pass. */
export const TIER_UP_GATE_PCT = 0.7;

/** How many items (ceiling) are needed to satisfy the gate for a level of N items. */
export function itemsRequiredForLevel(itemsInLevel: number): number {
  if (itemsInLevel <= 0) return 0;
  return Math.ceil(itemsInLevel * TIER_UP_GATE_PCT);
}

/**
 * @param level the target tier (ignored — reserved for per-tier overrides in v1.2+)
 * @param completedCount items at this tier currently Complete
 * @param totalInLevel total items defined at this tier in the catalog
 */
export function tierUpReformasGateSatisfied(
  _level: ItemTier,
  completedCount: number,
  totalInLevel: number,
): boolean {
  return completedCount >= itemsRequiredForLevel(totalInLevel);
}

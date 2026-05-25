/**
 * F3: `infrastructure_level` — supersedes `city-progression.md §4.2`.
 *
 * Computes a 0..100 score combining stadium + training + academy progress.
 * Pure function, no I/O, no randomness.
 *
 * Per `design/gdd/stadium-upgrades.md §4 F3` and ADR-029.
 * Story STADIUM-UPGRADES-003.
 */

import type { StadiumState } from './types.js';
import { clampToRange } from '../cascade-engine.js';

/** Sum of items in the 3 stadium tracks at full completion. */
export const STADIUM_ITEMS_MAX = 24;
/** Max items in training facility track. */
export const TRAINING_ITEMS_MAX = 8;
/** Max items in youth academy track. */
export const ACADEMY_ITEMS_MAX = 8;

/** Weighted-sum coefficients. Sum = 1.0. Stadium dominates because it's
 * the most visible and most expensive of the three. */
export const W_INFRA_STADIUM = 0.50;
export const W_INFRA_TRAINING = 0.25;
export const W_INFRA_ACADEMY = 0.25;

/**
 * Compute `infrastructure_level` from persisted WorldState counters.
 * Returns integer in [0, 100].
 *
 * This formula REPLACES the previous one in `city-progression.md §4.2`
 * (the old `stadium_upgrade_count * 5 + training_facility_level * 5`).
 * If any pre-v1.1 call site referenced that formula, it must import this
 * function instead.
 */
export function infrastructureLevel(state: StadiumState): number {
  const stadiumScore = Math.max(0, state.stadium_upgrade_count) / STADIUM_ITEMS_MAX;
  const trainingScore = Math.max(0, state.training_facility_level) / TRAINING_ITEMS_MAX;
  const academyScore = Math.max(0, state.youth_academy_level) / ACADEMY_ITEMS_MAX;
  const raw =
    (stadiumScore * W_INFRA_STADIUM +
      trainingScore * W_INFRA_TRAINING +
      academyScore * W_INFRA_ACADEMY) *
    100;
  return clampToRange(Math.round(raw), 0, 100);
}

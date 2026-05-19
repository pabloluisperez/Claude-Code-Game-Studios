/**
 * Player lifecycle: injury/suspension status transitions + F7 fitness.
 *
 * Per `design/gdd/player-management.md` §6 (Lesiones) and §F7:
 *   - Injury: status=available → injured; recovery_weeks = rng(1, 6)
 *   - Each tick: recovery_weeks_remaining -= 1; at 0 → status=available
 *   - F7 post-match: fitness -= FITNESS_DECAY_MAX × (min/90) × (1 - stamina/100)
 *   - F7 weekly recovery: fitness += FITNESS_RECOVERY_WEEKLY (no match)
 *
 * Story: PLAYER-MANAGEMENT-005 (TR-PM-005)
 */

import type { SimContext } from '../cascade-types.js';

export const INJURY_MIN_WEEKS = 1;
export const INJURY_MAX_WEEKS = 6;
export const FITNESS_RECOVERY_WEEKLY = 8.0;
export const FITNESS_DECAY_MAX = 15;
export const FITNESS_MIN = 0;
export const FITNESS_MAX = 100;

export type Availability = 'available' | 'injured' | 'suspended' | 'sold' | 'leaving' | 'retiring_soon';

export interface PlayerLifecycleState {
  readonly availability: Availability;
  readonly injuredUntilWeek: number | null;
  readonly fitness: number;
  readonly stamina: number;
}

export interface PlayerLifecyclePatch {
  availability?: Availability;
  injuredUntilWeek?: number | null;
  fitness?: number;
}

/**
 * Apply an injury event. Samples the recovery duration from `ctx.rng()`
 * (single call) and returns the patch for the player.
 *
 * Per ADR-002: exactly one rng() call per invocation to keep determinism stable.
 */
export function applyInjuryEvent(
  player: Readonly<PlayerLifecycleState>,
  currentWeek: number,
  ctx: SimContext,
): PlayerLifecyclePatch {
  const span = INJURY_MAX_WEEKS - INJURY_MIN_WEEKS + 1; // inclusive
  const recoveryWeeks = INJURY_MIN_WEEKS + Math.floor(ctx.rng() * span);
  return {
    availability: 'injured',
    injuredUntilWeek: currentWeek + recoveryWeeks,
  };
}

/**
 * Apply weekly recovery: if `currentWeek` has reached or passed
 * `injuredUntilWeek`, the player becomes available again.
 */
export function applyWeeklyRecovery(
  player: Readonly<PlayerLifecycleState>,
  currentWeek: number,
): PlayerLifecyclePatch {
  if (player.availability !== 'injured' || player.injuredUntilWeek === null) {
    return {};
  }
  if (currentWeek >= player.injuredUntilWeek) {
    return {
      availability: 'available',
      injuredUntilWeek: null,
    };
  }
  return {};
}

/**
 * F7 post-match decay: applied once per match for the player based on minutes played.
 *   fitness_after = fitness - FITNESS_DECAY_MAX × (min/90) × (1 - stamina/100)
 * Clamped to [0, 100].
 */
export function computeFitnessPostMatch(
  fitness: number,
  stamina: number,
  minutesPlayed: number,
): number {
  const decay = FITNESS_DECAY_MAX * (minutesPlayed / 90) * (1 - stamina / 100);
  const next = fitness - decay;
  if (next < FITNESS_MIN) return FITNESS_MIN;
  if (next > FITNESS_MAX) return FITNESS_MAX;
  return Math.round(next * 10) / 10; // 1 decimal precision
}

/**
 * F7 weekly recovery: applied once per week if the player did NOT play.
 *   fitness_next = min(100, fitness + FITNESS_RECOVERY_WEEKLY)
 */
export function computeFitnessRecovery(fitness: number): number {
  const next = fitness + FITNESS_RECOVERY_WEEKLY;
  return Math.min(FITNESS_MAX, next);
}

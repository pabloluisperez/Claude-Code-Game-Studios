/**
 * F2: `duration_weeks` — computes how many week-ticks an upgrade takes.
 *
 * Base duration is per-tier; the Director de Instalaciones staff member
 * modifies the speed (skill 0..100 → multiplier 0.80..1.30, clamped).
 *
 * Per `design/gdd/stadium-upgrades.md §4 F2`. Story STADIUM-UPGRADES-004.
 */

import type { ItemTier } from './types.js';
import { clampToRange } from '../cascade-engine.js';

/**
 * Base duration in weeks per tier (without director modifier).
 *
 * Pablo 2026-05-25: original 2/4/6/8 was unrealistic ("2 semanas para una
 * grada no es nada realista"). Real stadium construction takes months to
 * years; we compress into a tighter band that still feels weighty:
 *
 *   T1 (gradas hormigón basic, 1 cancha de entrenamiento, …)  →   6 weeks (~6 wk = 1.5 months)
 *   T2 (gradas opuestas, césped uniforme, sala técnica, …)    →  12 weeks (~3 months)
 *   T3 (cubiertas, iluminación, gimnasio, …)                  →  20 weeks (~5 months)
 *   T4 (cubierta total, palco VIP, complejo médico, …)        →  36 weeks (~most of a season)
 *
 * The Director-de-Instalaciones multiplier still applies (0.80..1.30 around
 * 1.0 at skill 50), so the effective range with a good director sits around
 * 5/10/16/29 weeks.
 */
export const DURATION_BASE: Record<ItemTier, number> = {
  1: 6,
  2: 12,
  3: 20,
  4: 36,
};

/** Multiplier when director skill is at max (100). Faster build. */
export const DIRECTOR_MULT_MIN = 0.8;
/** Multiplier when director skill is at min (0). Slower build. */
export const DIRECTOR_MULT_MAX = 1.3;

/** Hard floors on the rounded result (clamp). */
export const DUR_MIN = 1;
/** Hard ceiling — even a T4 with a terrible director shouldn't exceed ~1 season. */
export const DUR_MAX = 52;

/**
 * Compute the director multiplier from a skill 0..100.
 *
 * - At skill = 50 → multiplier = 1.0 exactly (neutral).
 * - At skill > 50 → linear interpolation toward DIRECTOR_MULT_MIN (faster).
 * - At skill < 50 → linear interpolation toward DIRECTOR_MULT_MAX (slower).
 * - Null / undefined skill → 1.0 (no director assigned).
 */
function directorMultiplier(skill: number | null | undefined): number {
  if (skill === null || skill === undefined) return 1.0;
  const clamped = clampToRange(skill, 0, 100);
  if (clamped >= 50) {
    return 1.0 - ((clamped - 50) * (1.0 - DIRECTOR_MULT_MIN)) / 50;
  }
  return 1.0 + ((50 - clamped) * (DIRECTOR_MULT_MAX - 1.0)) / 50;
}

export function durationWeeks(item: { tier: ItemTier }, directorSkill: number | null = null): number {
  const m = directorMultiplier(directorSkill);
  return clampToRange(Math.round(DURATION_BASE[item.tier] * m), DUR_MIN, DUR_MAX);
}

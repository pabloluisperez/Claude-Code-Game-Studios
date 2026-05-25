/**
 * F1: `stadium_visual_level` — computes the integer 0..9 used by the
 * `/stadium` close-up sprite picker.
 *
 * Per `design/gdd/stadium-upgrades.md §4 F1`. Pure function. Monotonic in
 * each track input.
 *
 * Story STADIUM-UPGRADES-003.
 */

import type { CompletedItemsByTrack } from './types.js';
import { clampToRange } from '../cascade-engine.js';

/** Max items per stadium track (canonical in catalog YAML). */
export const G_MAX = 8;
export const P_MAX = 8;
export const S_MAX = 8;

/** Track weights (sum = 1.0). Gradas dominate the visual narrative. */
export const W_VISUAL_GRADAS = 0.45;
export const W_VISUAL_PITCH = 0.35;
export const W_VISUAL_SERVICIOS = 0.20;

/**
 * Compute `stadium_visual_level` from completed-items counts in the 3
 * stadium tracks. Returns integer in [0, 9].
 *
 * Why `× 9.99` and not `× 10`: prevents the maximal case
 * (gradas=8, pitch=8, servicios=8) from rounding up to 10 (visual_level is
 * defined as 0..9, not 0..10). Do NOT change to × 10.
 *
 * The function is monotonic: increasing any track's count never decreases
 * the output (property tested in `tests/stadium/visual-level.test.ts`).
 */
export function stadiumVisualLevel(state: CompletedItemsByTrack): number {
  const g = Math.max(0, state.gradas);
  const p = Math.max(0, state.pitch);
  const s = Math.max(0, state.servicios);
  const svlRaw =
    (g / G_MAX) * W_VISUAL_GRADAS +
    (p / P_MAX) * W_VISUAL_PITCH +
    (s / S_MAX) * W_VISUAL_SERVICIOS;
  return clampToRange(Math.floor(svlRaw * 9.99), 0, 9);
}

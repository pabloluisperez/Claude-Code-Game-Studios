/**
 * F-TV3 corruption delta — pure functions for the 8-step TV Tick Order.
 *
 * Per ADR-019 §3: `roundCorruption()` enforces 2-decimal precision after every
 * arithmetic operation, eliminating IEEE 754 drift without DB round-trips.
 *
 * Story: TVR-005
 * Control Manifest: 2026-05-19
 */

import type { TVTier, TVStatus } from './types.js';
import {
  CORRUPTION_DELTA_PER_WEEK,
  CORRUPTION_MAX,
  TV_SCANDAL_THRESHOLD,
} from './constants.js';

/**
 * Rounds a corruption value to 2 decimal places — matches the DB column
 * `numeric(5,2)` precision exactly.
 *
 * IEEE 754 example without this: `59.5 + 0.5 === 60` (works), but
 * `59.85 + 0.5 === 60.349999999999994` (drifts). Wrapping every arithmetic
 * result in `roundCorruption()` collapses drift to the second decimal.
 */
export function roundCorruption(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Drizzle returns `numeric` columns as strings (`"57.50"`). Always parse
 * before arithmetic.
 */
export function parseCorruption(dbValue: string | number): number {
  return typeof dbValue === 'string' ? parseFloat(dbValue) : dbValue;
}

/**
 * F-TV3 paso 2 — apply the per-tier delta to corruption_exposure.
 * Returns prevCorruption unchanged if status !== 'ACTIVE'.
 *
 * Exported for unit tests per AC-TV-22a.
 */
export function applyTVCorruptionDelta(
  tier: TVTier,
  prevCorruption: number,
  status: TVStatus,
): number {
  if (status !== 'ACTIVE') return prevCorruption;
  const raw = prevCorruption + CORRUPTION_DELTA_PER_WEEK[tier];
  // Clamp [0, CORRUPTION_MAX], then round to 2 decimals.
  return roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, raw)));
}

/**
 * F-TV3 paso 3 / paso 7 — evaluate whether a value crossed the threshold
 * upward in this tick. Pure boolean — false if prev was already at/above
 * threshold (no double-cancellation).
 *
 * Exported for AC-TV-32 unit tests covering all 7 boundary cases.
 */
export function evaluateThresholdCrossings(
  prev: number,
  next: number,
  threshold: number,
): boolean {
  return prev < threshold && next >= threshold;
}

/** Convenience: evaluate vs the TV_SCANDAL_THRESHOLD (60). */
export function crossedTVScandalThreshold(prev: number, next: number): boolean {
  return evaluateThresholdCrossings(prev, next, TV_SCANDAL_THRESHOLD);
}

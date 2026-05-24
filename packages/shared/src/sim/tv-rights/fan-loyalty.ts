/**
 * F-TV4 — fan_loyalty pathway into fan_attendance_effective.
 *
 * Per ADR-019 §2 + GDD F-TV4:
 *   fan_attendance_effective = min(1.0, fan_attendance × (1 + fan_loyalty × 0.005))
 *
 * Clamp at 1.0 prevents fan_attendance_effective from exceeding 100% capacity
 * — required to align with match_day_revenue output_range in entities.yaml.
 *
 * Story: TVR-010
 * Control Manifest: 2026-05-19
 */

import { FAN_LOYALTY_ATTENDANCE_FACTOR, FAN_LOYALTY_CAP, FAN_LOYALTY_PER_REJECTION } from './constants.js';

/**
 * Compute the loyalty-boosted fan_attendance for matchday revenue calculations.
 *
 * @param fanAttendance Base fan_attendance ∈ [0, 1.0] (decimal — share of stadium capacity).
 * @param fanLoyalty Accumulated loyalty ∈ [0, 50]. Values above the cap are
 *   treated as 50 by the caller (managers table column has no DB cap).
 * @returns Boosted fan_attendance ∈ [0, 1.0]. Clamped at 1.0.
 */
export function calculateFanAttendanceEffective(
  fanAttendance: number,
  fanLoyalty: number,
): number {
  const multiplier = 1 + fanLoyalty * FAN_LOYALTY_ATTENDANCE_FACTOR;
  return Math.min(1.0, fanAttendance * multiplier);
}

/**
 * Apply a single rejection increment to fan_loyalty, capped at FAN_LOYALTY_CAP.
 *
 * Used by both POST /api/tv/reject and any future rejection-driven mechanic.
 */
export function applyFanLoyaltyRejection(currentLoyalty: number): number {
  return Math.min(FAN_LOYALTY_CAP, currentLoyalty + FAN_LOYALTY_PER_REJECTION);
}

/**
 * Unit tests for F-TV4 calculateFanAttendanceEffective + applyFanLoyaltyRejection.
 *
 * Story: TVR-010
 * GDD ACs: AC-TV-46 + boundary tests for clamp at 1.0 and FAN_LOYALTY_CAP=50.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFanAttendanceEffective,
  applyFanLoyaltyRejection,
} from '../../src/sim/tv-rights/fan-loyalty.js';

describe('AC-TV-46 — calculateFanAttendanceEffective', () => {
  it('test_loyalty_0_returns_attendance_unchanged', () => {
    expect(calculateFanAttendanceEffective(0.60, 0)).toBe(0.60);
  });

  it('test_loyalty_10_attendance_0_60_returns_0_63', () => {
    // 0.60 × (1 + 10 × 0.005) = 0.60 × 1.05 = 0.63
    expect(calculateFanAttendanceEffective(0.60, 10)).toBeCloseTo(0.63, 5);
  });

  it('test_loyalty_30_attendance_0_60_returns_0_69', () => {
    // 0.60 × 1.15 = 0.69
    expect(calculateFanAttendanceEffective(0.60, 30)).toBeCloseTo(0.69, 5);
  });

  it('test_loyalty_50_attendance_0_60_returns_0_75', () => {
    // 0.60 × 1.25 = 0.75
    expect(calculateFanAttendanceEffective(0.60, 50)).toBeCloseTo(0.75, 5);
  });
});

describe('Clamp invariant — fan_attendance_effective ≤ 1.0', () => {
  it('test_loyalty_50_attendance_1_0_clamps_to_1_0', () => {
    // 1.0 × 1.25 = 1.25 → clamped to 1.0
    expect(calculateFanAttendanceEffective(1.0, 50)).toBe(1.0);
  });

  it('test_loyalty_50_attendance_0_9_clamps_to_1_0', () => {
    // 0.9 × 1.25 = 1.125 → clamped to 1.0
    expect(calculateFanAttendanceEffective(0.9, 50)).toBe(1.0);
  });

  it('test_loyalty_10_attendance_0_95_clamps_to_0_9975_or_1_0', () => {
    // 0.95 × 1.05 = 0.9975 → not clamped (still ≤ 1.0)
    expect(calculateFanAttendanceEffective(0.95, 10)).toBeCloseTo(0.9975, 5);
  });

  it('test_loyalty_20_attendance_0_95_clamps_to_1_0', () => {
    // 0.95 × 1.10 = 1.045 → clamped to 1.0
    expect(calculateFanAttendanceEffective(0.95, 20)).toBe(1.0);
  });

  it('test_zero_attendance_stays_zero_regardless_of_loyalty', () => {
    expect(calculateFanAttendanceEffective(0, 50)).toBe(0);
    expect(calculateFanAttendanceEffective(0, 0)).toBe(0);
  });
});

describe('applyFanLoyaltyRejection — cap at FAN_LOYALTY_CAP=50', () => {
  it('test_rejection_from_0_yields_10', () => {
    expect(applyFanLoyaltyRejection(0)).toBe(10);
  });

  it('test_rejection_from_30_yields_40', () => {
    expect(applyFanLoyaltyRejection(30)).toBe(40);
  });

  it('test_rejection_from_45_clamps_at_50', () => {
    expect(applyFanLoyaltyRejection(45)).toBe(50);
  });

  it('test_rejection_from_50_stays_50', () => {
    expect(applyFanLoyaltyRejection(50)).toBe(50);
  });

  it('test_rejection_from_above_cap_stays_50', () => {
    // Defensive: if somehow loyalty=60 (shouldn't happen, but guarding)
    expect(applyFanLoyaltyRejection(60)).toBe(50);
  });
});

describe('AC-TV-46 part 4 — boundary clamp behavior', () => {
  it('test_loyalty_50_attendance_0_8_returns_exactly_1_0_at_clamp_boundary', () => {
    // 0.8 × 1.25 = 1.0 exactly → no clamp needed, returns 1.0
    expect(calculateFanAttendanceEffective(0.8, 50)).toBe(1.0);
  });

  it('test_loyalty_50_attendance_0_799_returns_below_1_0', () => {
    // 0.799 × 1.25 = 0.99875 → below clamp
    expect(calculateFanAttendanceEffective(0.799, 50)).toBeCloseTo(0.99875, 5);
  });
});

/**
 * Unit tests for F-TV3 pure functions: applyTVCorruptionDelta + evaluateThresholdCrossings + roundCorruption.
 *
 * Story: TVR-005
 * GDD ACs: AC-TV-22a, AC-TV-30, AC-TV-32, AC-TV-33, AC-TV-34, AC-TV-52 (cliff boundary).
 */

import { describe, it, expect } from 'vitest';
import {
  applyTVCorruptionDelta,
  evaluateThresholdCrossings,
  crossedTVScandalThreshold,
  roundCorruption,
  parseCorruption,
} from '../../src/sim/tv-rights/corruption-delta.js';

describe('AC-TV-22a — applyTVCorruptionDelta by tier (ACTIVE contracts)', () => {
  it('test_delta_local_active_decrements_by_0_5', () => {
    expect(applyTVCorruptionDelta('LOCAL', 10.0, 'ACTIVE')).toBe(9.5);
  });

  it('test_delta_regional_active_increments_by_0_5', () => {
    expect(applyTVCorruptionDelta('REGIONAL', 10.0, 'ACTIVE')).toBe(10.5);
  });

  it('test_delta_nacional_active_increments_by_1_5', () => {
    expect(applyTVCorruptionDelta('NACIONAL', 10.0, 'ACTIVE')).toBe(11.5);
  });
});

describe('AC-TV-22a — applyTVCorruptionDelta with non-ACTIVE status returns prev unchanged', () => {
  it('test_delta_cancelled_status_returns_prev_unchanged', () => {
    expect(applyTVCorruptionDelta('NACIONAL', 30.0, 'CANCELLED')).toBe(30.0);
  });

  it('test_delta_expired_status_returns_prev_unchanged', () => {
    expect(applyTVCorruptionDelta('REGIONAL', 30.0, 'EXPIRED')).toBe(30.0);
  });

  it('test_delta_none_status_returns_prev_unchanged', () => {
    expect(applyTVCorruptionDelta('LOCAL', 30.0, 'NONE')).toBe(30.0);
  });
});

describe('AC-TV-33 / AC-TV-34 — floor clamp at 0', () => {
  it('test_delta_local_at_0_3_clamps_to_0_AC_TV_33', () => {
    // max(0, 0.3 - 0.5) = max(0, -0.2) = 0
    expect(applyTVCorruptionDelta('LOCAL', 0.3, 'ACTIVE')).toBe(0);
  });

  it('test_delta_local_at_0_stays_0_AC_TV_34', () => {
    expect(applyTVCorruptionDelta('LOCAL', 0, 'ACTIVE')).toBe(0);
  });
});

describe('Ceiling clamp at CORRUPTION_MAX=100', () => {
  it('test_delta_nacional_at_99_clamps_to_100', () => {
    expect(applyTVCorruptionDelta('NACIONAL', 99.0, 'ACTIVE')).toBe(100);
  });

  it('test_delta_nacional_at_100_stays_100', () => {
    expect(applyTVCorruptionDelta('NACIONAL', 100, 'ACTIVE')).toBe(100);
  });
});

describe('AC-TV-30 — LOCAL ACTIVE at 60.5 decrements without threshold crossing', () => {
  it('test_local_at_60_5_decrements_to_60_no_upward_cross', () => {
    const next = applyTVCorruptionDelta('LOCAL', 60.5, 'ACTIVE');
    expect(next).toBe(60.0);
    // crossed_upward = (60.5 < 60) AND (60.0 >= 60) = false AND true = false
    expect(crossedTVScandalThreshold(60.5, next)).toBe(false);
  });
});

describe('AC-TV-32 — evaluateThresholdCrossings (7 GDD cases)', () => {
  it('test_threshold_crossing_59_5_to_60_0_returns_true', () => {
    expect(evaluateThresholdCrossings(59.5, 60.0, 60)).toBe(true);
  });

  it('test_threshold_crossing_59_5_to_60_5_returns_true', () => {
    expect(evaluateThresholdCrossings(59.5, 60.5, 60)).toBe(true);
  });

  it('test_threshold_60_0_to_60_5_returns_false_prev_already_at_threshold', () => {
    expect(evaluateThresholdCrossings(60.0, 60.5, 60)).toBe(false);
  });

  it('test_threshold_65_0_to_65_5_returns_false_prev_above_threshold', () => {
    expect(evaluateThresholdCrossings(65.0, 65.5, 60)).toBe(false);
  });

  it('test_threshold_60_5_to_60_0_returns_false_downward_cross', () => {
    expect(evaluateThresholdCrossings(60.5, 60.0, 60)).toBe(false);
  });

  it('test_threshold_60_5_to_60_2_returns_false_descent_both_above', () => {
    expect(evaluateThresholdCrossings(60.5, 60.2, 60)).toBe(false);
  });

  it('test_threshold_50_0_to_55_0_returns_false_both_below', () => {
    expect(evaluateThresholdCrossings(50.0, 55.0, 60)).toBe(false);
  });
});

describe('roundCorruption — precision invariant', () => {
  it('test_round_corruption_drifty_value_collapses_to_60', () => {
    expect(roundCorruption(59.9999999)).toBe(60.0);
  });

  it('test_round_corruption_preserves_clean_value', () => {
    expect(roundCorruption(59.9)).toBe(59.9);
  });

  it('test_round_corruption_two_decimal_truncation', () => {
    expect(roundCorruption(0.005)).toBe(0.01);
    expect(roundCorruption(57.125)).toBe(57.13);
  });

  it('test_round_corruption_zero_stays_zero', () => {
    expect(roundCorruption(0)).toBe(0);
  });
});

describe('parseCorruption — Drizzle numeric string handling', () => {
  it('test_parse_corruption_from_string', () => {
    expect(parseCorruption('57.50')).toBe(57.5);
  });

  it('test_parse_corruption_passes_through_number', () => {
    expect(parseCorruption(57.5)).toBe(57.5);
  });

  it('test_parse_corruption_from_string_with_leading_zero', () => {
    expect(parseCorruption('0.30')).toBe(0.30);
  });
});

describe('AC-TV-52 — NACIONAL cliff boundary at corruption=3.0', () => {
  it('test_nacional_corruption_3_0_cancels_at_week_38', () => {
    // Simulate 38 weeks of +1.5 starting from 3.0
    let corruption = 3.0;
    let crossed = false;
    for (let week = 1; week <= 38; week += 1) {
      const next = applyTVCorruptionDelta('NACIONAL', corruption, 'ACTIVE');
      if (crossedTVScandalThreshold(corruption, next)) {
        crossed = true;
        expect(week).toBe(38);
        expect(next).toBe(60.0);
        break;
      }
      corruption = next;
    }
    expect(crossed).toBe(true);
  });

  it('test_nacional_corruption_2_9_survives_full_season', () => {
    let corruption = 2.9;
    let crossed = false;
    for (let week = 1; week <= 38; week += 1) {
      const next = applyTVCorruptionDelta('NACIONAL', corruption, 'ACTIVE');
      if (crossedTVScandalThreshold(corruption, next)) {
        crossed = true;
        break;
      }
      corruption = next;
    }
    expect(crossed).toBe(false);
    // After 38 weeks: 2.9 + 38×1.5 = 2.9 + 57.0 = 59.9
    expect(corruption).toBe(59.9);
  });
});

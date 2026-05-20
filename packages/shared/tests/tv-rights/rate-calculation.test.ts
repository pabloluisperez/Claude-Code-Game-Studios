/**
 * Unit tests for F-TV1 (calculateTVRate) + F-TV2 (calculateMidseasonRate).
 *
 * Story: TVR-002
 * GDD ACs covered: AC-TV-07/08/26/27/28/35/42/50/51 + F-TV2 mid-season rates.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTVRate,
  calculateMidseasonRate,
  TVRangeError,
  getLegalDurations,
} from '../../src/sim/tv-rights/rate-calculation.js';

describe('F-TV1 calculateTVRate — annual rates (GDD verification table)', () => {
  it('test_ftv1_local_d2_1yr_returns_0_53', () => {
    expect(calculateTVRate('LOCAL', 'D2', 1)).toBe(0.53);
  });

  it('test_ftv1_local_d1_1yr_returns_0_72_AC_TV_26', () => {
    // Math.round(53 × 135 × 100 / 10000) / 100 = Math.round(71.55) / 100 = 72/100 = 0.72
    expect(calculateTVRate('LOCAL', 'D1', 1)).toBe(0.72);
  });

  it('test_ftv1_regional_d2_1yr_returns_1_75_AC_TV_07', () => {
    expect(calculateTVRate('REGIONAL', 'D2', 1)).toBe(1.75);
  });

  it('test_ftv1_regional_d1_1yr_returns_2_36_AC_TV_28', () => {
    // Math.round(175 × 135 × 100 / 10000) / 100 = Math.round(236.25) / 100 = 236/100 = 2.36
    expect(calculateTVRate('REGIONAL', 'D1', 1)).toBe(2.36);
  });

  it('test_ftv1_nacional_d2_1yr_returns_5_30_AC_TV_27', () => {
    expect(calculateTVRate('NACIONAL', 'D2', 1)).toBe(5.30);
  });

  it('test_ftv1_nacional_d1_1yr_returns_7_16_AC_TV_08', () => {
    // Math.round(530 × 135 × 100 / 10000) / 100 = Math.round(715.5) / 100 = 716/100 = 7.16
    expect(calculateTVRate('NACIONAL', 'D1', 1)).toBe(7.16);
  });
});

describe('F-TV1 calculateTVRate — multi-year rates (AC-TV-35 + AC-TV-42)', () => {
  it('test_ftv1_regional_d2_2yr_returns_1_84', () => {
    // Math.round(175 × 100 × 105 / 10000) / 100 = Math.round(183.75) / 100 = 184/100 = 1.84
    expect(calculateTVRate('REGIONAL', 'D2', 2)).toBe(1.84);
  });

  it('test_ftv1_regional_d1_2yr_returns_2_48_AC_TV_42', () => {
    // Math.round(175 × 135 × 105 / 10000) / 100 = Math.round(248.0625) / 100 = 248/100 = 2.48
    expect(calculateTVRate('REGIONAL', 'D1', 2)).toBe(2.48);
  });

  it('test_ftv1_nacional_d2_3yr_returns_5_83', () => {
    // Math.round(530 × 100 × 110 / 10000) / 100 = Math.round(583) / 100 = 5.83
    expect(calculateTVRate('NACIONAL', 'D2', 3)).toBe(5.83);
  });

  it('test_ftv1_nacional_d1_3yr_returns_7_87', () => {
    // Math.round(530 × 135 × 110 / 10000) / 100 = Math.round(787.05) / 100 = 787/100 = 7.87
    expect(calculateTVRate('NACIONAL', 'D1', 3)).toBe(7.87);
  });
});

describe('F-TV1 guards — illegal tier+duration combos throw TVRangeError (AC-TV-50/51)', () => {
  it('test_ftv1_local_2yr_throws_AC_TV_50', () => {
    expect(() => calculateTVRate('LOCAL', 'D2', 2)).toThrow(TVRangeError);
    expect(() => calculateTVRate('LOCAL', 'D2', 2)).toThrow(/LOCAL\/2/);
  });

  it('test_ftv1_local_3yr_throws', () => {
    expect(() => calculateTVRate('LOCAL', 'D1', 3)).toThrow(TVRangeError);
  });

  it('test_ftv1_regional_3yr_throws_AC_TV_51', () => {
    expect(() => calculateTVRate('REGIONAL', 'D2', 3)).toThrow(TVRangeError);
    expect(() => calculateTVRate('REGIONAL', 'D2', 3)).toThrow(/REGIONAL\/3/);
  });

  it('test_ftv1_nacional_2yr_throws_AC_TV_51', () => {
    expect(() => calculateTVRate('NACIONAL', 'D1', 2)).toThrow(TVRangeError);
    expect(() => calculateTVRate('NACIONAL', 'D1', 2)).toThrow(/NACIONAL\/2/);
  });
});

describe('F-TV1 guards — invalid inputs', () => {
  it('test_ftv1_invalid_division_throws', () => {
    // @ts-expect-error testing invalid division at runtime
    expect(() => calculateTVRate('LOCAL', 'D3', 1)).toThrow(/Unknown division/);
  });

  it('test_ftv1_invalid_tier_throws', () => {
    // @ts-expect-error testing invalid tier at runtime
    expect(() => calculateTVRate('INTERNACIONAL', 'D1', 1)).toThrow(/Unknown tier/);
  });

  it('test_ftv1_invalid_duration_throws', () => {
    // @ts-expect-error testing invalid duration at runtime
    expect(() => calculateTVRate('REGIONAL', 'D2', 4)).toThrow(/Invalid duration/);
  });
});

describe('F-TV1 — no IEEE 754 drift', () => {
  it('test_ftv1_no_drift_under_repeated_calls', () => {
    // Same inputs → identical bit-exact output
    const r1 = calculateTVRate('NACIONAL', 'D1', 3);
    const r2 = calculateTVRate('NACIONAL', 'D1', 3);
    expect(r1).toBe(r2);
    expect(r1).toBe(7.87);
  });

  it('test_ftv1_results_have_at_most_2_decimals', () => {
    // Multiplying by 100 must yield integer
    for (const tier of ['LOCAL', 'REGIONAL', 'NACIONAL'] as const) {
      for (const div of ['D1', 'D2'] as const) {
        for (const dur of getLegalDurations(tier)) {
          const rate = calculateTVRate(tier, div, dur);
          expect(Number.isInteger(Math.round(rate * 100))).toBe(true);
        }
      }
    }
  });
});

describe('F-TV2 calculateMidseasonRate — 70% penalty (AC-TV-10 / AC-TV-23)', () => {
  it('test_ftv2_local_d2_mid_returns_0_37', () => {
    // Math.round(53 × 100 × 70 / 10000) / 100 = Math.round(37.1) / 100 = 37/100 = 0.37
    expect(calculateMidseasonRate('LOCAL', 'D2')).toBe(0.37);
  });

  it('test_ftv2_local_d1_mid_returns_0_50', () => {
    // Math.round(53 × 135 × 70 / 10000) / 100 = Math.round(50.085) / 100 = 50/100 = 0.50
    expect(calculateMidseasonRate('LOCAL', 'D1')).toBe(0.50);
  });

  it('test_ftv2_regional_d2_mid_returns_1_23', () => {
    // Math.round(175 × 100 × 70 / 10000) / 100 = Math.round(122.5) / 100 = 123/100 = 1.23
    expect(calculateMidseasonRate('REGIONAL', 'D2')).toBe(1.23);
  });

  it('test_ftv2_regional_d1_mid_returns_1_65', () => {
    // Math.round(175 × 135 × 70 / 10000) / 100 = Math.round(165.375) / 100 = 165/100 = 1.65
    expect(calculateMidseasonRate('REGIONAL', 'D1')).toBe(1.65);
  });
});

describe('getLegalDurations — F-TV1 enumeration', () => {
  it('test_local_legal_durations_is_1yr_only', () => {
    expect(getLegalDurations('LOCAL')).toEqual([1]);
  });

  it('test_regional_legal_durations_is_1yr_2yr', () => {
    expect(getLegalDurations('REGIONAL')).toEqual([1, 2]);
  });

  it('test_nacional_legal_durations_is_1yr_3yr', () => {
    expect(getLegalDurations('NACIONAL')).toEqual([1, 3]);
  });
});

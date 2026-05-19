/**
 * Unit tests for F10 market wage + F11 morale update.
 * Story: PLAYER-MANAGEMENT-007
 * Acceptance Criteria: AC-PM-23, AC-PM-24
 */

import { describe, it, expect } from 'vitest';
import {
  MORALE_MAX,
  MORALE_MIN,
  WAGE_VALUE_RATIO,
  computeMarketWageF10,
  computeMoraleF11,
} from '../../src/sim/player-management/morale.js';

describe('F10 — computeMarketWageF10', () => {
  it('test_market_wage_proportional', () => {
    expect(computeMarketWageF10(10)).toBeCloseTo(0.2, 5);
  });

  it('test_constant', () => {
    expect(WAGE_VALUE_RATIO).toBeCloseTo(0.02, 5);
  });
});

describe('F11 — computeMoraleF11', () => {
  it('test_ac_pm_23_max_positive_delta', () => {
    // morale=65, win (+3), wage=0.40 ≥ market×0.9=0.396 (+2), minutes=45≥30 (+1) → +6 → 71
    expect(
      computeMoraleF11({
        morale: 65,
        matchResult: 'win',
        wage: 0.4,
        marketWage: 0.44,
        minutesPlayed: 45,
        status: 'available',
      }),
    ).toBe(71);
  });

  it('test_ac_pm_24_max_negative_delta', () => {
    // morale=15, loss (-2), wage=0.05 < market×0.6=0.30 (-3), minutes=0 (-1) → -6 → 9
    expect(
      computeMoraleF11({
        morale: 15,
        matchResult: 'loss',
        wage: 0.05,
        marketWage: 0.5,
        minutesPlayed: 0,
        status: 'available',
      }),
    ).toBe(9);
  });

  it('test_draw_recompute', () => {
    expect(
      computeMoraleF11({
        morale: 50,
        matchResult: 'draw',
        wage: 0.3,
        marketWage: 0.3,
        minutesPlayed: 60,
        status: 'available',
      }),
    ).toBe(53);
  });

  it('test_injured_status_no_playing_time_penalty', () => {
    // morale=5, loss (-2), wage=0.20 vs market=0.30 (0.20 < 0.30×0.6=0.18 → false; 0.20 ≥ 0.27 → false; so 0): 0, minutes=0 status=injured (no penalty) → -2 → 3
    expect(
      computeMoraleF11({
        morale: 5,
        matchResult: 'loss',
        wage: 0.2,
        marketWage: 0.3,
        minutesPlayed: 0,
        status: 'injured',
      }),
    ).toBe(3);
  });

  it('test_clamp_at_zero', () => {
    expect(
      computeMoraleF11({
        morale: 2,
        matchResult: 'loss',
        wage: 0.01,
        marketWage: 0.5,
        minutesPlayed: 0,
        status: 'available',
      }),
    ).toBe(MORALE_MIN);
  });

  it('test_clamp_at_100', () => {
    expect(
      computeMoraleF11({
        morale: 99,
        matchResult: 'win',
        wage: 1.0,
        marketWage: 0.5,
        minutesPlayed: 90,
        status: 'available',
      }),
    ).toBe(MORALE_MAX);
  });

  it('test_no_match_no_result_bonus', () => {
    expect(
      computeMoraleF11({
        morale: 60,
        matchResult: 'none',
        wage: 0.3,
        marketWage: 0.3,
        minutesPlayed: 0,
        status: 'available',
      }),
    ).toBe(60 + 2 - 1); // wage +2, minutes -1 → +1 → 61
  });
});

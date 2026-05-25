/**
 * Tests for museum formulas F1-F5. Story TROPHIES-HISTORY-002.
 */

import { describe, it, expect } from 'vitest';
import {
  legendaryMatchQualifies,
  topPlayerFlag,
  legendTransferQualifies,
  museumObjectsCount,
  museumDensity,
} from '../../src/sim/museum/formulas.js';

describe('F1 legendaryMatchQualifies', () => {
  const base = {
    goalsFor: 1,
    goalsAgainst: 0,
    fan_momentum_delta: 0,
    is_derby: false,
    is_cup_final: false,
    result: 'win' as const,
  };

  it('test_legendary_high_momentum_delta_qualifies', () => {
    expect(legendaryMatchQualifies({ ...base, fan_momentum_delta: 16 })).toBe(true);
  });

  it('test_legendary_landslide_goal_diff_qualifies', () => {
    expect(legendaryMatchQualifies({ ...base, goalsFor: 5, goalsAgainst: 0, fan_momentum_delta: 5 })).toBe(true);
  });

  it('test_legendary_derby_win_qualifies', () => {
    expect(legendaryMatchQualifies({ ...base, is_derby: true, result: 'win' })).toBe(true);
  });

  it('test_legendary_cup_final_qualifies', () => {
    expect(legendaryMatchQualifies({ ...base, is_cup_final: true })).toBe(true);
  });

  it('test_legendary_mundane_match_does_not_qualify', () => {
    expect(legendaryMatchQualifies({ ...base, fan_momentum_delta: 10 })).toBe(false);
  });

  it('test_legendary_derby_loss_does_not_qualify', () => {
    expect(legendaryMatchQualifies({ ...base, is_derby: true, result: 'loss' })).toBe(false);
  });

  it('test_legendary_threshold_exact_boundary_does_not_qualify', () => {
    // > LEGENDARY_THRESHOLD (15), so 15 itself should NOT qualify.
    expect(legendaryMatchQualifies({ ...base, fan_momentum_delta: 15 })).toBe(false);
  });
});

describe('F2 topPlayerFlag', () => {
  it('test_top_player_at_min_weeks_qualifies', () => {
    expect(topPlayerFlag({ max_consecutive_weeks_in_top5: 20 })).toBe(true);
  });

  it('test_top_player_below_min_weeks_does_not_qualify', () => {
    expect(topPlayerFlag({ max_consecutive_weeks_in_top5: 19 })).toBe(false);
  });

  it('test_top_player_zero_weeks_does_not_qualify', () => {
    expect(topPlayerFlag({ max_consecutive_weeks_in_top5: 0 })).toBe(false);
  });
});

describe('F3 legendTransferQualifies', () => {
  const incoming = { value_eur_k: 600, direction: 'in' as const };

  it('test_legend_transfer_d2_threshold', () => {
    expect(legendTransferQualifies(incoming, 'D2')).toBe(true); // 600 >= 500
  });

  it('test_legend_transfer_d1_higher_threshold_rejects_d2_legend', () => {
    expect(legendTransferQualifies(incoming, 'D1')).toBe(false); // 600 < 2000
  });

  it('test_legend_transfer_d1_qualifies_at_threshold', () => {
    expect(legendTransferQualifies({ value_eur_k: 2000, direction: 'in' }, 'D1')).toBe(true);
  });
});

describe('F4 museumObjectsCount + F5 museumDensity', () => {
  it('test_museum_objects_count_sums_all_categories', () => {
    expect(
      museumObjectsCount({
        trophies: 5,
        banners: 10,
        legendTransfers: 3,
        financialMilestones: 2,
        stadiumHistory: 8,
      }),
    ).toBe(28);
  });

  it('test_museum_objects_count_zero_when_empty', () => {
    expect(
      museumObjectsCount({
        trophies: 0,
        banners: 0,
        legendTransfers: 0,
        financialMilestones: 0,
        stadiumHistory: 0,
      }),
    ).toBe(0);
  });

  it('test_museum_density_half_at_50_objects', () => {
    expect(museumDensity(50)).toBe(0.5);
  });

  it('test_museum_density_capped_at_one', () => {
    expect(museumDensity(150)).toBe(1.0);
  });

  it('test_museum_density_zero_when_no_objects', () => {
    expect(museumDensity(0)).toBe(0);
  });
});

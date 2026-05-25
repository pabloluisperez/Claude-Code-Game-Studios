/**
 * Tests for F4 costOfItem. Story STADIUM-UPGRADES-004.
 */

import { describe, it, expect } from 'vitest';
import {
  costOfItem,
  BASE_COST_TIER,
  TRACK_MULTIPLIER,
} from '../../src/sim/stadium/cost.js';
import type { ItemTier, Track } from '../../src/sim/stadium/types.js';

describe('F4 costOfItem', () => {
  it('test_cost_t2_gradas_no_modifiers_returns_77', () => {
    // AC-SU-18: 55 × 1.40 = 77
    expect(costOfItem({ tier: 2, track: 'gradas' })).toBe(77);
  });

  it('test_cost_t4_gradas_with_construction_returns_405', () => {
    // AC-SU-19a: 340 × 1.40 = 476; 476 × 0.85 = 404.6 → round 405
    expect(costOfItem({ tier: 4, track: 'gradas' }, { constructionSkill: true })).toBe(405);
  });

  it('test_cost_t4_gradas_with_subsidy_and_construction_returns_283', () => {
    // AC-SU-19b: 476 × 0.85 × 0.70 = 283.22 → round 283
    expect(
      costOfItem({ tier: 4, track: 'gradas' }, { constructionSkill: true, subsidyPct: 0.3 }),
    ).toBe(283);
  });

  it('test_cost_all_20_combinations_within_expected_range', () => {
    for (const tier of [1, 2, 3, 4] as ItemTier[]) {
      for (const track of Object.keys(TRACK_MULTIPLIER) as Track[]) {
        const c = costOfItem({ tier, track });
        expect(c).toBeGreaterThanOrEqual(12);
        expect(c).toBeLessThanOrEqual(476);
      }
    }
  });

  it('test_cost_modifiers_compose_multiplicatively', () => {
    const base = costOfItem({ tier: 4, track: 'gradas' });
    const withC = costOfItem({ tier: 4, track: 'gradas' }, { constructionSkill: true });
    const withS = costOfItem({ tier: 4, track: 'gradas' }, { subsidyPct: 0.3 });
    const withBoth = costOfItem(
      { tier: 4, track: 'gradas' },
      { constructionSkill: true, subsidyPct: 0.3 },
    );

    // withBoth should be less than either standalone modifier
    expect(withBoth).toBeLessThan(withC);
    expect(withBoth).toBeLessThan(withS);
    // Sanity: base is greatest, withBoth is smallest
    expect(base).toBeGreaterThan(withC);
    expect(withC).toBeGreaterThan(withBoth);
  });

  it('test_cost_100pct_subsidy_returns_zero', () => {
    // Edge case from GDD note: subsidy=1.0 → cost=0 (free obra)
    expect(costOfItem({ tier: 4, track: 'gradas' }, { subsidyPct: 1.0 })).toBe(0);
  });

  it('test_base_cost_table_matches_spec', () => {
    expect(BASE_COST_TIER[1]).toBe(15);
    expect(BASE_COST_TIER[2]).toBe(55);
    expect(BASE_COST_TIER[3]).toBe(130);
    expect(BASE_COST_TIER[4]).toBe(340);
  });
});

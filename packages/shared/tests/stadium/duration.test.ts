/**
 * Tests for F2 durationWeeks. Story STADIUM-UPGRADES-004.
 */

import { describe, it, expect } from 'vitest';
import {
  durationWeeks,
  DURATION_BASE,
  DUR_MIN,
  DUR_MAX,
} from '../../src/sim/stadium/duration.js';
import type { ItemTier } from '../../src/sim/stadium/types.js';

describe('F2 durationWeeks', () => {
  it('test_duration_t3_skill_80_returns_5', () => {
    // AC-SU-12: round(6 × (1.0 - 30 × 0.20 / 50)) = round(6 × 0.88) = round(5.28) = 5
    expect(durationWeeks({ tier: 3 }, 80)).toBe(5);
  });

  it('test_duration_t4_skill_15_returns_10', () => {
    // AC-SU-13: round(8 × (1.0 + 35 × 0.30 / 50)) = round(8 × 1.21) = round(9.68) = 10
    expect(durationWeeks({ tier: 4 }, 15)).toBe(10);
  });

  it('test_duration_t1_no_director_returns_2', () => {
    // AC-SU-14: null skill → multiplier 1.0 → 2 × 1.0 = 2
    expect(durationWeeks({ tier: 1 })).toBe(2);
  });

  it('test_duration_t1_skill_100_returns_2_via_floor_clamp', () => {
    // AC-SU-15: 2 × 0.80 = 1.6 → round = 2 (no DUR_MIN clamp needed)
    expect(durationWeeks({ tier: 1 }, 100)).toBe(2);
  });

  it('test_duration_property_any_skill_returns_integer_within_clamp', () => {
    for (let i = 0; i < 200; i++) {
      const skill = Math.floor(Math.random() * 101);
      const tier = ((Math.floor(Math.random() * 4) + 1) as ItemTier);
      const d = durationWeeks({ tier }, skill);
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(DUR_MIN);
      expect(d).toBeLessThanOrEqual(DUR_MAX);
    }
  });

  it('test_duration_skill_50_returns_exact_base', () => {
    // Boundary: skill=50 → multiplier=1.0 exactly, no rounding bias.
    for (const tier of [1, 2, 3, 4] as ItemTier[]) {
      expect(durationWeeks({ tier }, 50)).toBe(DURATION_BASE[tier]);
    }
  });

  it('test_duration_defensive_clamp_on_out_of_range_skill', () => {
    // Skill > 100 should clamp to 100, < 0 should clamp to 0
    expect(durationWeeks({ tier: 2 }, 150)).toBe(durationWeeks({ tier: 2 }, 100));
    expect(durationWeeks({ tier: 2 }, -50)).toBe(durationWeeks({ tier: 2 }, 0));
  });
});

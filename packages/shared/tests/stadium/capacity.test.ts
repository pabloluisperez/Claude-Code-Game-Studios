/**
 * Tests for F5 stadiumCapacity. Story STADIUM-UPGRADES-004.
 */

import { describe, it, expect } from 'vitest';
import {
  stadiumCapacity,
  STADIUM_CAPACITY_BASE,
  CAPACITY_PER_GRADA_ITEM,
} from '../../src/sim/stadium/capacity.js';
import type { ItemTier } from '../../src/sim/stadium/types.js';

describe('F5 stadiumCapacity', () => {
  it('test_capacity_d2_no_upgrades_returns_6000', () => {
    expect(stadiumCapacity('D2', { 1: 0, 2: 0, 3: 0, 4: 0 })).toBe(6000);
  });

  it('test_capacity_d1_with_all_8_gradas_returns_25000', () => {
    // 12000 + 2×700 + 2×1100 + 2×2000 + 2×2700 = 12000 + 1400 + 2200 + 4000 + 5400 = 25000
    expect(stadiumCapacity('D1', { 1: 2, 2: 2, 3: 2, 4: 2 })).toBe(25000);
  });

  it('test_capacity_d2_with_all_8_gradas_returns_19000', () => {
    expect(stadiumCapacity('D2', { 1: 2, 2: 2, 3: 2, 4: 2 })).toBe(19000);
  });

  it('test_capacity_n1_only_adds_1400', () => {
    expect(stadiumCapacity('D2', { 1: 2, 2: 0, 3: 0, 4: 0 })).toBe(6000 + 1400);
  });

  it('test_capacity_each_tier_contributes_exactly_per_constant', () => {
    for (const tier of [1, 2, 3, 4] as ItemTier[]) {
      const base = stadiumCapacity('D2', { 1: 0, 2: 0, 3: 0, 4: 0 });
      const counts: Record<ItemTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      counts[tier] = 1;
      const oneItem = stadiumCapacity('D2', counts);
      expect(oneItem - base).toBe(CAPACITY_PER_GRADA_ITEM[tier]);
    }
  });

  it('test_capacity_defensive_negative_counts_clamped_to_zero', () => {
    expect(stadiumCapacity('D2', { 1: -5, 2: -5, 3: -5, 4: -5 })).toBe(STADIUM_CAPACITY_BASE.D2);
  });
});

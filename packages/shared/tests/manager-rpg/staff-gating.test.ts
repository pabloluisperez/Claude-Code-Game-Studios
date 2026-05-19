/**
 * Unit tests for the P1↔P3 staff gating function.
 * Story: MANAGER-RPG-006
 */

import { describe, it, expect } from 'vitest';
import {
  getMaxHirableStaffQuality,
  isStaffTierHirable,
} from '../../src/sim/manager-rpg/staff-gating.js';

describe('getMaxHirableStaffQuality — reputation tier mapping', () => {
  it('test_reputation_1_max_tier_1', () => {
    expect(getMaxHirableStaffQuality(1)).toBe(1);
  });
  it('test_reputation_2_max_tier_1', () => {
    expect(getMaxHirableStaffQuality(2)).toBe(1);
  });
  it('test_reputation_3_max_tier_2', () => {
    expect(getMaxHirableStaffQuality(3)).toBe(2);
  });
  it('test_reputation_4_max_tier_3', () => {
    expect(getMaxHirableStaffQuality(4)).toBe(3);
  });
  it('test_reputation_5_max_tier_3', () => {
    expect(getMaxHirableStaffQuality(5)).toBe(3);
  });
  it('test_reputation_0_floor_tier_1', () => {
    expect(getMaxHirableStaffQuality(0)).toBe(1);
  });
});

describe('isStaffTierHirable', () => {
  it('test_tier_1_always_hirable', () => {
    expect(isStaffTierHirable(1, 1)).toBe(true);
    expect(isStaffTierHirable(5, 1)).toBe(true);
  });
  it('test_tier_3_only_at_reputation_4_plus', () => {
    expect(isStaffTierHirable(3, 3)).toBe(false);
    expect(isStaffTierHirable(4, 3)).toBe(true);
    expect(isStaffTierHirable(5, 3)).toBe(true);
  });
});

/**
 * Tests for F3 infrastructureLevel. Story STADIUM-UPGRADES-003.
 * Supersedes city-progression.md §4.2 formula.
 */

import { describe, it, expect } from 'vitest';
import {
  infrastructureLevel,
  STADIUM_ITEMS_MAX,
  TRAINING_ITEMS_MAX,
  ACADEMY_ITEMS_MAX,
} from '../../src/sim/stadium/infrastructure.js';

describe('F3 infrastructureLevel', () => {
  it('test_infrastructure_level_gdd_example_returns_69', () => {
    // GDD §4 F3 example: stadium=24, training=4, academy=2 → 69
    // raw = (24/24 × 0.50 + 4/8 × 0.25 + 2/8 × 0.25) × 100
    //     = (1.0 × 0.50 + 0.5 × 0.25 + 0.25 × 0.25) × 100
    //     = (0.50 + 0.125 + 0.0625) × 100 = 68.75 → round = 69
    const result = infrastructureLevel({
      stadium_upgrade_count: 24,
      training_facility_level: 4,
      youth_academy_level: 2,
    });
    expect(result).toBe(69);
  });

  it('test_infrastructure_level_zero_when_no_progress', () => {
    expect(
      infrastructureLevel({
        stadium_upgrade_count: 0,
        training_facility_level: 0,
        youth_academy_level: 0,
      }),
    ).toBe(0);
  });

  it('test_infrastructure_level_100_when_fully_complete', () => {
    expect(
      infrastructureLevel({
        stadium_upgrade_count: STADIUM_ITEMS_MAX,
        training_facility_level: TRAINING_ITEMS_MAX,
        youth_academy_level: ACADEMY_ITEMS_MAX,
      }),
    ).toBe(100);
  });

  it('test_infrastructure_level_in_range_for_all_random_inputs', () => {
    for (let i = 0; i < 1000; i++) {
      const r = infrastructureLevel({
        stadium_upgrade_count: Math.floor(Math.random() * (STADIUM_ITEMS_MAX + 1)),
        training_facility_level: Math.floor(Math.random() * (TRAINING_ITEMS_MAX + 1)),
        youth_academy_level: Math.floor(Math.random() * (ACADEMY_ITEMS_MAX + 1)),
      });
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    }
  });

  it('test_infrastructure_level_defensive_clamp_negative_inputs', () => {
    expect(
      infrastructureLevel({
        stadium_upgrade_count: -5,
        training_facility_level: -5,
        youth_academy_level: -5,
      }),
    ).toBe(0);
  });

  it('test_infrastructure_level_monotonic_in_each_counter', () => {
    for (let i = 0; i < 200; i++) {
      const base = {
        stadium_upgrade_count: Math.floor(Math.random() * STADIUM_ITEMS_MAX),
        training_facility_level: Math.floor(Math.random() * TRAINING_ITEMS_MAX),
        youth_academy_level: Math.floor(Math.random() * ACADEMY_ITEMS_MAX),
      };
      const baseLvl = infrastructureLevel(base);
      const plusS = infrastructureLevel({ ...base, stadium_upgrade_count: base.stadium_upgrade_count + 1 });
      const plusT = infrastructureLevel({ ...base, training_facility_level: base.training_facility_level + 1 });
      const plusA = infrastructureLevel({ ...base, youth_academy_level: base.youth_academy_level + 1 });
      expect(plusS).toBeGreaterThanOrEqual(baseLvl);
      expect(plusT).toBeGreaterThanOrEqual(baseLvl);
      expect(plusA).toBeGreaterThanOrEqual(baseLvl);
    }
  });
});

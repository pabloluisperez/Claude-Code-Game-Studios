/**
 * Unit tests for F12 skill degradation + end-of-season development.
 * Story: PLAYER-MANAGEMENT-008
 * Acceptance Criteria: AC-PM-13..15, AC-PM-25..27
 */

import { describe, it, expect } from 'vitest';
import {
  DEVELOPMENT_THRESHOLD,
  SKILL_DECAY_MAX,
  SKILL_FLOOR,
  computeEndOfSeasonDevelopment,
  computeF12Degradation,
  computeWeeklySkillDrift,
} from '../../src/sim/player-management/skill-lifecycle.js';

describe('F12 — computeF12Degradation', () => {
  it('test_ac_pm_25_age_33_decay_2', () => {
    expect(computeF12Degradation(33, 72)).toBe(70);
  });

  it('test_ac_pm_26_age_28_no_decay', () => {
    expect(computeF12Degradation(28, 72)).toBe(72);
  });

  it('test_age_30_decay_zero', () => {
    expect(computeF12Degradation(30, 72)).toBe(72);
  });

  it('test_age_31_decay_one', () => {
    expect(computeF12Degradation(31, 72)).toBe(71);
  });

  it('test_age_36_capped_at_max', () => {
    // floor((36-29)/2) = 3 → capped at SKILL_DECAY_MAX=2
    expect(computeF12Degradation(36, 72)).toBe(70);
  });

  it('test_floor_at_skill_20', () => {
    expect(computeF12Degradation(35, 21)).toBe(SKILL_FLOOR);
  });

  it('test_constants', () => {
    expect(SKILL_DECAY_MAX).toBe(2);
  });
});

describe('computeWeeklySkillDrift', () => {
  it('test_under_28_no_drift', () => {
    expect(computeWeeklySkillDrift(25, 80)).toBe(80);
  });

  it('test_28_29_micro_drift', () => {
    expect(computeWeeklySkillDrift(29, 80)).toBeCloseTo(79.95, 5);
  });

  it('test_34_plus_high_drift', () => {
    expect(computeWeeklySkillDrift(35, 80)).toBeCloseTo(79.6, 5);
  });

  it('test_floor_at_20', () => {
    expect(computeWeeklySkillDrift(35, 20)).toBe(SKILL_FLOOR);
  });
});

describe('computeEndOfSeasonDevelopment', () => {
  it('test_ac_pm_13_development_with_enough_minutes', () => {
    // age=22, skill=65, ceiling=80, minutes=1520, max=3420 (38×90)
    // ratio = 0.444 ≥ 0.40 → gain = min(2, 80-65) = 2 → skill = 67
    expect(
      computeEndOfSeasonDevelopment({
        age: 22,
        skill: 65,
        potentialCeiling: 80,
        minutesPlayedSeason: 1520,
        maxMinutesSeason: 3420,
      }),
    ).toBe(67);
  });

  it('test_ac_pm_14_no_development_under_threshold', () => {
    // minutes=1000 / 3420 = 0.292 < 0.40 → no development
    expect(
      computeEndOfSeasonDevelopment({
        age: 22,
        skill: 65,
        potentialCeiling: 80,
        minutesPlayedSeason: 1000,
        maxMinutesSeason: 3420,
      }),
    ).toBe(65);
  });

  it('test_ac_pm_15_age_30_no_development', () => {
    expect(
      computeEndOfSeasonDevelopment({
        age: 30,
        skill: 65,
        potentialCeiling: 80,
        minutesPlayedSeason: 3420,
        maxMinutesSeason: 3420,
      }),
    ).toBe(65);
  });

  it('test_ac_pm_27_skill_at_ceiling_no_change', () => {
    expect(
      computeEndOfSeasonDevelopment({
        age: 22,
        skill: 80,
        potentialCeiling: 80,
        minutesPlayedSeason: 1520,
        maxMinutesSeason: 3420,
      }),
    ).toBe(80);
  });

  it('test_no_ceiling_no_development', () => {
    expect(
      computeEndOfSeasonDevelopment({
        age: 22,
        skill: 65,
        potentialCeiling: null,
        minutesPlayedSeason: 1520,
        maxMinutesSeason: 3420,
      }),
    ).toBe(65);
  });

  it('test_constants', () => {
    expect(DEVELOPMENT_THRESHOLD).toBeCloseTo(0.4, 5);
  });
});

/**
 * Unit tests for F6 transfer_value formula.
 * Story: PLAYER-MANAGEMENT-009
 * Acceptance Criteria: AC-PM-16, AC-PM-17
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_VALUE_K,
  TRANSFER_VALUE_FLOOR,
  computeTransferValue,
} from '../../src/sim/player-management/transfer-value.js';

describe('F6 — computeTransferValue', () => {
  it('test_ac_pm_16_known_values', () => {
    // skill=75, age=22, form=70:
    //   skill_factor = (75/50)^1.8 ≈ 2.07
    //   age_factor = 1.2
    //   form_factor = 0.8 + (70-60)/100 × 0.4 = 0.84
    //   value = 5 × 2.07 × 1.2 × 0.84 ≈ 10.43 (within 0.5 of GDD 10.45)
    const v = computeTransferValue({ skill: 75, age: 22, form: 70 });
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(11);
  });

  it('test_ac_pm_17_floor_for_extremes', () => {
    // skill=20, age=40, form=30: extreme minimums → ≥ 0.1
    const v = computeTransferValue({ skill: 20, age: 40, form: 30 });
    expect(v).toBeGreaterThanOrEqual(TRANSFER_VALUE_FLOOR);
  });

  it('test_age_factor_table_consistency', () => {
    // Same skill/form, increasing age → factor curve check
    const base = { skill: 60, form: 60 };
    const at22 = computeTransferValue({ ...base, age: 22 });
    const at28 = computeTransferValue({ ...base, age: 28 });
    const at34 = computeTransferValue({ ...base, age: 34 });
    // Age 22 (peak 1.2x) > Age 28 (0.85x) > Age 34 (0.35x)
    expect(at22).toBeGreaterThan(at28);
    expect(at28).toBeGreaterThan(at34);
  });

  it('test_form_factor_monotonic', () => {
    const base = { skill: 70, age: 25 };
    const lowForm = computeTransferValue({ ...base, form: 30 });
    const midForm = computeTransferValue({ ...base, form: 60 });
    const highForm = computeTransferValue({ ...base, form: 90 });
    expect(lowForm).toBeLessThan(midForm);
    expect(midForm).toBeLessThan(highForm);
  });

  it('test_reference_value_at_50_24_60', () => {
    // skill=50, age=24 (factor 1.2), form=60 (factor 0.8)
    //   value = 5 × 1 × 1.2 × 0.8 = 4.8
    expect(computeTransferValue({ skill: 50, age: 24, form: 60 })).toBeCloseTo(4.8, 1);
  });

  it('test_constants', () => {
    expect(BASE_VALUE_K).toBe(5.0);
  });
});

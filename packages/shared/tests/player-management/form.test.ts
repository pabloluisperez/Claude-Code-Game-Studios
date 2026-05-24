/**
 * Unit tests for F4 form rolling + F5 form decay.
 * Story: PLAYER-MANAGEMENT-004
 * Acceptance Criteria: AC-PM-04, AC-PM-05, AC-PM-06
 */

import { describe, it, expect } from 'vitest';
import {
  F4_MAX_HISTORY,
  FORM_DECAY_WEEKLY,
  FORM_GRACE_WEEKS,
  MAX_FORM,
  MIN_FORM,
  applyFormUpdate,
  computeFormDecayF5,
  computeFormF4,
} from '../../src/sim/player-management/form.js';

describe('F4 — computeFormF4', () => {
  it('test_ac_pm_04_gdd_simple_avg_vs_adr_weighted', () => {
    // GDD AC-PM-04 example: [72, 68, 75, 70, 65] → 70.0 (simple avg)
    // ADR-016 weighted: weights [1.0, 0.85, 0.7, 0.55, 0.4]
    //   weighted = 72×1.0 + 68×0.85 + 75×0.7 + 70×0.55 + 65×0.4
    //   = 72 + 57.8 + 52.5 + 38.5 + 26 = 246.8
    //   totalWeight = 3.5 → form = round(246.8 / 3.5) = round(70.51) = 71
    expect(computeFormF4([72, 68, 75, 70, 65])).toBe(71);
  });

  it('test_form_clamped_at_max', () => {
    expect(computeFormF4([100, 100, 100, 100, 100])).toBe(MAX_FORM);
  });

  it('test_form_clamped_at_min', () => {
    expect(computeFormF4([10, 10, 10, 10, 10])).toBe(MIN_FORM);
  });

  it('test_single_rating', () => {
    expect(computeFormF4([70])).toBe(70);
  });

  it('test_empty_history_returns_min_form', () => {
    expect(computeFormF4([])).toBe(MIN_FORM);
  });

  it('test_partial_history_normalised', () => {
    // [80, 60]: weighted = 80×1.0 + 60×0.85 = 131.0; totalWeight = 1.85 → 70.81 → 71
    expect(computeFormF4([80, 60])).toBe(71);
  });
});

describe('F5 — computeFormDecayF5', () => {
  it('test_ac_pm_05_decay_after_grace', () => {
    // GDD AC-PM-05: form=50, 6 weeks without playing → 48
    // Our impl: grace=5; week 6 = weeksWithoutPlay=6 → decay
    expect(computeFormDecayF5(50, FORM_GRACE_WEEKS + 1)).toBe(50 - FORM_DECAY_WEEKLY);
  });

  it('test_ac_pm_06_clamp_to_min', () => {
    // AC-PM-06: form=32, decay applied → 30 (clamped)
    expect(computeFormDecayF5(32, FORM_GRACE_WEEKS + 1)).toBe(MIN_FORM);
  });

  it('test_grace_period_no_decay', () => {
    expect(computeFormDecayF5(60, 1)).toBe(60);
    expect(computeFormDecayF5(60, FORM_GRACE_WEEKS)).toBe(60);
  });

  it('test_decay_floor_at_30', () => {
    expect(computeFormDecayF5(30, FORM_GRACE_WEEKS + 1)).toBe(MIN_FORM);
  });
});

describe('applyFormUpdate', () => {
  it('test_appends_new_rating_keeps_last_5', () => {
    expect(applyFormUpdate([72, 68, 75, 70, 65], 80)).toEqual([80, 72, 68, 75, 70]);
  });

  it('test_empty_history_returns_single_entry', () => {
    expect(applyFormUpdate([], 70)).toEqual([70]);
  });

  it('test_under_5_entries_grows', () => {
    expect(applyFormUpdate([70], 75)).toEqual([75, 70]);
  });

  it('test_history_capped_at_F4_MAX_HISTORY', () => {
    const history = [10, 20, 30, 40, 50];
    const next = applyFormUpdate(history, 60);
    expect(next.length).toBe(F4_MAX_HISTORY);
    expect(next[0]).toBe(60);
    expect(next[F4_MAX_HISTORY - 1]).toBe(40);
  });
});

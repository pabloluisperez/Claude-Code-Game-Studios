/**
 * Tests for F1 stadium_visual_level. Story STADIUM-UPGRADES-003.
 * Covers QA Test Cases per the story's `## QA Test Cases` section.
 */

import { describe, it, expect } from 'vitest';
import { stadiumVisualLevel, G_MAX, P_MAX, S_MAX } from '../../src/sim/stadium/visual-level.js';

describe('F1 stadiumVisualLevel', () => {
  it('test_visual_level_gdd_example_returns_5', () => {
    // GDD §4 F1 example: 4/8 gradas, 6/8 pitch, 2/8 servicios → visual_level = 5
    const result = stadiumVisualLevel({ gradas: 4, pitch: 6, servicios: 2 });
    expect(result).toBe(5);
  });

  it('test_visual_level_zero_when_no_items_complete', () => {
    expect(stadiumVisualLevel({ gradas: 0, pitch: 0, servicios: 0 })).toBe(0);
  });

  it('test_visual_level_nine_when_all_items_complete', () => {
    // AC-SU-11 boundary: max input must NOT round up to 10 — proof for the
    // `× 9.99` instead of `× 10` invariant documented in the impl.
    expect(stadiumVisualLevel({ gradas: 8, pitch: 8, servicios: 8 })).toBe(9);
  });

  it('test_visual_level_integer_for_all_random_inputs', () => {
    // Property — 1000 random inputs in [0..G_MAX]³ → integer in [0, 9].
    for (let i = 0; i < 1000; i++) {
      const g = Math.floor(Math.random() * (G_MAX + 1));
      const p = Math.floor(Math.random() * (P_MAX + 1));
      const s = Math.floor(Math.random() * (S_MAX + 1));
      const r = stadiumVisualLevel({ gradas: g, pitch: p, servicios: s });
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(9);
    }
  });

  it('test_visual_level_monotonic_in_each_track', () => {
    // AC-SU-11: increasing any track count never decreases output.
    // Sample-based property test: for 200 random base states, increasing
    // any one track by +1 must produce a result >= base.
    for (let i = 0; i < 200; i++) {
      const base = {
        gradas: Math.floor(Math.random() * G_MAX),
        pitch: Math.floor(Math.random() * P_MAX),
        servicios: Math.floor(Math.random() * S_MAX),
      };
      const baseLevel = stadiumVisualLevel(base);
      const plusGradas = stadiumVisualLevel({ ...base, gradas: base.gradas + 1 });
      const plusPitch = stadiumVisualLevel({ ...base, pitch: base.pitch + 1 });
      const plusServ = stadiumVisualLevel({ ...base, servicios: base.servicios + 1 });
      expect(plusGradas).toBeGreaterThanOrEqual(baseLevel);
      expect(plusPitch).toBeGreaterThanOrEqual(baseLevel);
      expect(plusServ).toBeGreaterThanOrEqual(baseLevel);
    }
  });

  it('test_visual_level_deterministic_same_input_same_output', () => {
    const input = { gradas: 5, pitch: 3, servicios: 4 };
    const ref = stadiumVisualLevel(input);
    for (let i = 0; i < 100; i++) {
      expect(stadiumVisualLevel(input)).toBe(ref);
    }
  });

  it('test_visual_level_defensive_clamp_on_negative_inputs', () => {
    // Should never receive negatives, but defensive clamp ensures no NaN.
    expect(stadiumVisualLevel({ gradas: -1, pitch: -1, servicios: -1 })).toBe(0);
  });

  it('test_visual_level_does_not_round_up_to_ten', () => {
    // Critical invariant: × 9.99 prevents reaching 10. Spot check at max.
    const r = stadiumVisualLevel({ gradas: G_MAX, pitch: P_MAX, servicios: S_MAX });
    expect(r).toBeLessThan(10);
    expect(r).toBe(9);
  });
});

/**
 * Tests for F6 tier-up reformas gate. Story STADIUM-UPGRADES-004.
 */

import { describe, it, expect } from 'vitest';
import {
  itemsRequiredForLevel,
  tierUpReformasGateSatisfied,
} from '../../src/sim/stadium/gate.js';

describe('F6 tier-up reformas gate', () => {
  it('test_items_required_10_returns_7', () => {
    // AC-SU-23: ceil(10 × 0.70) = ceil(7.0) = 7
    expect(itemsRequiredForLevel(10)).toBe(7);
  });

  it('test_gate_7_of_10_satisfied', () => {
    // AC-SU-24
    expect(tierUpReformasGateSatisfied(2, 7, 10)).toBe(true);
  });

  it('test_gate_6_of_10_not_satisfied', () => {
    // AC-SU-25
    expect(tierUpReformasGateSatisfied(2, 6, 10)).toBe(false);
  });

  it('test_items_required_zero_total_returns_zero_trivially_satisfied', () => {
    // Edge: empty level → trivially satisfied.
    expect(itemsRequiredForLevel(0)).toBe(0);
    expect(tierUpReformasGateSatisfied(1, 0, 0)).toBe(true);
  });

  it('test_items_required_monotonic_in_total_in_level', () => {
    let prev = 0;
    for (let n = 1; n <= 50; n++) {
      const r = itemsRequiredForLevel(n);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('test_gate_monotonic_in_completed_count', () => {
    const total = 10;
    let prevSatisfied = false;
    for (let c = 0; c <= total; c++) {
      const sat = tierUpReformasGateSatisfied(3, c, total);
      // Once satisfied (true), can never go back to false as c increases
      if (prevSatisfied) expect(sat).toBe(true);
      prevSatisfied = sat;
    }
  });
});

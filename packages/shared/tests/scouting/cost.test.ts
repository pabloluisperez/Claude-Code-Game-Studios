import { describe, it, expect } from 'vitest';
import { scoutActionCost } from '../../src/sim/scouting/cost.js';

describe('F4 scoutActionCost', () => {
  it('test_scout_base_cost_5', () => {
    expect(scoutActionCost('scout')).toBe(5);
  });

  it('test_deep_scout_base_cost_15', () => {
    expect(scoutActionCost('deep_scout')).toBe(15);
  });

  it('test_deep_scout_with_director_t3_discount_returns_12', () => {
    expect(scoutActionCost('deep_scout', { scoutDirectorT3: true })).toBe(12);
  });

  it('test_scout_with_director_t3_discount_returns_4', () => {
    // 5 × 0.80 = 4
    expect(scoutActionCost('scout', { scoutDirectorT3: true })).toBe(4);
  });

  it('test_cost_always_integer', () => {
    expect(Number.isInteger(scoutActionCost('scout'))).toBe(true);
    expect(Number.isInteger(scoutActionCost('deep_scout'))).toBe(true);
    expect(Number.isInteger(scoutActionCost('scout', { scoutDirectorT3: true }))).toBe(true);
  });
});

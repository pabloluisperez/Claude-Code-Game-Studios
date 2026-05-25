import { describe, it, expect } from 'vitest';
import { poolVisibilitySize } from '../../src/sim/scouting/pool-size.js';

describe('F5 poolVisibilitySize', () => {
  it('test_pool_level_1_returns_35_and_13', () => {
    const p = poolVisibilitySize(1);
    expect(p.aiCurrentDiv).toBe(35);
    expect(p.aiOtherDiv).toBe(13);
    expect(p.freeAgents).toBe('ALL');
  });

  it('test_pool_level_5_returns_55_and_25', () => {
    const p = poolVisibilitySize(5);
    expect(p.aiCurrentDiv).toBe(55);
    expect(p.aiOtherDiv).toBe(25);
  });

  it('test_pool_clamps_below_1_to_1', () => {
    expect(poolVisibilitySize(0)).toEqual(poolVisibilitySize(1));
    expect(poolVisibilitySize(-100)).toEqual(poolVisibilitySize(1));
  });

  it('test_pool_clamps_above_5_to_5', () => {
    expect(poolVisibilitySize(6)).toEqual(poolVisibilitySize(5));
    expect(poolVisibilitySize(100)).toEqual(poolVisibilitySize(5));
  });

  it('test_pool_total_includes_free_agents_label', () => {
    const p = poolVisibilitySize(3);
    expect(String(p.total)).toContain('ALL_FREE');
  });

  it('test_pool_monotonic_in_level', () => {
    let prev = 0;
    for (let l = 1; l <= 5; l++) {
      const cur = poolVisibilitySize(l).aiCurrentDiv;
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });
});

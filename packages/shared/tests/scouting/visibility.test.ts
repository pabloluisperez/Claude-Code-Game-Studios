import { describe, it, expect } from 'vitest';
import { visibilityTierOf } from '../../src/sim/scouting/visibility.js';
import type { ManagerScoutState } from '../../src/sim/scouting/types.js';

function mockManager(opts: Partial<{
  scouted: Set<string>;
  deepScouted: Set<string>;
  scoutAt: Map<string, number>;
  deepAt: Map<string, number>;
  directorTier: 0 | 1 | 2 | 3;
}> = {}): ManagerScoutState {
  const scouted = opts.scouted ?? new Set<string>();
  const deepScouted = opts.deepScouted ?? new Set<string>();
  const scoutAt = opts.scoutAt ?? new Map();
  const deepAt = opts.deepAt ?? new Map();
  return {
    hasScouted: (id) => scouted.has(id),
    hasDeepScouted: (id) => deepScouted.has(id),
    scoutCompletedAtWeek: (id) => scoutAt.get(id) ?? null,
    deepScoutCompletedAtWeek: (id) => deepAt.get(id) ?? null,
    scoutDirectorTier: opts.directorTier ?? 0,
  };
}

describe('F1 visibilityTierOf', () => {
  const playerInPool = { id: 'p1', inPoolThisWindow: true };
  const playerOutOfPool = { id: 'p1', inPoolThisWindow: false };

  it('test_visibility_t0_when_not_in_pool', () => {
    expect(visibilityTierOf(playerOutOfPool, mockManager(), 1)).toBe(0);
  });

  it('test_visibility_t1_in_pool_not_scouted', () => {
    expect(visibilityTierOf(playerInPool, mockManager(), 1)).toBe(1);
  });

  it('test_visibility_t2_scouted_not_deep', () => {
    const m = mockManager({ scouted: new Set(['p1']) });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(2);
  });

  it('test_visibility_t2_deep_but_no_director', () => {
    const m = mockManager({
      scouted: new Set(['p1']),
      deepScouted: new Set(['p1']),
      deepAt: new Map([['p1', 3]]),
      directorTier: 0,
    });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(2);
  });

  it('test_visibility_t2_director_tier_1_insufficient', () => {
    const m = mockManager({
      scouted: new Set(['p1']),
      deepScouted: new Set(['p1']),
      deepAt: new Map([['p1', 3]]),
      directorTier: 1,
    });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(2);
  });

  it('test_visibility_t3_deep_director_t2_and_delay_elapsed', () => {
    const m = mockManager({
      scouted: new Set(['p1']),
      deepScouted: new Set(['p1']),
      deepAt: new Map([['p1', 3]]),
      directorTier: 2,
    });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(3); // 5 - 3 = 2 weeks elapsed ≥ 1
  });

  it('test_visibility_t2_deep_within_delay_window', () => {
    const m = mockManager({
      scouted: new Set(['p1']),
      deepScouted: new Set(['p1']),
      deepAt: new Map([['p1', 5]]),
      directorTier: 3,
    });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(2); // same week, delay not elapsed
  });

  it('test_visibility_t3_with_higher_director_tier_works', () => {
    const m = mockManager({
      scouted: new Set(['p1']),
      deepScouted: new Set(['p1']),
      deepAt: new Map([['p1', 1]]),
      directorTier: 3,
    });
    expect(visibilityTierOf(playerInPool, m, 5)).toBe(3);
  });

  it('test_visibility_property_random_states_always_valid_tier', () => {
    for (let i = 0; i < 200; i++) {
      const m = mockManager({
        scouted: Math.random() > 0.5 ? new Set(['p1']) : new Set(),
        deepScouted: Math.random() > 0.7 ? new Set(['p1']) : new Set(),
        deepAt: new Map([['p1', Math.floor(Math.random() * 10)]]),
        directorTier: (Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3),
      });
      const tier = visibilityTierOf(playerInPool, m, 5);
      expect([0, 1, 2, 3]).toContain(tier);
    }
  });
});

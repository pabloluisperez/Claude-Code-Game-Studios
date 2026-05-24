import { describe, expect, it } from 'vitest';
import { generateDoubleRoundRobin, generateAiClubs } from '../src/sim/league-gen.js';
import { createSeededRng } from '../src/sim/rng.js';

describe('generateDoubleRoundRobin', () => {
  const clubIds = ['a', 'b', 'c', 'd'];

  it('produces 2 × (N-1) matchdays for N clubs', () => {
    const fixtures = generateDoubleRoundRobin({ clubIds, startWeek: 1 });
    // N=4 → 6 matchdays × 2 matches = 12 fixtures
    expect(fixtures).toHaveLength(12);
    const matchdays = new Set(fixtures.map((f) => f.matchday));
    expect(matchdays.size).toBe(6);
  });

  it('every club plays every other club exactly twice (once at home, once away)', () => {
    const fixtures = generateDoubleRoundRobin({ clubIds, startWeek: 1 });
    for (const home of clubIds) {
      for (const away of clubIds) {
        if (home === away) continue;
        const count = fixtures.filter(
          (f) => f.homeClubId === home && f.awayClubId === away,
        ).length;
        expect(count, `${home} vs ${away}`).toBe(1);
      }
    }
  });

  it('throws on odd club counts', () => {
    expect(() =>
      generateDoubleRoundRobin({ clubIds: ['a', 'b', 'c'], startWeek: 1 }),
    ).toThrow();
  });

  it('preserves matchday ordering by week', () => {
    const fixtures = generateDoubleRoundRobin({ clubIds, startWeek: 5 });
    const weeks = fixtures.map((f) => f.week);
    expect(weeks[0]).toBe(5);
    expect(Math.max(...weeks)).toBe(5 + 5); // 6 matchdays starting at 5
  });
});

describe('generateAiClubs', () => {
  it('produces the requested number of clubs with distinct names', () => {
    const clubs = generateAiClubs({
      rng: createSeededRng('test-seed-1'),
      count: 8,
      currentWeek: 0,
    });
    expect(clubs).toHaveLength(8);
    const names = new Set(clubs.map((c) => c.name));
    expect(names.size).toBe(8);
  });

  it('respects excludeNames so it does not collide with the user club', () => {
    const clubs = generateAiClubs({
      rng: createSeededRng('test-seed-2'),
      count: 4,
      currentWeek: 0,
      excludeNames: new Set(['CD Bara']),
    });
    expect(clubs.find((c) => c.name === 'CD Bara')).toBeUndefined();
  });

  it('is deterministic for the same seed', () => {
    const a = generateAiClubs({
      rng: createSeededRng('seed-x'),
      count: 4,
      currentWeek: 0,
    });
    const b = generateAiClubs({
      rng: createSeededRng('seed-x'),
      count: 4,
      currentWeek: 0,
    });
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
  });
});

import { describe, expect, it } from 'vitest';
import { quickSimulateMatch } from '../src/sim/quick-match.js';
import { createSeededRng } from '../src/sim/rng.js';

const ROSTER_STRONG = Array.from({ length: 11 }, () => ({ skill: 75, form: 70 }));
const ROSTER_AVERAGE = Array.from({ length: 11 }, () => ({ skill: 50, form: 60 }));
const ROSTER_WEAK = Array.from({ length: 11 }, () => ({ skill: 35, form: 50 }));

describe('quickSimulateMatch', () => {
  it('produces a winner that matches the score', () => {
    const result = quickSimulateMatch({
      homeRoster: ROSTER_STRONG,
      awayRoster: ROSTER_WEAK,
      rng: createSeededRng('match-1'),
    });
    if (result.homeScore > result.awayScore) expect(result.winner).toBe('home');
    else if (result.homeScore < result.awayScore) expect(result.winner).toBe('away');
    else expect(result.winner).toBe('draw');
  });

  it('is deterministic for the same seed', () => {
    const a = quickSimulateMatch({
      homeRoster: ROSTER_AVERAGE,
      awayRoster: ROSTER_AVERAGE,
      rng: createSeededRng('match-determinism'),
    });
    const b = quickSimulateMatch({
      homeRoster: ROSTER_AVERAGE,
      awayRoster: ROSTER_AVERAGE,
      rng: createSeededRng('match-determinism'),
    });
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
  });

  it('respects home advantage — strong home team wins more often than as away', () => {
    let homeWinsAsHome = 0;
    let homeWinsAsAway = 0;
    for (let i = 0; i < 200; i++) {
      const a = quickSimulateMatch({
        homeRoster: ROSTER_AVERAGE,
        awayRoster: ROSTER_AVERAGE,
        rng: createSeededRng(`home-adv-${i}`),
      });
      if (a.winner === 'home') homeWinsAsHome += 1;
      const b = quickSimulateMatch({
        homeRoster: ROSTER_AVERAGE,
        awayRoster: ROSTER_AVERAGE,
        rng: createSeededRng(`away-adv-${i}`),
      });
      if (b.winner === 'away') homeWinsAsAway += 1;
    }
    expect(homeWinsAsHome).toBeGreaterThan(homeWinsAsAway);
  });

  it('strong roster outscores weak one over many trials', () => {
    let strongGoals = 0;
    let weakGoals = 0;
    for (let i = 0; i < 100; i++) {
      const result = quickSimulateMatch({
        homeRoster: ROSTER_STRONG,
        awayRoster: ROSTER_WEAK,
        rng: createSeededRng(`strength-${i}`),
      });
      strongGoals += result.homeScore;
      weakGoals += result.awayScore;
    }
    expect(strongGoals).toBeGreaterThan(weakGoals * 1.5);
  });

  it('clamps goals to a reasonable maximum', () => {
    for (let i = 0; i < 100; i++) {
      const result = quickSimulateMatch({
        homeRoster: ROSTER_STRONG,
        awayRoster: ROSTER_WEAK,
        rng: createSeededRng(`clamp-${i}`),
      });
      expect(result.homeScore).toBeLessThanOrEqual(8);
      expect(result.awayScore).toBeLessThanOrEqual(8);
    }
  });

  it('handles empty rosters gracefully', () => {
    const result = quickSimulateMatch({
      homeRoster: [],
      awayRoster: ROSTER_AVERAGE,
      rng: createSeededRng('empty'),
    });
    expect(result.homeStrength).toBe(0);
    expect(result.awayStrength).toBeGreaterThan(0);
  });
});

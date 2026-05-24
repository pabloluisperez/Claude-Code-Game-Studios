/**
 * Unit tests for generateRoundRobin.
 * Story: LEAGUE-SYSTEM-002
 * Acceptance Criteria: AC-LGS-01..06
 */

import { describe, it, expect } from 'vitest';
import { generateRoundRobin } from '../../src/sim/league-system/round-robin.js';

function clubIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i + 1}`);
}

describe('generateRoundRobin — AC-LGS-01..06', () => {
  it('test_ac_lgs_01_20_clubs_380_fixtures', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    expect(fixtures.length).toBe(380);
  });

  it('test_ac_lgs_02_each_pair_plays_twice_home_away_flip', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    const pairCounts = new Map<string, { home: number; away: number }>();
    for (const f of fixtures) {
      const key = f.homeClubId < f.awayClubId
        ? `${f.homeClubId}_${f.awayClubId}`
        : `${f.awayClubId}_${f.homeClubId}`;
      const entry = pairCounts.get(key) ?? { home: 0, away: 0 };
      entry.home += 1;
      pairCounts.set(key, entry);
    }
    // 20 clubs → C(20,2) = 190 unique pairs, each appearing 2× = 380 fixtures
    expect(pairCounts.size).toBe(190);
    for (const count of pairCounts.values()) {
      expect(count.home).toBe(2); // 2 matches per pair (regardless of home/away)
    }
    // Each pair has exactly one match where clubA is home and one where clubB is home
    for (const f1 of fixtures) {
      const reverse = fixtures.find(
        (f2) => f2.homeClubId === f1.awayClubId && f2.awayClubId === f1.homeClubId,
      );
      expect(reverse).toBeDefined();
    }
  });

  it('test_ac_lgs_03_no_self_match', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    for (const f of fixtures) {
      expect(f.homeClubId).not.toBe(f.awayClubId);
    }
  });

  it('test_ac_lgs_04_38_matchdays_10_matches_each', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    const matchdayCounts = new Map<number, number>();
    for (const f of fixtures) {
      matchdayCounts.set(f.matchday, (matchdayCounts.get(f.matchday) ?? 0) + 1);
    }
    expect(matchdayCounts.size).toBe(38);
    for (const count of matchdayCounts.values()) {
      expect(count).toBe(10);
    }
  });

  it('test_ac_lgs_05_determinism', () => {
    const a = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    const b = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('test_ac_lgs_06_16_clubs_240_fixtures', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(16), startWeek: 1 });
    expect(fixtures.length).toBe(16 * 15);
    // 30 matchdays × 8 matches
    const matchdays = new Set(fixtures.map((f) => f.matchday));
    expect(matchdays.size).toBe(30);
  });
});

describe('generateRoundRobin — edge cases', () => {
  it('test_throws_on_odd_club_count', () => {
    expect(() => generateRoundRobin({ clubIds: clubIds(19), startWeek: 1 })).toThrow();
  });

  it('test_2_clubs_2_fixtures', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(2), startWeek: 1 });
    expect(fixtures.length).toBe(2);
    expect(fixtures[0]!.matchday).toBe(1);
    expect(fixtures[1]!.matchday).toBe(2);
    // Home/away flip between the two matches
    expect(fixtures[0]!.homeClubId).toBe(fixtures[1]!.awayClubId);
  });

  it('test_empty_input_returns_empty', () => {
    expect(generateRoundRobin({ clubIds: [], startWeek: 1 })).toEqual([]);
  });

  it('test_week_offset_applied', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(4), startWeek: 100 });
    // Matchday 1 → week 100; matchday 2 → 101; matchday 3 → 102 (3 matchdays × 2 legs = 6 total)
    const md1 = fixtures.find((f) => f.matchday === 1);
    expect(md1!.week).toBe(100);
    const md6 = fixtures.find((f) => f.matchday === 6);
    expect(md6!.week).toBe(105);
  });
});

describe('generateRoundRobin — home/away balance', () => {
  it('test_home_count_balanced_per_club', () => {
    const fixtures = generateRoundRobin({ clubIds: clubIds(20), startWeek: 1 });
    const homeCounts = new Map<string, number>();
    for (const f of fixtures) {
      homeCounts.set(f.homeClubId, (homeCounts.get(f.homeClubId) ?? 0) + 1);
    }
    // Each club plays 19 home matches (one per opponent) over the full double-robin
    for (const count of homeCounts.values()) {
      expect(count).toBe(19);
    }
  });
});

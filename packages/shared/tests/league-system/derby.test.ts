/**
 * Unit tests for derby detection + rival identification.
 * Story: LEAGUE-SYSTEM-007
 * Acceptance Criteria: AC-LGS-19..22
 */

import { describe, it, expect } from 'vitest';
import {
  buildDerbyPairSet,
  findDerbiesInSeason,
  getRivalClub,
  isDerby,
  isDerbyPair,
  type DerbyClub,
  type DerbyFixture,
} from '../../src/sim/league-system/derby.js';

function club(id: string, name: string, city: string): DerbyClub {
  return { id, name, city };
}

describe('isDerby', () => {
  it('test_same_city_returns_true', () => {
    expect(isDerby(club('a', 'A FC', 'Madrid'), club('b', 'B FC', 'Madrid'))).toBe(true);
  });

  it('test_different_cities_returns_false', () => {
    expect(isDerby(club('a', 'A', 'Madrid'), club('b', 'B', 'Barcelona'))).toBe(false);
  });

  it('test_case_sensitive', () => {
    expect(isDerby(club('a', 'A', 'Madrid'), club('b', 'B', 'madrid'))).toBe(false);
  });
});

describe('findDerbiesInSeason', () => {
  it('test_finds_all_derbies', () => {
    const clubs = new Map<string, DerbyClub>([
      ['c1', club('c1', 'Madrid A', 'Madrid')],
      ['c2', club('c2', 'Madrid B', 'Madrid')],
      ['c3', club('c3', 'Barcelona A', 'Barcelona')],
      ['c4', club('c4', 'Barcelona B', 'Barcelona')],
    ]);
    const fixtures: DerbyFixture[] = [
      { id: 'f1', homeClubId: 'c1', awayClubId: 'c2' }, // derby
      { id: 'f2', homeClubId: 'c1', awayClubId: 'c3' }, // not
      { id: 'f3', homeClubId: 'c3', awayClubId: 'c4' }, // derby
    ];
    expect(findDerbiesInSeason(fixtures, clubs)).toEqual(['f1', 'f3']);
  });

  it('test_skips_unknown_club_ids', () => {
    const clubs = new Map<string, DerbyClub>([['c1', club('c1', 'A', 'Madrid')]]);
    const fixtures: DerbyFixture[] = [{ id: 'f1', homeClubId: 'c1', awayClubId: 'unknown' }];
    expect(findDerbiesInSeason(fixtures, clubs)).toEqual([]);
  });

  it('test_empty_returns_empty', () => {
    expect(findDerbiesInSeason([], new Map())).toEqual([]);
  });
});

describe('getRivalClub', () => {
  it('test_returns_first_same_city_alphabetic', () => {
    const player = club('p', 'Player', 'Madrid');
    const all = [
      club('c1', 'Zenit', 'Madrid'),
      club('c2', 'Atletico', 'Madrid'),
      club('c3', 'Other', 'Barcelona'),
    ];
    expect(getRivalClub(player, all)).toEqual(club('c2', 'Atletico', 'Madrid'));
  });

  it('test_excludes_self', () => {
    const player = club('p', 'Player', 'Madrid');
    expect(getRivalClub(player, [player])).toBeNull();
  });

  it('test_returns_null_when_no_same_city', () => {
    const player = club('p', 'Player', 'Madrid');
    const all = [club('c1', 'A', 'Barcelona'), club('c2', 'B', 'Sevilla')];
    expect(getRivalClub(player, all)).toBeNull();
  });

  it('test_deterministic_lexicographic_tiebreak', () => {
    // Multiple same-city clubs → first alphabetical wins (deterministic)
    const player = club('p', 'Player', 'Madrid');
    const all = [
      club('c1', 'Zaragoza', 'Madrid'),
      club('c2', 'Alaves', 'Madrid'),
      club('c3', 'Madrid CF', 'Madrid'),
    ];
    expect(getRivalClub(player, all)!.id).toBe('c2'); // 'Alaves' first
  });
});

describe('buildDerbyPairSet / isDerbyPair', () => {
  it('test_builds_pairs_for_all_same_city_combos', () => {
    const clubs = [
      club('c1', 'A', 'Madrid'),
      club('c2', 'B', 'Madrid'),
      club('c3', 'C', 'Madrid'),
      club('c4', 'D', 'Barcelona'),
    ];
    const pairs = buildDerbyPairSet(clubs);
    // Madrid: c1-c2, c1-c3, c2-c3 → 3 pairs
    expect(pairs.size).toBe(3);
    expect(isDerbyPair('c1', 'c2', pairs)).toBe(true);
    expect(isDerbyPair('c2', 'c1', pairs)).toBe(true); // order-independent
    expect(isDerbyPair('c1', 'c4', pairs)).toBe(false);
  });

  it('test_empty_input', () => {
    expect(buildDerbyPairSet([]).size).toBe(0);
  });
});

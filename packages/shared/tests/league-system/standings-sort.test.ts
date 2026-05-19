/**
 * Unit tests for standings sort + Derby +1 tiebreaker.
 * Story: LEAGUE-SYSTEM-003
 * Acceptance Criteria: AC-LGS-07..10, AC-LGS-19
 */

import { describe, it, expect } from 'vitest';
import {
  computeStandingsSort,
  type HeadToHeadMap,
  type StandingsRow,
} from '../../src/sim/league-system/standings-sort.js';
import { buildDerbyPairSet, type DerbyClub } from '../../src/sim/league-system/derby.js';

function row(
  clubId: string,
  points: number,
  goalsFor: number,
  goalsAgainst: number,
  played = 38,
): StandingsRow {
  return {
    clubId,
    points,
    goalsFor,
    goalsAgainst,
    played,
    wins: 0,
    draws: 0,
    losses: 0,
  };
}

describe('computeStandingsSort — primary order', () => {
  it('test_points_descending', () => {
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 50, 30), row('b', 70, 40, 20), row('c', 50, 30, 30)],
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['b', 'a', 'c']);
  });

  it('test_goal_diff_breaks_points_tie', () => {
    // Both have 60 pts. a: GD=20; b: GD=10
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 50, 30), row('b', 60, 40, 30)],
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'b']);
  });

  it('test_goals_for_breaks_GD_tie', () => {
    // AC-LGS-07: same points, same GD → goals_for DESC
    // a: pts 60, GD 10 (50-40); b: pts 60, GD 10 (60-50) → b wins (more GF)
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 50, 40), row('b', 60, 60, 50)],
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['b', 'a']);
  });

  it('test_lexicographic_fallback_deterministic', () => {
    // Fully tied → clubId alphabetic
    const sorted = computeStandingsSort({
      rows: [row('z', 60, 40, 30), row('a', 60, 40, 30)],
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'z']);
  });
});

describe('computeStandingsSort — head-to-head tiebreak (AC-LGS-08)', () => {
  it('test_h2h_breaks_GF_tie', () => {
    // Both tied on all primary. a beat b 6 pts (2 wins); b beat a 0 pts.
    const h2h: HeadToHeadMap = new Map([
      ['a', new Map([['b', 6]])],
      ['b', new Map([['a', 0]])],
    ]);
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 40, 30), row('b', 60, 40, 30)],
      headToHead: h2h,
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'b']);
  });

  it('test_h2h_3_way_tie', () => {
    const h2h: HeadToHeadMap = new Map([
      ['a', new Map([['b', 6], ['c', 3]])], // 9 pts H2H
      ['b', new Map([['a', 0], ['c', 6]])], // 6 pts H2H
      ['c', new Map([['a', 3], ['b', 0]])], // 3 pts H2H
    ]);
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 40, 30), row('b', 60, 40, 30), row('c', 60, 40, 30)],
      headToHead: h2h,
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'b', 'c']);
  });
});

describe('computeStandingsSort — Derby +1 tiebreaker (AC-LGS-19)', () => {
  function derbyClubs(): readonly DerbyClub[] {
    return [
      { id: 'a', name: 'A FC', city: 'Madrid' },
      { id: 'b', name: 'B FC', city: 'Madrid' },
      { id: 'c', name: 'C FC', city: 'Barcelona' },
    ];
  }

  it('test_derby_wins_when_h2h_also_tied', () => {
    // a + b tied on primary AND tied on H2H (both 3 pts each — 1 win, 1 loss)
    const h2h: HeadToHeadMap = new Map([
      ['a', new Map([['b', 3]])],
      ['b', new Map([['a', 3]])],
    ]);
    const derbyPairs = buildDerbyPairSet(derbyClubs());
    const sorted = computeStandingsSort({
      rows: [row('a', 60, 40, 30), row('b', 60, 40, 30)],
      headToHead: h2h,
      derbyPairs,
    });
    // 'a' < 'b' lexicographically → a is "home of derby" → +1 → a first
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'b']);
  });

  it('test_no_derby_falls_to_lex_order', () => {
    // c is in Barcelona — no derby with a (Madrid). Still tied → lex order.
    const sorted = computeStandingsSort({
      rows: [row('c', 60, 40, 30), row('a', 60, 40, 30)],
    });
    expect(sorted.map((r) => r.clubId)).toEqual(['a', 'c']);
  });
});

describe('computeStandingsSort — purity + determinism', () => {
  it('test_deterministic_same_inputs_twice', () => {
    const rows = [
      row('alpha', 50, 40, 30),
      row('beta', 50, 40, 30),
      row('gamma', 60, 30, 20),
    ];
    const r1 = computeStandingsSort({ rows });
    const r2 = computeStandingsSort({ rows });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('test_does_not_mutate_input', () => {
    const rows = [row('a', 50, 40, 30), row('b', 60, 30, 20)];
    const snapshot = JSON.stringify(rows);
    computeStandingsSort({ rows });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

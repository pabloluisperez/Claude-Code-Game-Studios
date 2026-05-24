/**
 * Standings sort + Derby +1 tiebreaker.
 *
 * Per `design/gdd/league-system.md` AC-LGS-07..10, AC-LGS-19 and §F3:
 *
 *   Canonical sort order (descending priority):
 *     1. points DESC
 *     2. goal_difference DESC (computed: goalsFor - goalsAgainst)
 *     3. goals_for DESC
 *     4. head-to-head sub-standings (mini-table among tied clubs)
 *     5. derby +1 tiebreaker — when two derby rivals tied on H2H, the
 *        home-of-derby club gets +1 in the final ranking
 *
 * Pure function — no DB access. Caller hydrates rows + H2H + derby-pair set.
 *
 * Story: LEAGUE-SYSTEM-003 (TR-LGS-003)
 * Control Manifest: 2026-05-19
 */

import { isDerbyPair } from './derby.js';

export interface StandingsRow {
  readonly clubId: string;
  readonly played: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly points: number;
}

/** Head-to-head map: `h2h.get(clubA)?.get(clubB)` = points clubA earned vs clubB. */
export type HeadToHeadMap = ReadonlyMap<string, ReadonlyMap<string, number>>;

export interface StandingsSortArgs {
  readonly rows: readonly StandingsRow[];
  readonly headToHead?: HeadToHeadMap;
  /** Set of derby pair keys built by `buildDerbyPairSet` (Story 007). */
  readonly derbyPairs?: ReadonlySet<string>;
}

function goalDifference(row: Readonly<StandingsRow>): number {
  return row.goalsFor - row.goalsAgainst;
}

/**
 * Compute the head-to-head sub-standings among a group of tied clubs.
 * Returns each clubId's H2H points within the group; ties stay tied (caller
 * falls through to the derby tiebreaker).
 */
function h2hPointsAmong(
  group: readonly StandingsRow[],
  h2h: HeadToHeadMap,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const a of group) {
    let sum = 0;
    const aRow = h2h.get(a.clubId);
    if (aRow) {
      for (const b of group) {
        if (a.clubId === b.clubId) continue;
        sum += aRow.get(b.clubId) ?? 0;
      }
    }
    out.set(a.clubId, sum);
  }
  return out;
}

/**
 * Sort standings rows by the canonical order.
 *
 * Stable beyond ties (when fully tied AND no H2H AND no derby tiebreak): falls
 * to clubId lexicographic order so callers get deterministic output.
 */
export function computeStandingsSort(args: Readonly<StandingsSortArgs>): readonly StandingsRow[] {
  const { rows, headToHead, derbyPairs } = args;

  // Primary sort: points → goalDiff → goalsFor → clubId
  const sorted = [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const gdA = goalDifference(a);
    const gdB = goalDifference(b);
    if (gdA !== gdB) return gdB - gdA;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    return a.clubId.localeCompare(b.clubId); // deterministic fallback
  });

  if (!headToHead && !derbyPairs) return sorted;

  // Tiebreaks: walk through equal-on-primary groups and break with H2H + derby.
  const result: StandingsRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j]!.points === sorted[i]!.points &&
      goalDifference(sorted[j]!) === goalDifference(sorted[i]!) &&
      sorted[j]!.goalsFor === sorted[i]!.goalsFor
    ) {
      j++;
    }
    if (j - i === 1) {
      result.push(sorted[i]!);
      i = j;
      continue;
    }

    // Group is sorted[i..j-1]: tied on primary metrics.
    const group = sorted.slice(i, j);
    const tieBroken = breakTie(group, headToHead, derbyPairs);
    result.push(...tieBroken);
    i = j;
  }

  return result;
}

function breakTie(
  group: readonly StandingsRow[],
  headToHead: HeadToHeadMap | undefined,
  derbyPairs: ReadonlySet<string> | undefined,
): readonly StandingsRow[] {
  // H2H pass
  if (headToHead) {
    const h2h = h2hPointsAmong(group, headToHead);
    const byH2H = [...group].sort((a, b) => {
      const diff = (h2h.get(b.clubId) ?? 0) - (h2h.get(a.clubId) ?? 0);
      if (diff !== 0) return diff;
      return a.clubId.localeCompare(b.clubId);
    });

    // Detect H2H ties — split into subgroups for derby tiebreak
    return applyDerbyTiebreak(byH2H, h2h, derbyPairs);
  }

  // No H2H — straight derby pass
  if (derbyPairs && group.length === 2) {
    return applyDerbyTwo(group, derbyPairs);
  }

  return group;
}

function applyDerbyTiebreak(
  ordered: readonly StandingsRow[],
  h2h: ReadonlyMap<string, number>,
  derbyPairs: ReadonlySet<string> | undefined,
): readonly StandingsRow[] {
  if (!derbyPairs) return ordered;

  // Walk equal-H2H subgroups; pairs of derby rivals → home-derby +1
  const result: StandingsRow[] = [];
  let i = 0;
  while (i < ordered.length) {
    let j = i + 1;
    while (
      j < ordered.length &&
      (h2h.get(ordered[j]!.clubId) ?? 0) === (h2h.get(ordered[i]!.clubId) ?? 0)
    ) {
      j++;
    }
    if (j - i === 2) {
      const pair = ordered.slice(i, j);
      result.push(...applyDerbyTwo(pair, derbyPairs));
    } else {
      result.push(...ordered.slice(i, j));
    }
    i = j;
  }
  return result;
}

function applyDerbyTwo(
  pair: readonly StandingsRow[],
  derbyPairs: ReadonlySet<string>,
): readonly StandingsRow[] {
  const [a, b] = pair;
  if (!a || !b) return pair;
  if (!isDerbyPair(a.clubId, b.clubId, derbyPairs)) return pair;
  // Tiebreak: lexicographically-first clubId is "home of derby" → +1 in ranking
  if (a.clubId < b.clubId) return [a, b];
  return [b, a];
}

---
Story: LEAGUE-SYSTEM-003
Status: Ready
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-LGS-003 (standings sort: points → goal_diff → goals_for → head-to-head → derby +1)
Governing ADR: ADR-011, GDD §F3
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/league-system/standings-sort.test.ts
---

# Story 003: Standings Sort + Derby +1 Tiebreaker

> **Epic**: league-system | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5 days

## Context

Sort canonical order: points DESC → goal_difference DESC → goals_for DESC → head-to-head (mini-table) → **derby +1 tiebreaker** (per GDD R fix).

## Acceptance Criteria

*From GDD AC-LGS-07..10, AC-LGS-19:*

- [ ] **AC-LGS-07**: Two clubs same points + goal_diff → sorted by goals_for DESC.
- [ ] **AC-LGS-08**: Tie at goals_for → head-to-head sub-standings determines order.
- [ ] **AC-LGS-09**: `computeStandingsSort(rows)` is a pure function (no DB access).
- [ ] **AC-LGS-10**: F4 ceiling — degenerate goals_for (e.g. 100+ in 38 matches) handled without overflow.
- [ ] **AC-LGS-19**: Derby +1 — when two derby rivals are tied on H2H, the home-of-derby club gets +1 in the canonical sort (final tiebreaker).

## Implementation Notes

File: `packages/shared/src/sim/league-system/standings-sort.ts`

```typescript
export interface StandingsRow {
  readonly clubId: string;
  readonly points: number;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

export function computeStandingsSort(
  rows: readonly StandingsRow[],
  headToHead?: ReadonlyMap<string, ReadonlyMap<string, number>>, // optional H2H stats
  derbies?: ReadonlySet<[string, string]>, // pairs that are derbies
): readonly StandingsRow[];
```

## QA Test Cases

- Points-only sort
- Goal diff tiebreak
- Goals for tiebreak
- Head-to-head tiebreak (2 clubs)
- Derby +1 final tiebreak (AC-LGS-19)
- Determinism: 2 calls → identical order

## Dependencies

- Upstream: None
- Downstream: Story 004 (applyMatchToStandings uses this for re-sort)

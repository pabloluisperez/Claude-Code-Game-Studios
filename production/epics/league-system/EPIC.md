# Epic: League System

> **Layer**: Feature
> **GDD**: `design/gdd/league-system.md`
> **Architecture Module**: `apps/api/src/modules/league/` + `apps/api/src/modules/season/`
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories league-system`
> **Control Manifest**: 2026-05-19

## Overview

The league system owns the competitive scaffolding: 2 divisions × 20 clubs ×
38-matchday double round-robin schedule, standings table with canonical sort
order (points, goal difference, goals for, head-to-head, derby +1 tiebreaker),
promotion/relegation (3 up / 3 down at season_end), and rival club generation.
ADR-011 (updated 2026-05-18 from 16 → 20 clubs) defines the schema. The slice
implemented round-robin generation + standings updates + forceTargetSchedule
for the player's first 4 fixtures — production extends to full season +
promotion/relegation + real Spanish licenses (pending separately).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-011: League / Competition Schema | 6-table normalized schema; deterministic `generateRoundRobin`; standings table maintained post-match; promotion/relegation atomic at season_end | LOW (Drizzle 0.36+ verified by slice) |

## GDD Requirements

`design/gdd/league-system.md` AC-LGS-01 through AC-LGS-24 (2026-05-17 review:
18 blockers resolved). Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-06 | Round-robin generation: 20 clubs × 38 matchdays × 10 matches | ADR-011 ✅ |
| AC-07 – AC-10 | Standings sort order: points → goal_diff → goals_for → head-to-head → derby+1 | ADR-011 + GDD F3 ✅ |
| AC-11 – AC-14 | F4 ceiling: standings updates clamped vs degenerate goal counts | GDD F4 ✅ |
| AC-15 – AC-18 | Forfeit pct (canonical 63%) → 0-3 default + standings impact | player-management + ADR-011 ✅ |
| AC-19 – AC-22 | Derby +1 draw tiebreaker per AC fix; rival club detection | ADR-011 ✅ |
| AC-23 – AC-24 | OQ-LGS-06 contratos descenso (player contracts trigger on relegation) | ADR-011 ✅ (player-management implements the contract path) |

**Real Spanish data**: AC-25 (placeholder) — using real Primera/Segunda clubs
requires licensing. MVP ships with procedural-but-Spanish-flavored names
(slice's pattern); real licenses pending separately.

## Engine Risk

LOW. Drizzle 0.36+ patterns verified by slice (including the partial UNIQUE
INDEX for ADR-013 same pattern applies here for season-active checks).
Determinism: `generateRoundRobin` with same input order → same fixtures.

## Definition of Done

- 6 Drizzle tables per ADR-011 §Drizzle Schema Addition (`clubs`, `leagues`,
  `divisions`, `seasons`, `fixtures`, `standings`) all with `xxxRelations` exports
- `generateRoundRobin(ctx, clubIds, startWeek)` pure function in
  `packages/shared/src/sim/league-fixtures.ts` (slice has this in
  `src/db/fixture-gen.ts`; production extracts to shared package per ADR-002)
- `applyMatchToStandings(tx, fixture, outcome)` post-match transactional updater
- `processSeasonEnd(tx, seasonId, playthroughId)` — 3 up / 3 down with atomic
  swap + new season construction
- Derby +1 tiebreaker applied during standings sort
- Forfeit handler: when `squad_available_pct ≤ 63` at fixture time, fixture
  resolves 0-3 with `mpi_delta=-30`
- `getStandings(playthroughId)` returns sorted standings + computed
  `goalDifference` + `position` (slice has this)
- 80% test coverage on `generateRoundRobin` (the 8 slice tests are the template)
- Determinism test: same `clubIds` → identical fixture list per round-robin call
- Validation tests: 20 clubs → 380 fixtures × 38 matchdays × 10 matches; every
  pair plays exactly twice; no self-matches

## Dependencies

- **Upstream blockers**: None at the schema level. Foundation layer (cascade-engine + match-simulation) is the consumer chain.
- **Downstream consumers**: match-simulation (consumes fixtures + writes outcomes
  → standings), economy (TV rights tier scales with division), event-system
  (derbi announcement, season_start, season_end events), hud-ui (league table)

## Stories

| # | Story | Type | Status | ADR |
|---|---|---|---|---|
| 001 | 5 Drizzle tables (leagues/divisions/seasons/fixtures/standings) | Integration | Ready | ADR-011 |
| 002 | generateRoundRobin (pure, deterministic) | Logic | Ready | ADR-011 |
| 003 | Standings sort + Derby +1 tiebreaker | Logic | Ready | ADR-011 |
| 004 | applyMatchToStandings (post-match) | Integration | Ready | ADR-011 |
| 005 | processSeasonEnd (3 up / 3 down) | Integration | Ready | ADR-011 |
| 006 | Forfeit handler integration | Integration | Ready | ADR-011 |
| 007 | Derby detection + rival club | Logic | Ready | ADR-011 |

**Story 001 unblocks MATCH-SIM-015** (match_sessions table needs fixtures FK).

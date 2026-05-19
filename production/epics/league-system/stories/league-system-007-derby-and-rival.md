---
Story: LEAGUE-SYSTEM-007
Status: Ready
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-LGS-007 (Derby detection + rival club identification)
Governing ADR: ADR-011
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/league-system/derby-detection.test.ts
---

# Story 007: Derby Detection + Rival Club Identification

> **Epic**: league-system | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5 days

## Context

Derbies are city-pair fixtures (same `city` field on `clubs`). Used for:
1. Derby +1 tiebreaker in standings sort (Story 003).
2. Special match events (`derby_match` calendar_event).
3. UI highlights in fixture list.

## Acceptance Criteria

*From GDD AC-LGS-19..22:*

- [ ] **AC-LGS-19**: `isDerby(homeClub, awayClub)` returns true when `homeClub.city === awayClub.city`.
- [ ] **AC-LGS-20**: `findDerbiesInSeason(fixtures, clubs)` returns the list of fixture IDs that are derbies.
- [ ] **AC-LGS-21**: Rival detection — for the player's club, find the highest-ranked club from the same city (or fallback to the closest geographic match — out of scope MVP, falls to same-city only).
- [ ] **AC-LGS-22**: `getRivalClub(playerClub, allClubs)` returns the rival or null if no same-city club exists.

## Implementation Notes

File: `packages/shared/src/sim/league-system/derby.ts`

Pure functions, no DB access. Caller hydrates clubs from `PlayersRepo` equivalent.

```typescript
export function isDerby(home: Club, away: Club): boolean;
export function findDerbiesInSeason(
  fixtures: readonly Fixture[],
  clubsById: ReadonlyMap<string, Club>,
): readonly string[]; // fixture ids
export function getRivalClub(
  playerClub: Club,
  allClubs: readonly Club[],
): Club | null;
```

## QA Test Cases

- Same-city pair → isDerby=true
- Different cities → isDerby=false
- findDerbiesInSeason with 380 fixtures of which 5 are derbies → returns 5 ids
- getRivalClub returns first match by name lexicographic order when multiple same-city clubs exist (deterministic)
- No same-city rival → returns null

## Dependencies

- Upstream: Story 001 (clubs table exists already, plus the city field)
- Downstream: Story 003 (standings sort uses derby pairs)

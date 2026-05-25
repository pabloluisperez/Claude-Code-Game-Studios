---
Story: TROPHIES-HISTORY-002
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Logic
GDD Requirement: AC-TH-09 (legendary match), F1-F5
Governing ADR: ADR-030
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/museum/formulas.test.ts (18/18 passing)
ImplementedAt: packages/shared/src/sim/museum/{types,formulas}.ts
---

# Story: Museum formulas (F1-F5) + types

## Goal

Implement the 5 formulas from `trophies-history.md §4`: `legendary_match_qualifies`, `top_player_flag`, `legend_transfer_qualifies`, `museum_objects_count`, `museum_density`. All pure functions for deterministic categorization.

## Scope

In `packages/shared/src/sim/museum/types.ts` (new):

```typescript
export type Division = 'D1' | 'D2';
export type MatchResult = {
  goalsFor: number;
  goalsAgainst: number;
  fan_momentum_delta: number;
  is_derby: boolean;
  is_cup_final: boolean;
  result: 'win' | 'draw' | 'loss';
};
export type Transfer = { value_eur_k: number; direction: 'in' | 'out' };
export type PlayerCareerHistory = { max_consecutive_weeks_in_top5: number };
```

In `packages/shared/src/sim/museum/formulas.ts` (new):

```typescript
export const LEGENDARY_THRESHOLD = 15;
export const LANDSLIDE_THRESHOLD = 5;
export const TOP_5_MIN_WEEKS = 20;
export const LEGEND_TRANSFER_THRESHOLD: Record<Division, number> = { D1: 2000, D2: 500 };
export const MUSEUM_FULL_OBJECTS = 100;
export const MUSEUM_PERF_CAP = 250;

export function legendaryMatchQualifies(m: MatchResult): boolean {
  return Math.abs(m.fan_momentum_delta) > LEGENDARY_THRESHOLD
    || (m.goalsFor - m.goalsAgainst) >= LANDSLIDE_THRESHOLD
    || (m.is_derby && m.result === 'win')
    || m.is_cup_final;
}

export function topPlayerFlag(career: PlayerCareerHistory): boolean {
  return career.max_consecutive_weeks_in_top5 >= TOP_5_MIN_WEEKS;
}

export function legendTransferQualifies(t: Transfer, clubDivision: Division): boolean {
  return t.value_eur_k >= LEGEND_TRANSFER_THRESHOLD[clubDivision];
}

export function museumObjectsCount(c: {
  trophies: number; banners: number; legendTransfers: number; financialMilestones: number; stadiumHistory: number;
}): number {
  return c.trophies + c.banners + c.legendTransfers + c.financialMilestones + c.stadiumHistory;
}

export function museumDensity(objectsCount: number): number {
  return Math.min(1, objectsCount / MUSEUM_FULL_OBJECTS);
}
```

## Out of Scope

- DB queries that apply these filters (story 001)
- Text generation (story 003)

## Acceptance Criteria

1. `legendaryMatchQualifies({fan_momentum_delta: 16, ...})` → true
2. `legendaryMatchQualifies({goalsFor: 5, goalsAgainst: 0, fan_momentum_delta: 5, ...})` → true (landslide)
3. `legendaryMatchQualifies({is_derby: true, result: 'win', fan_momentum_delta: 0, ...})` → true
4. `legendaryMatchQualifies({is_cup_final: true, ...})` → true
5. `legendaryMatchQualifies({fan_momentum_delta: 10, goalsFor: 1, goalsAgainst: 0, is_derby: false, is_cup_final: false})` → false
6. `topPlayerFlag({max_consecutive_weeks_in_top5: 20})` → true
7. `topPlayerFlag({max_consecutive_weeks_in_top5: 19})` → false
8. `legendTransferQualifies({value_eur_k: 600}, 'D2')` → true
9. `legendTransferQualifies({value_eur_k: 600}, 'D1')` → false
10. `museumDensity(50)` → 0.5
11. `museumDensity(150)` → 1.0 (capped)
12. Pure functions: no I/O, no random, no time

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/museum/formulas.test.ts`:

- All 12 ACs as test cases
- Edge: `museumObjectsCount({0,0,0,0,0})` → 0
- Edge: `museumDensity(0)` → 0

## Dependencies

- **Upstream**: none — pure logic
- **Downstream**: 001 (service uses these filters), 005 (interior scene uses density for LoD)

## Estimate

**0.5 day.** Tiny pure functions + tiny test file.

## Notes / Gotchas

- These thresholds are tuning knobs — surfaced in trophies-history.md §7 — keep them as exported constants for easy override
- Future v1.2+: legendary match definition may include "comeback wins" (player_momentum positive delta with negative goal_diff at HT) — leave function signature flexible enough

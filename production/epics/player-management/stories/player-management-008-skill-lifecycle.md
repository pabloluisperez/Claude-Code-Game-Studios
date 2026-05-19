---
Story: PLAYER-MANAGEMENT-008
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-008 (AC-PM-13..15 development + AC-PM-25..27 F12 degradation)
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/skill-lifecycle.test.ts
---

# Story 008: F12 Skill Degradation + End-of-Season Development

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 0.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-008` — F12 weekly skill micro-decay for veterans, end-of-season development for young players, potential_ceiling constraint.

**ADR Governing Implementation**: ADR-016
**ADR Decision Summary**: F12 applied weekly BEFORE cascade tick. End-of-season development applied in `processSeasonEnd` transaction. Both are pure functions.

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-25**: `computeF12Degradation(age=33, skill=72)` = `70` (`decay = min(2, floor((33-29)/2)) = 2; skill = max(20, 72-2) = 70`).
- [ ] **AC-PM-26**: `computeF12Degradation(age=28, skill=72)` = `72` (no decay — age < 30).
- [ ] age=30 → decay=0 (first transition year, no change); age=31 → decay=1; age=33+ → decay=2 (max).
- [ ] Skill floor at 20: `computeF12Degradation(age=35, skill=21)` = 20 (not 19).
- [ ] `computeWeeklySkillDrift(player, age)` implements ADR-016's continuous micro-decay table: age<28→0; age<30→-0.05; age<32→-0.1; age<34→-0.2; else→-0.4. Result floored at skill≥20.
- [ ] **AC-PM-13**: `computeEndOfSeasonDevelopment(age=22, skill=65, potentialCeiling=80, minutesPlayedSeason=1520, maxMinutesSeason=3420)` → `skill=67` (DEVELOPMENT_THRESHOLD=0.40: 1520≥1368 → skill += min(2, 80-65)=2 → 67).
- [ ] **AC-PM-14**: With `minutesPlayedSeason=1000` (<1368) → `skill=65` (no development).
- [ ] **AC-PM-15**: age≥30 → development does not apply (potential_ceiling N/A).
- [ ] **AC-PM-27**: `computeEndOfSeasonDevelopment(age=22, skill=80, potentialCeiling=80, minutes=1520, ...)` → `skill=80` (already at ceiling — `min(2, 80-80)=0`).
- [ ] `computeEndOfSeasonDevelopment` is pure — no DB access.

## Implementation Notes

File: `packages/shared/src/sim/player-management/skill-lifecycle.ts`

```typescript
export const DEVELOPMENT_THRESHOLD = 0.40;
export const SKILL_DECAY_MAX = 2;

export function computeF12Degradation(age: number, skill: number): number { ... }
export function computeWeeklySkillDrift(age: number, skill: number): number { ... }
export function computeEndOfSeasonDevelopment(args: {
  age: number; skill: number; potentialCeiling: number;
  minutesPlayedSeason: number; maxMinutesSeason: number;
}): number { ... }
```

## Out of Scope

- Writing skill updates to DB
- The processSeasonEnd transaction (economy/advance-worker epic)
- Aging admin pass (ADR-016 mentions flagging age>35 for v1.1+ retirement)

## QA Test Cases

- **AC-1**: `computeF12Degradation(33, 72)` → 70 (AC-PM-25)
- **AC-2**: `computeF12Degradation(28, 72)` → 72 (AC-PM-26)
- **AC-3**: `computeF12Degradation(30, 72)` → 72 (age=30, decay=0)
- **AC-4**: `computeF12Degradation(35, 21)` → 20 (floor at 20, AC-PM floor)
- **AC-5**: `computeEndOfSeasonDevelopment({age:22, skill:65, potentialCeiling:80, minutesPlayedSeason:1520, maxMinutesSeason:3420})` → 67 (AC-PM-13)
- **AC-6**: Same with minutesPlayedSeason=1000 → 65 (AC-PM-14)
- **AC-7**: `computeEndOfSeasonDevelopment({age:22, skill:80, potentialCeiling:80, minutes:1520, max:3420})` → 80 (AC-PM-27)
- **AC-8**: `computeEndOfSeasonDevelopment({age=31, ...})` → skill unchanged (age ≥ 30, AC-PM-15)
- **AC-9**: `computeWeeklySkillDrift(35, 80)` → 79.6 (drift -0.4/week, capped at 80)

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/skill-lifecycle.test.ts` — must pass

## Dependencies

- Depends on: Story 003 (player types + age calculation from birthWeek)
- Unlocks: Story 010 (transfer market uses transfer_value which depends on skill)

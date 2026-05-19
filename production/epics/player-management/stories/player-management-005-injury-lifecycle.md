---
Story: PLAYER-MANAGEMENT-005
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-005 (AC-PM-07..09, AC-PM-20, AC-PM-21 — injury/suspension status + F7 fitness)
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/lifecycle.test.ts
---

# Story 005: Injury/Suspension Lifecycle + F7 Fitness Recovery

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 1 day
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-005` — player status transitions (available ↔ injured ↔ suspended), F7 fitness recovery, lineup exclusion of unavailable players.

**ADR Governing Implementation**: ADR-016
**ADR Decision Summary**: Status transitions are driven by match events (injury event → status='injured', red_card → status='suspended'). Weekly tick decrements recovery_weeks_remaining; when it hits 0, status reverts to 'available'. Fitness recovery applies each week without a match.

**Control Manifest Rules (Core layer)**:
- Required: Pure functions for transition logic — injectable state
- Required: `ctx.rng()` for injury duration sampling (ADR-002)
- Forbidden: `Math.random()` anywhere in injury logic

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-07**: `applyInjuryEvent(player, severity, ctx)` with `recovery_weeks_remaining=3` → `player.status = 'injured'`, `player.injuredUntilWeek = currentWeek + 3`.
- [ ] **AC-PM-08**: `applyWeeklyRecovery(player, currentWeek)` with `injuredUntilWeek = currentWeek` → `player.status = 'available'`, `player.injuredUntilWeek = null`.
- [ ] **AC-PM-09**: `buildMatchLineup(players, savedLineup)` excludes any player with `status !== 'available'` and auto-fills from bench.
- [ ] Suspension: a red card event sets `status='suspended'`; one weekly tick reverts to `'available'`.
- [ ] **AC-PM-20**: `computeFitnessPostMatch(70, 70, 90)` (fitness=70, stamina=70, minutes=90) = `70 - 15 × (90/90) × (1-0.7) = 65.5`.
- [ ] **AC-PM-21**: `computeFitnessRecovery(65)` (no match this week) = `min(100, 65 + 8.0) = 73.0`.
- [ ] Fitness clamped [0, 100] in both directions.
- [ ] Injury duration range: `injuryWeeks` drawn from `rng(INJURY_MIN_WEEKS=1, INJURY_MAX_WEEKS=6)` using `ctx.rng()`. Test with spy to confirm single rng() call.

## Implementation Notes

File: `packages/shared/src/sim/player-management/lifecycle.ts`

```typescript
export const INJURY_MIN_WEEKS = 1;
export const INJURY_MAX_WEEKS = 6;
export const FITNESS_RECOVERY_WEEKLY = 8.0;
export const FITNESS_DECAY_MAX = 15;

export function applyInjuryEvent(player, severity, ctx): PlayerPatch { ... }
export function applyWeeklyRecovery(player, currentWeek): PlayerPatch { ... }
export function computeFitnessPostMatch(fitness, stamina, minutesPlayed): number { ... }
export function computeFitnessRecovery(fitness): number { ... }
export function buildMatchLineup(players, savedLineup): PlayerSlot[] { ... }
```

`PlayerPatch` is a partial update shape (not mutating the original) compatible with PlayersRepo.updatePlayer.

## Out of Scope

- Writing the patch to DB (done by advance-worker via PlayersRepo.updatePlayer)
- F11 morale update (story 007)
- squad_available_pct cascade sync (story 006)

## QA Test Cases

- **AC-1**: `applyInjuryEvent(player, 'minor', ctx)` → status='injured', injuredUntilWeek set to currentWeek + N where N ∈ [1, 6]
- **AC-2**: `applyWeeklyRecovery(player, week=5)` where `injuredUntilWeek=5` → status='available'
- **AC-3**: `applyWeeklyRecovery(player, week=4)` where `injuredUntilWeek=5` → status unchanged (still injured)
- **AC-4**: Rng spy: `applyInjuryEvent` calls `ctx.rng()` exactly once for injury duration
- **AC-5**: `computeFitnessPostMatch(70, 70, 90)` → 65.5 (AC-PM-20)
- **AC-6**: `computeFitnessRecovery(65)` → 73.0 (AC-PM-21)
- **AC-7**: `computeFitnessRecovery(96)` → 100 (clamped)
- **AC-8**: `buildMatchLineup` with 1 injured starter → returns lineup with bench substitute in that slot
- **AC-9**: No `Math.random()` call in lifecycle.ts — grep test

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/lifecycle.test.ts` — must exist and pass

## Dependencies

- Depends on: Story 003 (player types from world-gen match lifecycle's PlayerState)
- Unlocks: Story 006 (squad_available_pct depends on availability status)

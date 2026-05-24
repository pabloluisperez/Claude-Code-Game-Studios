---
Story: PLAYER-MANAGEMENT-006
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-006 (F8 squad_available_pct, F9 team_skill, F9b player_happiness — WorldState PlayerDecisions)
Governing ADR: ADR-016 (Player Lifecycle), ADR-003 (Cascade Engine — PlayerDecision in Step 3)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/world-state-sync.test.ts
---

# Story 006: F8 squad_available_pct + F9 team_skill + F9b player_happiness WorldState Sync

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 1 day
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-006` — F8, F9, F9b: three WorldState node updates pushed as PlayerDecisions in Cascade Step 3.

**ADR Governing Implementation**: ADR-016 + ADR-003 (Cascade Engine Rule — PlayerDecisions in Step 3)
**ADR Decision Summary**: player-management computes three deltas and pushes them to the cascade engine as `PlayerDecision` objects in Paso 3 each weekly advance(). These are NOT direct mutations of WorldState — they flow through the cascade's additive delta system.

**Control Manifest Rules (Foundation/Core)**:
- Required: Cascade edges read prevState only — these writes go via PlayerDecision, not edgeTransferFn
- Required: `squad_available_pct` denominator is `SQUAD_REGISTERED_SIZE = 25` (canonical constant from league-system.md)

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-10**: `computeSquadAvailablePct(14, 18)` = `78` (round(14/18×100)) — BUT: F8 uses the canonical denominator `SQUAD_REGISTERED_SIZE=25` per GDD note. So `computeSquadAvailablePct(14, 25)` = `56`. Test BOTH variants and verify which is canonical.
- [ ] **AC-PM-11**: `squad_available_pct = round(10/25×100) = 40` ≤ 63% triggers forfeit signal. `squad_available_pct = round(16/25×100) = 64` → no forfeit.
- [ ] **AC-PM-12**: `computeTeamSkill([75,72,68,70,65,71,66,74,68,72,69])` = `70` (round(770/11)).
- [ ] **AC-PM-22**: After 2 players become injured (status changes), the next `computeSquadAvailablePct` reflects the new count. Test via integration: update 2 players to 'injured', recompute → pct is lower.
- [ ] `computePlayerHappinessDelta(startingEleven, prevPlayerHappiness)` returns the delta per F9b (round(mean(morale of 11)) − prevPlayerHappiness). Can be positive, negative, or 0.
- [ ] All three compute functions are pure (no DB access, injectable inputs).
- [ ] `buildWorldStateDecisions(squadCounts, startingEleven, prevState)` returns `PlayerDecision[]` with exactly 3 entries: `squad_available_pct`, `team_skill`, `player_happiness` deltas.

## Implementation Notes

File: `packages/shared/src/sim/player-management/world-state-sync.ts`

```typescript
export const SQUAD_REGISTERED_SIZE = 25;
export const FORFEIT_SQUAD_PCT_THRESHOLD = 63;

export function computeSquadAvailablePct(availableCount: number): number {
  return Math.round((availableCount / SQUAD_REGISTERED_SIZE) * 100);
}

export function computeTeamSkill(startingElevenSkills: number[]): number { ... }
export function computePlayerHappinessDelta(startingEleven, prevPlayerHappiness): number { ... }
export function buildWorldStateDecisions(...): PlayerDecision[] { ... }
```

## Out of Scope

- The cascade engine itself applying these decisions (already implemented in runTick Step 3)
- Forfeit detection logic (in match-simulation.ts, already done in MATCH-SIM-011)

## QA Test Cases

- **AC-1**: `computeSquadAvailablePct(14)` using denominator=25 → 56 (AC-PM-10 canonical)
- **AC-2**: `computeSquadAvailablePct(16)` → 64 > 63 → no forfeit; `computeSquadAvailablePct(15)` → 60 ≤ 63 → forfeit (AC-PM-11)
- **AC-3**: `computeTeamSkill([75,72,68,70,65,71,66,74,68,72,69])` → 70 (AC-PM-12)
- **AC-4**: `computePlayerHappinessDelta` with all 11 morale=65, prevPlayerHappiness=60 → delta=+5
- **AC-5**: `buildWorldStateDecisions` returns array of exactly 3 PlayerDecisions with nodeIds ['squad_available_pct', 'team_skill', 'player_happiness']
- **AC-6**: `computeSquadAvailablePct` is pure — no Math.random, no DB calls

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/world-state-sync.test.ts` — must pass

## Dependencies

- Depends on: Story 005 (availability status used to count available players)
- Unlocks: Story 006 provides the PlayerDecisions that the cascade engine consumes each tick

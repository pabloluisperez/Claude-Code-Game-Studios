---
Story: PLAYER-MANAGEMENT-003
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-002 (F1 computeSkill), TR-PM-003 (generateRoster determinism)
Governing ADR: ADR-016 (Player Lifecycle), ADR-002 (PRNG determinism)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/world-gen.test.ts
---

# Story 003: F1 computeSkill + generateRoster World-Gen

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 1.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirements**: `TR-PM-002` (F1 skill formula by position), `TR-PM-003` (world-gen produces 40 players/club deterministically from a seed).

**ADR Governing Implementation**: ADR-016 — Player Lifecycle
**ADR Decision Summary**: World-gen runs at playthrough creation as a single deterministic batch. Location: `packages/shared/src/sim/world-gen.ts`. Uses `ctx.rng()` exclusively (ADR-002).

**Engine**: Web TypeScript | **Risk**: LOW

**Control Manifest Rules**:
- Required: `ctx.rng()` is the ONLY source of randomness — no `Math.random()`
- Required: same seed + same inputs → identical player roster

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-01**: `computeSkill('FWD', { finishing: 80, speed: 75, dribbling: 70 })` = `76.0` (80×0.45 + 75×0.30 + 70×0.25).
- [ ] **AC-PM-02**: `computeSkill('GK', { reflexes: 90, handling: 80, kicking: 60 })` = `79.0` (90×0.40 + 80×0.35 + 60×0.25).
- [ ] `computeSkill` supports all 4 positions with their respective weight formulas (GK/DEF/MID/FWD).
- [ ] `computeSkill` output is clamped to [20, 95].
- [ ] `generateRoster(args)` returns exactly `rosterSize` (default 40) players.
- [ ] Position distribution matches ADR-016: 4 GK, 12 DEF, 12 MID, 12 FWD.
- [ ] Age distribution matches ADR-016: 30% age 18-23, 50% age 24-29, 20% age 30-35.
- [ ] **Determinism**: `generateRoster({ ctx, clubBaseSkill: 60, ... })` called twice with the same seeded ctx produces identical players (same order, same stats, same names).
- [ ] `skill` values follow a normal-ish distribution centred on `clubBaseSkill` with σ≥5, within [20, 95].
- [ ] `form` defaults to 60 ± 5 jitter; `morale` = 60; `stamina` = 70 ± 10.
- [ ] Each player has a `firstName` + `lastName` from a bounded name pool (not empty strings).
- [ ] Contract start/end set correctly: all initial players have contracts 2 seasons long (~104 weeks), with ~30% staggered to expire at end of each season.

## Implementation Notes (from ADR-016)

File: `packages/shared/src/sim/world-gen.ts`

```typescript
export function computeSkill(position: 'GK' | 'DEF' | 'MID' | 'FWD', stats: PositionStats): number {
  // Weight formulas from player-management.md §F1
  const raw = ... // position-weighted mean
  return Math.min(95, Math.max(20, Math.round(raw)));
}

export function generateRoster(args: {
  ctx: SimContext;
  clubBaseSkill: number;
  clubSlug: string;
  rosterSize?: number; // default 40
  currentWeek: number;
}): GeneratedPlayer[];
```

The name pool is a static array in `packages/shared/src/sim/name-pool.ts` — Spanish-biased (per `nationality: 'ES'` default). Use `ctx.rng()` to select names deterministically.

Position-stat generation: draw from normal-ish distribution using Box-Muller approximation via `ctx.rng()`. Apply position bias as documented in ADR-016.

## Out of Scope

- Inserting players to DB (story 002's repo handles INSERTs; story 003 only returns `GeneratedPlayer[]`)
- The playthrough creation flow that calls generateRoster (economy epic)

## QA Test Cases

- **AC-1**: `computeSkill('FWD', {finishing:80, speed:75, dribbling:70})` → 76.0 (AC-PM-01)
- **AC-2**: `computeSkill('GK', {reflexes:90, handling:80, kicking:60})` → 79.0 (AC-PM-02)
- **AC-3**: `computeSkill('FWD', {finishing:20, speed:20, dribbling:20})` → 20 (min clamp)
- **AC-4**: Determinism: same seed × 2 runs → identical 40-player roster (AC-PM-01 extension)
- **AC-5**: Position distribution: roster has exactly 4 GK, 12 DEF, 12 MID, 12 FWD
- **AC-6**: No `Math.random()` calls — grep test on `world-gen.ts`
- **AC-7**: `skill` of all 40 players ∈ [20, 95]
- **AC-8**: Contract staggering: ~10-14 players have `contractEndWeek ≤ currentWeek + 56` (end of season 1)

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/world-gen.test.ts` — must exist and pass

## Dependencies

- Depends on: Story 002 (GeneratedPlayer type matches players schema)
- Unlocks: Story 005 (injury uses player state), Story 009 (transfer value uses player stats)

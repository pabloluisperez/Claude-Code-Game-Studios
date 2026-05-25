---
Story: STADIUM-UPGRADES-003
Status: Ready
Type: Logic
GDD Requirement: AC-SU-09/10/11/16/17 + F1 + F3 formulas
Governing ADR: ADR-029, ADR-002 (determinism), city-progression §4.2 superseded
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/stadium/visual-level.test.ts + infrastructure.test.ts (pending)
ImplementedAt: packages/shared/src/sim/stadium/{types,visual-level,infrastructure}.ts
---

# Story: Domain types + F1 stadium_visual_level + F3 infrastructure_level

## Goal

Implement the two computed-on-read formulas in pure TypeScript (deterministic, no I/O). F1 (`stadium_visual_level`) drives sprite selection at `/stadium`; F3 (`infrastructure_level`) **supersedes** the formula in `city-progression.md §4.2`.

## Scope

In `packages/shared/src/sim/stadium/types.ts` (new file):

```typescript
export type Track = 'gradas' | 'pitch' | 'servicios' | 'training' | 'academy';
export type ItemTier = 1 | 2 | 3 | 4;
export type ItemStatus = 'queued' | 'in_progress' | 'complete' | 'cancelled';

export type StadiumState = {
  stadium_upgrade_count: number;   // sum of completed items in 3 stadium tracks (max 24)
  training_facility_level: number; // completed items in training track (max 8)
  youth_academy_level: number;     // completed items in academy track (max 8)
};

export type CompletedItemsByTrack = {
  gradas: number;
  pitch: number;
  servicios: number;
};
```

In `packages/shared/src/sim/stadium/visual-level.ts` (new file):

```typescript
export const G_MAX = 8;
export const P_MAX = 8;
export const S_MAX = 8;
export const W_VISUAL_GRADAS = 0.45;
export const W_VISUAL_PITCH = 0.35;
export const W_VISUAL_SERVICIOS = 0.20;

export function stadiumVisualLevel(state: CompletedItemsByTrack): number {
  const svlRaw =
    (state.gradas / G_MAX) * W_VISUAL_GRADAS +
    (state.pitch / P_MAX) * W_VISUAL_PITCH +
    (state.servicios / S_MAX) * W_VISUAL_SERVICIOS;
  return clamp(Math.floor(svlRaw * 9.99), 0, 9);
}
```

In `packages/shared/src/sim/stadium/infrastructure.ts` (new file):

```typescript
export const STADIUM_ITEMS_MAX = 24;
export const TRAINING_ITEMS_MAX = 8;
export const ACADEMY_ITEMS_MAX = 8;
export const W_INFRA_STADIUM = 0.50;
export const W_INFRA_TRAINING = 0.25;
export const W_INFRA_ACADEMY = 0.25;

export function infrastructureLevel(state: StadiumState): number {
  const stadiumScore = state.stadium_upgrade_count / STADIUM_ITEMS_MAX;
  const trainingScore = state.training_facility_level / TRAINING_ITEMS_MAX;
  const academyScore = state.youth_academy_level / ACADEMY_ITEMS_MAX;
  const raw = (stadiumScore * W_INFRA_STADIUM + trainingScore * W_INFRA_TRAINING + academyScore * W_INFRA_ACADEMY) * 100;
  return clamp(Math.round(raw), 0, 100);
}
```

Plus a shared `clamp(n, min, max)` helper in `packages/shared/src/sim/util.ts` (if not already present).

**Replace existing call sites** of the old `infrastructureLevel` formula (search codebase for `stadium_upgrade_count * 5 + training_facility_level * 5` or similar) with imports of this new function. If no call sites exist yet (because city-progression was never implemented), this story is purely additive.

## Out of Scope

- F2 duration / F4 cost / F5 capacity / F6 gate (story 004)
- Service / DB integration (story 005)
- UI integration (story 008)

## Acceptance Criteria

1. **F1**: `stadiumVisualLevel({gradas: 4, pitch: 6, servicios: 2})` returns `5` (per GDD example §4 F1)
2. **F1**: `stadiumVisualLevel({gradas: 0, pitch: 0, servicios: 0})` returns `0`
3. **F1**: `stadiumVisualLevel({gradas: 8, pitch: 8, servicios: 8})` returns `9`
4. **F1**: Property test 1000 random inputs — output always in `[0, 9]` and monotonic (completing 1 item never decreases output)
5. **F3**: `infrastructureLevel({stadium_upgrade_count: 24, training_facility_level: 4, youth_academy_level: 2})` returns `69` (per GDD example §4 F3)
6. **F3**: `infrastructureLevel({0, 0, 0})` returns `0`
7. **F3**: `infrastructureLevel({24, 8, 8})` returns `100`
8. **F3**: Property test — output always in `[0, 100]`
9. Pure functions: no `Math.random()`, no `Date.now()`, no I/O — verified by lint rule
10. TypeScript strict mode: no `any`, no `@ts-ignore`

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/stadium/visual-level.test.ts`:

- Spot checks per AC 1-3
- Property test: 1000 random `CompletedItemsByTrack` with all values in `[0, 8]` → output in `[0, 9]`
- Monotonicity test: for state s and state s' where s'.x >= s.x for all x, expect `stadiumVisualLevel(s') >= stadiumVisualLevel(s)`

`packages/shared/tests/stadium/infrastructure.test.ts`:

- Spot checks per AC 5-7
- Property test: 1000 random `StadiumState` with bounds → output in `[0, 100]`
- Verify pitch surface thresholds align (input that produces 25 → Patchy zone per city-progression §3.3)

## Dependencies

- **Upstream**: 001 (StadiumState shape mirrors WorldState columns), 002 (catalog defines max counts)
- **Downstream**: 005 (service uses F3 to update WorldState), 008 (UI uses F1 to pick sprite)

## Estimate

**1 day.** 2 small files + 2 test files.

## Notes / Gotchas

- The `× 9.99` in F1 is intentional — prevents `floor(9.99) = 9` issues. Do NOT change to `× 10` or `× 9`.
- F3 is the supersede of `city-progression.md §4.2`. Document the supersede in code with a JSDoc comment pointing to ADR-029.
- These are **computed values, not persisted**. Re-call on every read. Do NOT cache in DB columns.
- Future v1.2+ tuning may add per-tier weights (e.g., T4 items contribute more) — leave constants exported for easy override.

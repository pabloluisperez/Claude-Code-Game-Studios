---
Story: CASCADE-ENGINE-004
Status: Pending
Type: Logic
GDD Requirement: cascade-engine.md §States and Transitions (Steps 1–6 of the weekly tick) + AC-ADD-01, AC-ADD-02, AC-CLM-01 through AC-CLM-05
Governing ADR: ADR-002 (determinism), ADR-003 (Rule 3 prevState-only, Rule 4 additive composition, Rule 5 delays)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/runtick-skeleton.test.ts
---

# Story: runTick() Pure Function — Steps 1, 4, 6 Skeleton + Composition Plumbing

## Goal

Implement the spine of `runTick()`: the public `(ctx, graph, prevState, decisions, buffer) → TickResult` signature; Step 1 (apply delayed effects whose `applyAt === ctx.currentWeek`); Step 4 (clamp final values to `NODE_RANGES`); Step 6 (return `TickResult`). The Step 2 (edge evaluation) and Step 3 (PlayerDecisions) implementations are stubbed and land in story 005. Step 5 (threshold detection) lands in story 014.

This story establishes:
1. The pure-function contract — same inputs (including `ctx.rng` seed state) → same `TickResult`. No I/O, no `Date.now()`, no `Math.random()`.
2. The deltaMap pattern for additive composition (Rule 4): a `Map<NodeId, number>` (in-memory only — never serialized) accumulates deltas through Steps 1–3 and is applied once at Step 4 with clamping.
3. The Readonly contract — `prevState` is typed `Readonly<WorldState>` and is NEVER mutated. `nextState` is built from `{...prevState}` and the accumulated deltaMap.

## Scope

In `packages/shared/src/sim/cascade-engine.ts` (new file):

```
export function runTick(
  ctx: SimContext,
  graph: readonly CascadeEdgeDef[],
  prevState: Readonly<WorldState>,
  decisions: readonly PlayerDecision[],
  buffer: DelayedEffectsBuffer
): TickResult
```

Body order (mirrors GDD §States and Transitions):

- **Step 1**: `const { due, remaining } = popEffectsDueAt(buffer, ctx.currentWeek);` — accumulate each `due` effect's delta into `deltaMap`. Append a `CascadeLog` entry (`{ source: 'delayed', edgeId, toNode, delta }`) per consumed effect.
- **Step 2**: STUB — story 005. Call `evaluateEdges(graph, prevState, ctx)` (which will return `{ deltas: Map<NodeId, number>; newDelayed: DelayedEffect[]; logs: CascadeLog[] }`) and merge into `deltaMap` + `newDelayedEffects` + `log`. For this story, `evaluateEdges` returns empty arrays / empty map (placeholder).
- **Step 3**: STUB — story 005. Apply `decisions` deltas additively into `deltaMap`. For this story, accept a non-empty decisions array and merge it correctly (so AC-PLD-01 / AC-PLD-04 are unlocked without waiting for story 005).
- **Step 4**: Build `nextState`. For each `NodeId`: `nextState[node] = clamp(prevState[node] + (deltaMap.get(node) ?? 0), NODE_RANGES[node].min, NODE_RANGES[node].max)`.
- **Step 5**: STUB — story 014. Return `thresholdCrossings: []` for now.
- **Step 6**: Return `{ nextState, newDelayedEffects: [...remaining, ...newDelayedFromStep2], log, thresholdCrossings: [] }`.

Helper exported alongside `runTick`:
- `clampToRange(value, range): number` — uses `Math.min(range.max, Math.max(range.min, value))`. Pure.

## Out of Scope

- Step 2 edge evaluation body (story 005).
- Step 3 PlayerDecisions application body (story 005) — wire the parameter, document the merge order.
- Step 5 threshold detection (story 014).
- Persistence (story 015).

## Acceptance Criteria

1. **Pure-function contract**: Calling `runTick(ctx, graph, prevState, decisions, buffer)` twice with identical inputs returns deep-equal `TickResult`s. The first call must not mutate any input — `prevState`, `decisions`, and `buffer` are `===` unchanged after the call.
2. **AC-ADD-02 mirror (additive composition)**: GIVEN two stubbed decisions with deltas `+3.0` and `+2.0` on `team_fitness`, prevState `team_fitness=50`, empty buffer, empty graph → `nextState.team_fitness === 55`.
3. **AC-ADD-03 mirror with clamping**: GIVEN `fan_momentum=98`, decisions `[{nodeId:'fan_momentum',delta:+2.7},{nodeId:'fan_momentum',delta:+0.55}]`, empty buffer, empty graph → `nextState.fan_momentum === 100` (clamped from `101.25`).
4. **AC-CLM-01 mirror**: prevState `fan_momentum=99` + decision `+5` → `nextState.fan_momentum === 100`.
5. **AC-CLM-02 mirror**: prevState `team_fitness=1` + decision `-10` → `nextState.team_fitness === 0` (no negatives).
6. **Step 1 ordering**: GIVEN buffer `[{applyAt:5, toNode:'field_quality', delta:+9, edgeId:'C1a'}]`, `ctx.currentWeek=5`, empty graph/decisions → `nextState.field_quality === clamp(prevState.field_quality + 9, 0, 100)` AND `newDelayedEffects` does NOT contain that effect (consumed).
7. **Step 1 carry-forward**: GIVEN buffer `[{applyAt:5,...}]`, `ctx.currentWeek=3` → `newDelayedEffects` DOES contain the entry (not yet due).
8. **Readonly enforcement**: TypeScript strict mode + `Readonly<WorldState>` typing means a test that attempts `prevState.fan_momentum = 0` inside a fake edge implementation fails to compile (lint test — manual confirmation acceptable).
9. **CascadeLog ordering**: log entries are emitted in (Step1, Step2, Step3) order — the test in story 005 will rely on this to verify edges ran before decisions.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/runtick-skeleton.test.ts`:

- Pure-function re-call test (AC #1): seedrandom with `{state:true}`, identical state both calls, deep-equal results.
- Input-mutation test (AC #1): structural-clone snapshot before call, deep-equal after.
- Additive composition tests (AC #2, AC-ADD-02, AC-ADD-03 — AC #2 and #3).
- Clamp tests (AC #4, #5 — uses `defaultWorldState()` overridden per case).
- Step 1 consume + carry-forward (AC #6, #7).

## Dependencies

- **Upstream blockers**: 001 (types), 002 (graph constants — needed for `NODE_RANGES` import), 003 (`popEffectsDueAt`).
- **Downstream blockers**: 005 (Step 2/3 implementation), 014 (Step 5), 006–013 (chain stories all run their tests against `runTick`).

## Estimate

**2 days.** The skeleton itself is small; the determinism harness (seedrandom with `{state:true}`, deep-equal test patterns) is the bulk of the work.

## Notes / Gotchas

- Per control-manifest Foundation Layer Required: every simulation function takes `ctx: SimContext` as first parameter. `ctx.rng()` is the only source of randomness — even though Step 1/3/4 don't use rng, Step 2 (story 005) does (C2, C4, C9a, C14 have noise terms), so the param is mandatory now.
- The `clampToRange` helper goes in this file, not in `cascade-types.ts`, because clamping is engine behavior (Rule 4 final step), not type metadata.
- Per ADR-003 Rule 4: clamping applies to the FINAL accumulated value, NOT to individual edge deltas. AC-ADD-03 is the canonical test for this: 98 + 2.7 + 0.55 = 101.25 → clamped to 100. If clamping applied per-edge, the math would be wrong.
- Do NOT write to `cascade-engine.ts` for balance constants. They live in `cascade-graph.ts` (story 002). Per control-manifest: "Touching `cascade-engine.ts` for balance changes is forbidden."

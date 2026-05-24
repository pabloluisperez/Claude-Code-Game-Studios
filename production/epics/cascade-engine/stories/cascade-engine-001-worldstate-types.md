---
Story: CASCADE-ENGINE-001
Status: Done
StatusUpdated: 2026-05-19
Type: Logic
GDD Requirement: AC-DET-01, AC-DET-02 (preconditions — WorldState shape) + NodeId Catalog (cascade-engine.md §Catálogo de Nodos)
Governing ADR: ADR-002, ADR-003
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/cascade-types.test.ts (15/15 passing 2026-05-19)
ImplementedAt: packages/shared/src/sim/cascade-types.ts
ActualDays: 0.5 (vs estimate 1.0 — pure-typing story, no surprises)
---

## Implementation Notes (Done — 2026-05-19)

- Code at `packages/shared/src/sim/cascade-types.ts` — 20 NodeIds matching GDD §Catálogo de Nodos verbatim, `NODE_RANGES` constant, `defaultWorldState()`, `SimContext`, `PlayerDecision`, plus forward refs for `DelayedEffect` / `CascadeLog` / `ThresholdCrossing` / `TickResult` (full bodies in stories 003 + 014).
- Test at `packages/shared/tests/cascade-types.test.ts` — 15 tests covering: catalog cardinality (20), verbatim GDD match, defaults spot-checks (team_fitness=70, fan_momentum=60, injury_risk=20, fan_attendance=40, scouting_budget=30, streaks max=10), `defaultWorldState()` correctness + distinct instances, JSON round-trip + no-Map regression guard.
- `tsc --noEmit -p packages/shared/tsconfig.json` clean (0 errors).
- `vitest run` 15/15 passing (520ms).
- **Path correction**: original "Test Evidence" pointed to `tests/unit/cascade-engine/...` (older convention); project uses per-workspace tests per `tests/README.md`. Frontmatter updated.
- All 5 ACs verified.

### Velocity Note

Estimate was 1.0 day; actual was ~0.5 day. Calibration for Sprint 1 update: this was the cheapest story in the sprint (pure typing). Don't extrapolate — story 002 (graph topology + named constants) is more involved.

# Story: WorldState + NodeId Catalog + SimContext Types

## Goal

Define the canonical TypeScript types that underpin every other story in this epic: the 20-node `WorldState` contract, the `NodeId` union, the per-node `NodeRange` metadata (min/max/default), and the `SimContext` shape (extended with `prevState: Readonly<WorldState>` and `hasMatchThisWeek: boolean` per the GDD's C8/C10/C11/C14/C16b requirements).

This is the contract the rest of the cascade engine compiles against. Every chain story (006–013) imports `NodeId` from here. Every determinism test (017) reads `WorldState` from here.

## Scope

In `packages/shared/src/sim/cascade-types.ts` (new file):

- `NodeId` — string-literal union of all 20 nodes from cascade-engine.md §Catálogo de Nodos.
- `WorldState` — `Record<NodeId, number>` (NOT `Map<>` per control-manifest forbidden patterns; ADR-005 + ADR-007 F10 — JSON-serializable).
- `NodeRange` — `{ min: number; max: number; default: number }`.
- `NODE_RANGES` — `Record<NodeId, NodeRange>` constant matching the GDD table exactly (per ADR-003 Rule 10 "data not code"; per control-manifest "named constants in graph file, never inlined").
- `defaultWorldState()` — builds a `WorldState` from `NODE_RANGES[*].default`.
- `SimContext` — `{ rng: () => number; currentWeek: number; hasMatchThisWeek: boolean; prevState: Readonly<WorldState>; }`.
- `TickResult` — `{ nextState: WorldState; newDelayedEffects: DelayedEffect[]; log: CascadeLog[]; thresholdCrossings: ThresholdCrossing[]; }` (DelayedEffect / CascadeLog / ThresholdCrossing types declared as forward refs; their bodies live in stories 003 and 014).
- `PlayerDecision` — `{ nodeId: NodeId; delta: number; source: string; }` (per Step 3 of the algorithm; `source` is for log/audit, not behavior).

## Out of Scope

- Cascade edge definitions (story 002).
- `runTick()` implementation (story 004).
- Buffer persistence (story 015).

## Acceptance Criteria

1. `NodeId` has **exactly 20 members** matching the GDD §Catálogo de Nodos rows (case-sensitive snake_case node ids: `groundskeeper_budget`, `training_intensity`, `catering_budget`, `ticket_price_index`, `scouting_budget`, `field_quality`, `injury_risk`, `team_fitness`, `staff_morale`, `player_happiness`, `fan_momentum`, `fan_attendance`, `consecutive_wins`, `consecutive_losses`, `scouting_points`, `sponsor_quality`, `corruption_exposure`, `team_skill`, `match_performance_index`, `squad_available_pct`).
2. `NODE_RANGES.team_fitness.default === 70`, `NODE_RANGES.fan_momentum.default === 60`, `NODE_RANGES.injury_risk.default === 20`, `NODE_RANGES.fan_attendance.default === 40`, `NODE_RANGES.scouting_budget.default === 30`, `NODE_RANGES.consecutive_wins.max === 10`, `NODE_RANGES.consecutive_losses.max === 10`. (Spot-check that table matches GDD — failing any of these implies the catalog drifted from GDD.)
3. `defaultWorldState()` returns a `WorldState` where every `NodeId` is set to `NODE_RANGES[node].default`. No node is `undefined`.
4. `WorldState` is structurally `Record<NodeId, number>` — `JSON.stringify(state)` round-trips through `JSON.parse` and yields a `===`-deep-equal object (forbidden-pattern check: no `Map`).
5. Module exports compile under TypeScript 5.4+ strict mode with no `any` and no `// @ts-ignore`.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/types.test.ts` (Vitest):

- `NodeId` enum cardinality test: `Object.keys(NODE_RANGES).length === 20`.
- `defaultWorldState()` returns a state with all 20 nodes present and within their ranges.
- Round-trip JSON test: `JSON.parse(JSON.stringify(defaultWorldState()))` deep-equals the original.
- Spot-check defaults per AC #2.

## Dependencies

- **Upstream**: None — Foundation first-mover.
- **Downstream blockers**: 002 (graph definition imports NodeId), 003 (DelayedEffect imports NodeId), 004 (runTick imports WorldState/SimContext/TickResult), all chain stories 006–013.

## Estimate

**1 day.** Pure typing + a small constant table + 1 test file. Tight scope.

## Notes / Gotchas

- The GDD lists `team_skill` as "Estático (vía PlayerDecision) — no tiene cascade edge propio". It still belongs in `NodeId` because match-sim reads it; do NOT exclude it just because no edge writes to it.
- Per control-manifest Forbidden: do NOT use `Map<NodeId, number>`. Use `Record<NodeId, number>`. The slice's match-sim verified this constraint.
- `prevState` is `Readonly<WorldState>` in the type — ADR-003 Rule 3 requires edges cannot mutate it. The Readonly modifier surfaces violations at compile time.

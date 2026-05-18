# Epic: Cascade Engine

> **Layer**: Foundation
> **GDD**: `design/gdd/cascade-engine.md`
> **Architecture Module**: `packages/shared/src/sim/cascade-engine.ts` + `packages/shared/src/sim/cascade-graph.ts`
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories cascade-engine`
> **Control Manifest**: 2026-05-19

## Overview

The cascade engine is the heart of Cascada FC. It is the discrete-time
simulation graph that translates player decisions and event outcomes into
WorldState changes over weekly ticks. Per ADR-003, the graph is *data, not
code*: chains are declared as `CascadeEdgeDef` objects with delay, transfer
function, and target node. Per ADR-002, all randomness flows through
`ctx.rng()` — same seed + same decisions = identical state. Per ADR-008, the
engine emits `ThresholdCrossings` that downstream systems (event-system,
staff-system, hud-ui) consume to drive narrative beats. The slice
(`prototypes/cascada-vertical-slice-mes1/`) implemented 6 of the ~18 MVP
chains and verified determinism with 6/6 passing tests.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-002: Simulation determinism | `ctx.rng()` discipline; no `Math.random()` / `Date.now()` in sim code | LOW |
| ADR-003: Cascade graph topology | Edges read prevState only (Rule 3); additive deltas (Rule 4); cycles are safe by construction; data not code (Rule 10) | LOW |
| ADR-005: WorldState persistence | Append-only `world_snapshots`; per-tick snapshot is the unit of save | MEDIUM (Drizzle 0.36+) |
| ADR-008: World clock + event loop | `advance()` returns `ThresholdCrossings` + `nextEventPreview` | LOW |

## GDD Requirements (slice numbering)

The full Acceptance Criteria catalog lives in `design/gdd/cascade-engine.md`
sections AC-CTI-01 through AC-CTI-72 (12 categories). Coverage:

| Requirement category | Coverage | Notes |
|---|---|---|
| Categoría 1 — Determinismo | ADR-002 ✅ | Verified by slice |
| Categoría 2 — Seguridad de ciclos | ADR-003 ✅ | Rule 3 prevents divergence |
| Categoría 3 — Delays | ADR-003 ✅ | Delayed effects buffer |
| Categoría 4 — Composición aditiva | ADR-003 ✅ | Rule 4 |
| Categoría 5 — Clamping | ADR-003 ✅ | Per-node ranges |
| Categoría 6 — PlayerDecisions | ADR-008 ✅ | Step 3 of tick |
| Categoría 7 — ThresholdCrossings | ADR-008 ✅ | BLOCKING + ADVISORY |
| Categoría 8 — Cadenas contraintuitivas | (formula-level, GDD) | Per-edge tuning |
| Categoría 9 — Equilibrio del sistema | (formula-level, GDD) | Per-edge tuning |
| Categoría 10 — Performance | (none yet) | Production sprint deliverable |
| Categoría 11 — Serialización (ADR-005) | ADR-005 ✅ | |
| Categoría 12 — Admin/Debug Interface | (none yet) | Dev tool — defer to Polish |
| Categoría 13 — Recovery from corruption scandal (C18) | ADR-008 + cascade-engine.md C18 | |

**Untraced requirements**: Categoría 10 (performance budgets per tick) and
Categoría 12 (admin/debug `POST /admin/cascade-run`) have no dedicated ADR
yet — neither is blocking for MVP stories but flag for production.

## Engine Risk

LOW. Pure TypeScript. No engine-specific APIs. Slice verified the entire
pattern in TypeScript 5.6+ with strict mode.

## Definition of Done

- 18 MVP cascade chains implemented in `packages/shared/src/sim/cascade-graph.ts`
  (the slice has 6 as references; production rewrites from scratch with full set)
- `runTick()` pure function in `packages/shared/src/sim/cascade-engine.ts`
  passing all Categoría 1–7 + 11 acceptance criteria
- Threshold detection per ADR-008 emits BLOCKING + ADVISORY crossings with
  correct priority + reason payload
- DelayedEffects buffer persistence — survives advance() crashes (cross-cut
  with ADR-005)
- 80% test coverage on `packages/shared/src/sim/cascade-engine.ts` (per
  `technical-preferences.md`)
- Determinism integration test: 4-week run, same seed + decisions → identical
  WorldState (uses slice's `cascade-determinism.test.ts` pattern)
- All 18 chains exercise their counterintuitive nodes at least once in a
  scripted seed (per Rule 7 of cascade-engine.md — counterintuitivity is
  validated, not just declared)

## Dependencies

- **Upstream blockers**: None. Foundation layer first-mover.
- **Downstream consumers**: match-simulation (writes MPI + injury_risk),
  economy (writes financial state via WorldState), manager-rpg (reads for
  visibility), staff-system (reads cascadeLog + crossings), event-system
  (reads crossings + writes PlayerDecisions), hud-ui (renders state).

## Next Step

Run `/create-stories cascade-engine` to break this epic into implementable
stories.

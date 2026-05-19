---
Story: CASCADE-ENGINE-002
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: ADR-003 Rules 1–10 + cascade-engine.md §Catálogo de Cadenas (catalog shape, not formulas)
Governing ADR: ADR-003
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/cascade-engine/graph-topology.test.ts
---

# Story: CascadeEdgeDef Data Model + CASCADA_FC_GRAPH Skeleton

## Goal

Define the `CascadeEdgeDef` data model (per ADR-003 Rule 10 "data, not code") and create the `CASCADA_FC_GRAPH` skeleton array — declaring all 22 edge slots (C0, C1a, C1b, C2, C3, C4, C5a, C5b, C6, C7, C9a, C9b, C11, C12, C13, C14, C15, C16a, C16b, C17, C18a). C8 is a single edge despite its multi-input shape (it reads two nodes via `ctx.prevState` per the GDD note). C10 is NOT a standalone edge — it's a multiplier integrated into C4 (per cascade-engine.md C10 row). C18b is event-system territory and lives outside the graph.

The skeleton declares each `CascadeEdgeDef` with metadata (`id`, `fromNode`, `toNode`, `delay`, `guardFn`, `transferFn`) but the `transferFn` body for each chain is a placeholder that throws `Error('not yet implemented in story CASCADE-ENGINE-NNN')` — the real formulas land in stories 006–013.

## Scope

In `packages/shared/src/sim/cascade-graph.ts` (new file):

- `CascadeEdgeDef` type:
  ```
  {
    id: string;                       // e.g. 'C1a', 'C4', 'C16b'
    fromNode: NodeId;                 // primary input (others read via ctx.prevState)
    toNode: NodeId;                   // exclusive write target
    delay: 0 | 1 | 2;                 // weeks until effect applies
    guardFn?: (prevState, ctx) => boolean;  // optional skip (e.g. hasMatchThisWeek, CE<80)
    transferFn: (prevState, ctx) => number; // pure: returns delta (NOT new value)
    counterintuitive: boolean;        // metadata only — used by /design-review tooling
  }
  ```
- `CASCADA_FC_GRAPH: readonly CascadeEdgeDef[]` — frozen array of 22 placeholders matching the GDD catalog table 1:1.
- `getEdgesByTarget(nodeId): CascadeEdgeDef[]` helper — for additive composition in `runTick()` Step 2.
- A named-constants block at the top of the file declaring every K_*/T_*/NOISE_*/MORALE_*/etc. value from the GDD Formulas section. Constants are exported individually so test files can verify formulas without hard-coding magic numbers.
- Each `CascadeEdgeDef` carries inline doc comments naming the GDD section (e.g. `// C1b — cascade-engine.md §C1b`) so future readers can trace edge → spec instantly.

## Out of Scope

- Actual `transferFn` formula bodies (stories 006–013).
- `runTick()` (story 004).
- The 4 ctx.hasMatchThisWeek guards (C11, C14, C16b, and any others) are STUBBED in this story — bodies in story 010 (C11/C14/C16b) and respectively in their own chain stories. The guardFn slot is declared and wired so `runTick()` can call it from day 1.

## Acceptance Criteria

1. `CASCADA_FC_GRAPH.length === 22` (one entry per: C0, C1a, C1b, C2, C3, C4, C5a, C5b, C6, C7, C8, C9a, C9b, C11, C12, C13, C14, C15, C16a, C16b, C17, C18a). C10 is NOT an edge. C18b is NOT in the graph.
2. Every edge has unique `id`. Duplicate ids fail a startup-time `assert`.
3. Every edge's `fromNode` and `toNode` are valid `NodeId`s.
4. `C1a.delay === 1`, `C1b.delay === 0`, `C4.delay === 1`, `C5a.delay === 1`, `C5b.delay === 1`, `C6.delay === 0`, `C9a.delay === 1`, `C15.delay === 2`, `C17.delay === 1`. (Spot-check delays match GDD catalog.)
5. `C11.guardFn`, `C14.guardFn`, `C16b.guardFn` are defined and return `ctx.hasMatchThisWeek === true`. `C18a.guardFn` is defined and returns `prevState.corruption_exposure < 80`. All other edges have `guardFn === undefined`.
6. `CascadeEdgeDef.counterintuitive` is `true` for C1b, C4, C6, C8, C12, C15, C18a (matches the 7 counterintuitive chains per GDD Core Rule 7) and `false` for the rest.
7. `getEdgesByTarget('team_fitness')` returns edges with ids `['C0','C3','C4','C5a','C12','C13','C16a']` (in any order). Spot-check the multi-writer fan-in.
8. `CASCADA_FC_GRAPH` is frozen (`Object.isFrozen(CASCADA_FC_GRAPH) === true`) and edges are deeply readonly — mutations throw or produce TS compile errors.
9. The constants block exports the named values from cascade-engine.md §Formulas verbatim (`K_fit_decay=0.05`, `K_ground=0.30`, `T_safe_high=75`, `T_danger_peak=45`, `T_safe_low=20`, `K_safe_high=6.0`, `K_danger=0.25`, `K_safe_low=3.0`, `K_C4=8.0`, `T_low=25`, `T_high=75`, `MORALE_SCALE_MIN=0.5`, `K_win_base=8.0`, `K_loss_base=8.0`, `K_streak_base=2.0`, `ATTEND_MAX_BASE=60`, `ATTEND_MIN_BASE=5`, `MOMENTUM_TOLERANCE_DIVISOR=120`, `PRICE_BONUS_K=0.25`, `K_scouting=15.0`, `DECAY_scouting=0.08`, `T_scouting_active=50`, `K_scouting_roster=5.0`, `K_morale_perf=8.0`, `K_desperation=10.0`, `T_desperation_threshold=50`, `DESPERATION_EXP=1.5`, `K_squad_fit=5.0`, `SQ_optimal=75`, `K_home_advantage=6.0`, `K_price_erosion=0.12`, `T_price_danger=65`, `K_happy_fit=4.0`, `K_happy_perf=7.0`, `K_sponsor_happy=5.0`, `K_corruption_decay=0.05`, `K_injury=0.30`, `IR_base=20`, `K_field_fatigue=0.10`, `T_field_poor=40`, `K_catering_fit=3.0`, `K_catering_moral=4.0`, `NOISE_C2_AMP=2.0`, `NOISE_C4_AMP=2.0`, `NOISE_C9a_AMP=2.0`, `NOISE_C14_AMP=2.0`, `SCANDAL_FAN_IMPACT=30`).

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/graph-topology.test.ts`:

- Length test (AC #1).
- Unique-id test (AC #2).
- Valid-NodeId test for `fromNode` and `toNode` (AC #3).
- Delay spot-checks (AC #4).
- Guard presence + invocation test (AC #5) using fake `ctx` objects.
- `getEdgesByTarget` returns the documented fan-in for `team_fitness` AND `match_performance_index` AND `fan_momentum` (AC #7).
- Immutability test (AC #8): attempting `CASCADA_FC_GRAPH.push(...)` throws.

## Dependencies

- **Upstream blocker**: CASCADE-ENGINE-001 (imports `NodeId`, `WorldState`, `SimContext`).
- **Downstream blockers**: 004 (runTick), 006–013 (chain stories fill in `transferFn` bodies).

## Estimate

**2 days.** The constants block is voluminous and must match the GDD line-by-line — a transcription error here cascades into every chain story.

## Notes / Gotchas

- **Control-manifest Forbidden**: Touching `cascade-engine.ts` for balance changes is forbidden. All balance constants live in this graph file. If a constant name from the GDD is missing here, story 002 is incomplete.
- C8's `fromNode` is `fan_momentum` (per the GDD's "fan_momentum × ticket_price_index → fan_attendance" — the primary driver is fan_momentum, and ticket_price_index is read via `ctx.prevState`). Document this in inline comment.
- C12's `fromNode` is `consecutive_losses` (per the GDD); training_intensity read via `ctx.prevState`.
- C16 is split into C16a (→ team_fitness, no guard) and C16b (→ match_performance_index, hasMatchThisWeek guard) per the R4 fix in the GDD header.
- Per control-manifest Forbidden: writing to `match_performance_index` from cascade edges is forbidden EXCEPT the documented exceptions C11, C14, and C16b. All three are allow-listed in cascade-graph.ts.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 9/9 passing
**Deviations**:
  - ADVISORY: ADR-003 interface sketch uses `from`/`to` and `(fromValue, toValue, ctx)` — implementation uses `fromNode`/`toNode` and `(prevState, ctx)`. Refinement specified explicitly in story scope; ADR-003 should be updated in a follow-up.
  - ADVISORY: `Object.freeze` on CASCADA_FC_GRAPH is shallow (array only); edge objects are mutable at runtime via cast. Compile-time immutability is enforced by `as const` + `readonly`.
**Test Evidence**: Logic — unit test at `packages/shared/tests/cascade-engine/graph-topology.test.ts` — 67/67 passing
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19)

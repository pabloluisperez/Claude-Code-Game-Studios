---
Story: CASCADE-ENGINE-017
Status: Pending
Type: Integration
GDD Requirement: AC-DET-01, AC-DET-02, AC-DET-03, AC-CYC-01, AC-CYC-02, AC-CYC-03, AC-ADD-01, AC-EQL-01, AC-EQL-02, AC-EQL-03, AC-EQL-04 + epic Definition of Done "determinism integration test: 4-week run + counterintuitivity validated"
Governing ADR: ADR-002 (determinism root), ADR-003 (cycle safety + additive composition), ADR-008 (TickResult contract)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/cascade-engine/determinism-end-to-end.test.ts
---

# Story: End-to-End Determinism + Cycle Safety + Equilibrium Integration Suite

## Goal

Validate that the complete cascade engine (all 18 chains, threshold detection, buffer, runTick algorithm) is:
1. **Deterministic** — same seed + same decisions across N ticks produces byte-identical WorldState.
2. **Cycle-safe** — long runs (100 ticks) with active cycles never diverge or escape clamp ranges.
3. **Additively composed correctly** — multi-writer fan-ins (7 writers on team_fitness, 3 on match_performance_index) produce correct sums.
4. **At equilibrium** — default state with no inputs converges to documented equilibria.
5. **Counterintuitively valid** — all 7 counterintuitive chains fire their counterintuitive behavior under a scripted seed.

This is the epic's "all green = ship" story. Most ACs in this story were validated piecemeal in stories 006–014; this story re-verifies them in INTEGRATION (full graph, full algorithm, full buffer, full thresholds) and adds the cross-cutting determinism contract.

The slice (`prototypes/cascada-vertical-slice-mes1/src/sim/tests/cascade-determinism.test.ts`) has 11 such tests as the design reference — production rewrites them against the full 18-chain graph, not the slice's 6-chain subset.

## Scope

In `tests/integration/cascade-engine/determinism-end-to-end.test.ts`:

Each AC below is a separate `it(...)` block. The file uses real `seedrandom` (allowed library per control-manifest), the full `CASCADA_FC_GRAPH`, `defaultWorldState()`, and `runTick()` from `cascade-engine.ts`.

## Out of Scope

- DB integration (story 015 owns the DB-roundtrip determinism test).
- Performance (story 016).
- Admin/Debug interface (cascade-engine.md Categoría 12 — out of MVP scope per EPIC.md).

## Acceptance Criteria

1. **AC-DET-01**: Default WorldState + seed `"test:det:1"` + empty decisions + empty buffer → `runTick()` called twice with deep-cloned inputs produces deep-equal `TickResult.nextState`. All 20 NodeIds match.
2. **AC-DET-02**: 50 ticks in two independent runs, same seed `"test:det:2"`, same decisions sequence → WorldState at tick 50 is identical between runs. (Stress version of AC-DET-01.)
3. **AC-DET-03**: `training_intensity=80, catering_budget=20`, seed `"test:det:3"` → `CascadeLog` entries (edge id, fromValue, delta) are identical between two invocations. Validates that the LOG (not just state) is deterministic.
4. **AC-CYC-01**: Full graph + default state + seed `"test:cycle:1"`, no decisions, 100 ticks → all 20 nodes remain within `NODE_RANGES`. Cycle `fan_momentum → fan_attendance → match_performance_index (via match-sim hook stub) → fan_momentum` does not diverge.
5. **AC-CYC-02**: Extreme initial state `fan_momentum=100, match_performance_index=100`, seed `"test:cycle:2"`, 100 ticks → `fan_momentum` never exceeds 100 nor drops below 0.
6. **AC-CYC-03**: Extreme initial state `fan_momentum=1, match_performance_index=0`, seed `"test:cycle:3"`, 100 ticks → `fan_momentum` never drops below 0. (Verifies the lower-clamp path.)
7. **AC-ADD-01 (full integration)**: Construct a tick where ALL 7 writers to `team_fitness` (C0, C3, C4, C5a [delayed: not contributing in W=1], C12, C13, C16a) fire simultaneously with known prevState values. Verify nextState.team_fitness equals the sum of individual deltas plus prevState, post-clamp. The CascadeLog entries' deltas sum exactly to `(nextState.team_fitness - prevState.team_fitness)` (before clamping consideration).
8. **AC-EQL-01**: Default state + `hasMatchThisWeek=false` for all 52 ticks + seed configured for noise=0 + no decisions → no node reaches 0 or 100 across 52 ticks. (The "stable system" benchmark.)
9. **AC-EQL-02**: prevState `team_fitness=90` with isolation (training=25, happiness=50, squad=75, catering=50, field=50, losses=0, no match) → at tick 20 team_fitness ∈ [68, 72]. C0 equilibrium proven at the integration level.
10. **AC-EQL-03** (mirror going up): start at 50, same isolation → at tick 20 in [68, 72]. (C0 is symmetric around 70.)
11. **AC-EQL-04**: `scouting_budget=30` constant for 50 ticks → scouting_points ∈ [54, 59] at tick 50. (C9a equilibrium.)
12. **Counterintuitive proof suite (one composite test)**: under a scripted seed and pre-set state, fire each of the 7 counterintuitive chains and assert the canonical proof:
    - C1b: |delta(F_q=40)| > |delta(F_q=10)| (mediocre worse than catastrophic).
    - C4: delta(I_train=80) < 0 AND delta(I_train=10) < 0 AND delta(I_train=50) > 0.
    - C6: |C6(MPI=30)| > 3.0 × C6(MPI=70) (asymmetric hysteresis).
    - C8: |C8(F_m=20, TPI=70)| > |C8(F_m=80, TPI=70)| (momentum protects).
    - C12: delta(CL=5, I_train=80) < 0 AND delta(CL=5, I_train=40) === 0 (agency lever).
    - C15: with TPI=80 → effect queued at W+2 is `-1.8`; even if W+1 TPI drops to 40, the effect still fires (no retroactive cancellation).
    - C18a: with CE=82 (guard active), no decay across 5 ticks (CE stays at 82).
    - **Per EPIC Definition of Done**: "All 18 chains exercise their counterintuitive nodes at least once in a scripted seed — counterintuitivity is validated, not just declared".
13. **4-week scripted run** (epic-level DoD): scripted PlayerDecisions sequence over 4 weeks. The script: W1 raises groundskeeper=80, W2 raises catering=70, W3 raises training=80 (anti-pattern), W4 raises ticket_price=80 (anti-pattern). At the end of W4, verify a specific expected WorldState (snapshot test) and assert byte-identical reproduction across two runs with the same seed. This is the "user-facing scenario" determinism guarantee.
14. **All 18 chains exercised**: across the test suite (all `it` blocks in this file), every edge id from `CASCADA_FC_GRAPH` (C0, C1a, C1b, C2, C3, C4, C5a, C5b, C6, C7, C8, C9a, C9b, C11, C12, C13, C14, C15, C16a, C16b, C17, C18a) appears in at least one CascadeLog entry of one test. Use a tracking set populated during test execution to fail the suite if any edge was never exercised. C10 is excluded (it's integrated into C4, not a separate edge).
15. **No `Math.random()` usage** (control-manifest forbidden): the integration test does NOT call Math.random(). All randomness via `seedrandom`. Verify via a grep-style test that fails if `Math.random` appears in the test file.

## Test Requirements (Integration, BLOCKING)

`tests/integration/cascade-engine/determinism-end-to-end.test.ts`:

- AC-DET-01/02/03 (AC #1, #2, #3).
- AC-CYC-01/02/03 (AC #4, #5, #6).
- AC-ADD-01 full integration (AC #7).
- AC-EQL-01/02/03/04 (AC #8, #9, #10, #11).
- 7-chain counterintuitive proof suite (AC #12).
- 4-week scripted run (AC #13).
- All-chains coverage (AC #14).
- Math.random ban (AC #15).

## Dependencies

- **Upstream blockers**: ALL stories 001–014. This is the integration test that validates the assembled engine.
- **Downstream**: epic Definition of Done. With this story Done, the epic ships.

## Estimate

**2-3 days.** Test volume is the largest in the epic; expect to spend significant time tuning the scripted 4-week scenario (AC #13) to produce stable, repeatable expected values that are NOT brittle. The counterintuitive proof suite (AC #12) is also extensive.

## Notes / Gotchas

- **Seedrandom with `{ state: true }`**: required to expose `.state()` for persistence (verified by slice). Construct as `const rng = seedrandom('seed-string', { state: true });`.
- **Deep-equal vs `toEqual`**: Vitest's `expect(a).toEqual(b)` deep-compares Records — use it. For arrays-of-objects (CascadeLog, ThresholdCrossings), order matters (per story 005 AC #8 — log ordering is stable).
- **The 4-week snapshot test (AC #13)**: snapshot tests are brittle if formulas change. Mitigate by:
  - Writing the test to validate KEY invariants (groundskeeper_budget=80 in W=1 produces field_quality > default by W=3; catering raise produces team_fitness > default by W=4; training=80 produces team_fitness DECREASE despite high values being intuitive-better), not specific decimal values for all 20 nodes.
  - Including a comment block explaining the scenario's intent so future devs know what the test PROTECTS, not just what numbers it asserts.
- **Performance**: 100-tick and 52-tick runs in this story complete in <500ms each (well within Vitest default timeout). 1000-tick perf is story 016's domain.
- **Slice's 11 tests as design ref**: the slice file `prototypes/cascada-vertical-slice-mes1/src/sim/tests/cascade-determinism.test.ts` is the architectural pattern. Production rewrites from scratch — DO NOT import or copy slice code (control-manifest forbidden: ❌ Importing from `prototypes/` in any production path).
- **AC-DET-02 is the canonical contract**: if AC-DET-02 (50-tick byte-identical across runs) fails, the engine has a non-determinism bug. The most common cause is unintentional use of `Math.random()` (compile-time grep should catch); the second most common is iteration over `Object.keys` of a Record with insertion-order-dependent state, which can drift if `NODE_RANGES` is mutated post-init. Story 002's freeze of `CASCADA_FC_GRAPH` defends against this.

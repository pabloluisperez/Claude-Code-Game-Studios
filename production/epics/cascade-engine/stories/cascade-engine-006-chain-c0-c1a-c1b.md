---
Story: CASCADE-ENGINE-006
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-CTI-C1b, AC-CTI-C1b-ascendente, AC-DEL-01, AC-DEL-02, AC-EQL-02, AC-EQL-03 + cascade-engine.md §C0, §C1a, §C1b
Governing ADR: ADR-002, ADR-003
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c0-c1.test.ts
---

# Story: Chains C0 + C1a + C1b (team_fitness decay, field_quality cascade, counterintuitive injury_risk)

## Goal

Implement the first 3 cascade chains: **C0** (natural decay of `team_fitness` toward 70 — system equilibrium spine), **C1a** (`groundskeeper_budget → field_quality`, delay 1w), and **C1b** (`field_quality → injury_risk`, delay 0w, **counterintuitive piecewise** — mediocre field is more dangerous than terrible field). C1b is one of the 7 anchor counterintuitive chains (Core Rule 7); the cross-verification AC `|delta(F_q=40)| > |delta(F_q=10)|` is the canonical proof.

## Scope

In `packages/shared/src/sim/cascade-graph.ts` — replace placeholder `transferFn`s for C0, C1a, C1b with the formulas from cascade-engine.md §Formulas:

- **C0**: `delta = -K_fit_decay × (prevState.team_fitness - 70)` — uses `K_fit_decay = 0.05`.
- **C1a**: `delta = (prevState.groundskeeper_budget - 50) × K_ground` — uses `K_ground = 0.30`. Delay = 1.
- **C1b**: piecewise on `prevState.field_quality` (F_q):
  - `F_q ≥ 75` → `delta = -K_safe_high` = `-6.0`
  - `75 > F_q > 45` → `delta = -(F_q - 45) × K_danger` (uses `K_danger = 0.25`)
  - `45 ≥ F_q > 20` → `delta = +(45 - F_q) × K_danger`
  - `F_q ≤ 20` → `delta = -K_safe_low` = `-3.0`

All three are pure — no noise terms. Counterintuitive flag: C1b only.

## Out of Scope

- C2 (`injury_risk → squad_available_pct`) — story 007.
- C3 (`field_quality → team_fitness`) — story 007.
- C13 (`squad_available_pct → team_fitness`) — story 007.

## Acceptance Criteria

1. **AC-C0-baseline**: prevState `team_fitness=90` → C0 delta = `-1.0` (matches GDD example).
2. **AC-C0-recovery**: prevState `team_fitness=50` → C0 delta = `+1.0`.
3. **AC-EQL-02** (integration with runTick): GIVEN `team_fitness=90` and isolation conditions (`training_intensity=25`, `player_happiness=50`, `squad_available_pct=75`, `catering_budget=50`, `field_quality=50`, `consecutive_losses=0`, `hasMatchThisWeek=false`, no decisions), 50 ticks → `team_fitness` converges to [68, 72]. _(Corrected: story originally said 20 ticks, but with K_fit_decay=0.05, convergence from [50,90] to [68,72] requires ~45 ticks — 20 ticks only reaches ~77/63.)_
4. **AC-EQL-03** (mirror, upward): same isolation, prevState `team_fitness=50` → after 50 ticks `team_fitness` in [68, 72]. _(See AC #3 correction note.)_
5. **AC-C1a-baseline**: prevState `groundskeeper_budget=80` → C1a delta = `+9.0`, applied at `applyAt = ctx.currentWeek + 1`.
6. **AC-DEL-01 mirror**: `groundskeeper_budget=80` at W=1, empty buffer → in W=1 `field_quality` does not change from C1a (delay 1); `newDelayedEffects` contains 1 entry with `applyAt=2, toNode='field_quality', delta=+9.0, edgeId='C1a'`. (Note: other edges that read `field_quality` from prevState — C3, C14 — still produce their deltas in W=1; the AC narrows the THEN to "field_quality as a destination node of C1a".)
7. **AC-DEL-02 mirror**: at W=2 with the above buffer, `nextState.field_quality` increases by +9.0 (plus other edges); the buffer entry is consumed.
8. **AC-CTI-C1b**: prevState `field_quality=40` → C1b delta = `+1.25` (mediocre = danger zone, positive injury risk). prevState `field_quality=10` → delta = `-3.0` (catastrophic = players cautious). prevState `field_quality=80` → delta = `-6.0` (excellent = safe).
9. **Cross-verification (mandatory per AC-CTI-C1b)**: delta(F_q=40) > delta(F_q=10). I.e. `+1.25 > -3.0`. This is the canonical "counterintuitive" proof — assert explicitly in a test.
10. **AC-CTI-C1b-ascendente (transition test)**: prevState `field_quality=15` in W=N produces delta = `-3.0` (catastrophic-safe zone); transitioning to prevState `field_quality=25` in W=N+1 produces delta = `+5.0` (mediocre danger). Assert the sign flip and the magnitude.
11. **Discontinuity at F_q=20**: `transferFn` with prevState.field_quality=20 returns `-3.0` (catastrophic branch — `≤` is exclusive of the mediocre branch); with prevState.field_quality=20.001 returns `≈+6.25` ((45-20)×0.25). This is intentional per cascade-engine.md §C1b note.
12. **Discontinuity at F_q=75**: prevState.field_quality=75 returns `-6.0` (per the R3 fix — branch A is `≥75`, not `>75`).
13. **Determinism**: same prevState + same seed → identical deltas across two calls of `runTick` for each of C0, C1a, C1b (AC-DET-03 narrowed to these edges).

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c0-c1.test.ts`:

- C0 spot values (AC #1, #2).
- C0 equilibrium convergence over 20 ticks (AC #3, #4) — uses the full `runTick` pipeline with isolation conditions.
- C1a spot value + delay routing (AC #5, #6).
- C1a → buffer → consume (AC #7).
- C1b piecewise (AC #8) — 4 spot values: 80, 75, 60, 40, 25, 20, 15.
- C1b counterintuitive proof (AC #9).
- C1b transition test (AC #10).
- C1b discontinuities at boundaries (AC #11, #12).
- Determinism re-call (AC #13).

## Dependencies

- **Upstream blockers**: 002 (graph + constants), 004 (runTick skeleton), 005 (Step 2/3 evaluation — required to run the equilibrium integration test).
- **Downstream**: AC-EQL-02/03 (story 017) is a superset of the equilibrium test here; story 017 verifies all 7 isolated equilibria together.

## Estimate

**2 days.** C1b's piecewise function is the trickiest — multiple boundary conditions, intentional discontinuity, mandatory cross-verification. Tests are voluminous (7 spot values + 2 transitions + 2 discontinuities).

## QA Test Cases

**Test file**: `packages/shared/tests/cascade-engine/chains-c0-c1.test.ts`
_(Story header says `tests/unit/cascade-engine/` — use `packages/shared/tests/cascade-engine/` per project convention, retro A5)_

**Estimated test count**: ~20 unit tests

### C0 — Natural decay toward equilibrium 70
- `test_chain_c0_decay_positive_when_fitness_above_70`: prevState team_fitness=90 → delta=-1.0 (AC #1)
- `test_chain_c0_recovery_positive_when_fitness_below_70`: prevState team_fitness=50 → delta=+1.0 (AC #2)
- `test_chain_c0_equilibrium_zero_at_70`: prevState team_fitness=70 → delta=0.0 (per Notes/Gotchas)
- `test_chain_c0_convergence_from_above_20_ticks_in_range_68_72`: isolation conditions, start=90, 20 ticks → [68,72] (AC #3)
- `test_chain_c0_convergence_from_below_20_ticks_in_range_68_72`: same isolation, start=50 (AC #4)
- `test_chain_c0_does_not_call_rng`: C0 transferFn does NOT invoke ctx.rng()

### C1a — groundskeeper_budget → field_quality (delay 1)
- `test_chain_c1a_positive_delta_above_50`: groundskeeper_budget=80 → delta=+9.0 (AC #5)
- `test_chain_c1a_delay_routing_applyAt_plus_1`: at W=N, newDelayedEffects entry applyAt=N+1 (AC #6)
- `test_chain_c1a_field_quality_unchanged_at_evaluation_tick`: at W=1, field_quality unchanged by C1a in nextState (AC-DEL-01)
- `test_chain_c1a_buffered_effect_consumed_at_week_plus_1`: at W=2 with prior buffer, field_quality increases +9.0 (AC #7)

### C1b — field_quality → injury_risk (piecewise, counterintuitive)
- `test_chain_c1b_excellent_field_safe_high_delta`: field_quality=80 → delta=-6.0 (AC #8)
- `test_chain_c1b_boundary_at_75_uses_safe_high_branch`: field_quality=75 → delta=-6.0 (R3 fix: ≥75 is branch A, AC #12)
- `test_chain_c1b_mediocre_field_positive_delta`: field_quality=40 → delta=+1.25 (AC #8)
- `test_chain_c1b_catastrophic_field_safe_low_delta`: field_quality=10 → delta=-3.0 (AC #8)
- `test_chain_c1b_counterintuitive_proof_mediocre_more_dangerous_than_catastrophic`: delta(40)=+1.25 > delta(10)=-3.0 (AC #9 — mandatory cross-verification)
- `test_chain_c1b_transition_sign_flip_catastrophic_to_mediocre`: field_quality=15→delta=-3.0; 25→delta=+5.0 (AC #10)
- `test_chain_c1b_discontinuity_at_boundary_20`: field_quality=20→-3.0; 20.001→≈+6.25 (intentional, AC #11)

### Determinism
- `test_chain_c0_c1a_c1b_determinism_same_seed`: two runTick calls with identical inputs → identical deltas (AC #13)

## Notes / Gotchas

- The `noise(NOISE_C2_AMP)` terms appear in OTHER chains (C2, C4, C9a, C14). C0, C1a, C1b are noise-free — verify your `transferFn` does NOT call `ctx.rng()`.
- Per cascade-engine.md C0 description: "siempre empuja hacia el equilibrio en 70". A team_fitness=70 prevState produces delta=0. Add this as an explicit test — the equilibrium point is the system's most-used reference value.
- C1b is one of the 7 anchor counterintuitive chains. Setting `counterintuitive: true` in the edge def (story 002) plus the cross-verification AC #9 is the only way the system proves it's actually counterintuitive — per cascade-engine.md Core Rule 7, "counterintuitivity is validated, not just declared".
- The DGD's R3 fix (line 235 in cascade-engine.md): the boundary at F_q=75 uses `≥` for branch A (excellent zone). Tests of F_q=75 expecting `-7.5` (the old behavior) will fail; the correct value is `-6.0` per `-K_safe_high`. Be explicit in the test name and comment.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 13/13 passing
**Deviations**:
  - ADVISORY: ACs #3/#4 corrected from "20 ticks" to "50 ticks" — K_fit_decay=0.05 requires ~45 ticks to reach [68,72]; story had incorrect tick count.
  - OUT OF SCOPE (valid): graph-topology.test.ts updated to replace stale placeholder-guard test with "now-implemented" test for C0.
  - Pre-existing (story 002): C4 placeholder at cascade-graph.ts:296 uses wrong story ID (`CASCADE-ENGINE-006` should be `CASCADE-ENGINE-008`) — not fixed here, flagged for story 008.
**Test Evidence**: Logic — unit test at `packages/shared/tests/cascade-engine/chains-c0-c1.test.ts` — 23/23 passing (166/166 suite)
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, all applied)

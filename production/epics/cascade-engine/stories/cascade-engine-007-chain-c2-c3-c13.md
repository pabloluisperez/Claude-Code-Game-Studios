---
Story: CASCADE-ENGINE-007
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-ADD-01 (multi-writer team_fitness) + cascade-engine.md §C2, §C3, §C13
Governing ADR: ADR-002, ADR-003
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c2-c3-c13.test.ts
---

# Story: Chains C2 + C3 + C13 (injury propagation, field fatigue, squad fitness)

## Goal

Implement 3 direct (non-counterintuitive) chains that connect injury and squad availability to team_fitness:

- **C2**: `injury_risk → squad_available_pct`, delay 1w, **with noise** (`NOISE_C2_AMP = 2.0`).
- **C3**: `field_quality → team_fitness`, delay 0w, pure (threshold at `T_field_poor = 40`).
- **C13**: `squad_available_pct → team_fitness`, delay 1w, pure (sweet spot at `SQ_optimal = 75`).

Together with C0 + C16a + C5a + C4 + C12, the multi-writer fan-in on `team_fitness` (6 edges) is the project's stress test for ADR-003 Rule 4 (additive composition). AC-ADD-01 lives at the integration boundary of this story and stories 006/008/009/013.

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

- **C2**: `delta = -K_injury × (prevState.injury_risk - IR_base) + noise(NOISE_C2_AMP)`. `K_injury = 0.30`, `IR_base = 20`. Noise term: `(ctx.rng() - 0.5) * NOISE_C2_AMP` — i.e. `±1.0` swing. Delay 1.
- **C3**: `delta = -K_field_fatigue × max(0, T_field_poor - prevState.field_quality)`. `K_field_fatigue = 0.10`, `T_field_poor = 40`. Pure. Delay 0.
- **C13**: `delta = K_squad_fit × (prevState.squad_available_pct - SQ_optimal) / 100`. `K_squad_fit = 5.0`, `SQ_optimal = 75`. Pure. Delay 1.

## Out of Scope

- C4, C10 (training_intensity parabola) — story 008.
- C5a, C5b (catering) — story 009.
- C12 (sobreentrenamiento) — story 013.

## Acceptance Criteria

1. **AC-C2-baseline**: prevState `injury_risk=50`, seed configured so `ctx.rng()=0.5` (noise = 0) → C2 delta = `-9.0`. With `ctx.rng()=1.0` → delta = `-9.0 + 1.0 = -8.0`. With `ctx.rng()=0.0` → delta = `-9.0 - 1.0 = -10.0`.
2. **AC-C2-base-zero**: prevState `injury_risk=20` (at base), `ctx.rng()=0.5` → delta = `0.0`.
3. **AC-C2-base-below**: prevState `injury_risk=10` (below base), `ctx.rng()=0.5` → delta = `+3.0` (positive — squad recovers). Verify the sign.
4. **AC-C2-noise-bounded**: across 1000 random seeds, |C2 delta − (-K_injury × (IR_prev − IR_base))| ≤ 1.0 (the NOISE_C2_AMP/2 bound). Document the seed iteration pattern (uses `seedrandom` with state, not `Math.random`).
5. **AC-C2-delay-routing**: C2 with delay 1, evaluated at W=3 → produces entry in `newDelayedEffects` with `applyAt: 4`.
6. **AC-C3-baseline**: prevState `field_quality=25` → C3 delta = `-1.5` (matches GDD example).
7. **AC-C3-equilibrium**: prevState `field_quality=40` → C3 delta = `0.0` (max(0, 40-40) = 0). prevState `field_quality=60` → delta = `0.0` (good field doesn't penalize).
8. **AC-C3-floor**: prevState `field_quality=0` → C3 delta = `-4.0` (40 × 0.10 = max negative).
9. **AC-C13-baseline**: prevState `squad_available_pct=60` → C13 delta = `-0.75` (matches GDD example).
10. **AC-C13-sweet-spot**: prevState `squad_available_pct=75` → C13 delta = `0.0`.
11. **AC-C13-max-positive**: prevState `squad_available_pct=100` → C13 delta = `+1.25`.
12. **AC-C13-min-negative**: prevState `squad_available_pct=0` → C13 delta = `-3.75`.
13. **AC-C13-delay-routing**: C13 with delay 1, evaluated at W=2 → entry in `newDelayedEffects` with `applyAt: 3`.
14. **AC-ADD-01 partial mirror** (full version in story 017): integrate C0 + C3 + C13 (writing additively into team_fitness in same tick) with no other chains active — verify the deltas sum into deltaMap before clamping. GIVEN team_fitness=50, field_quality=30, squad_available_pct=60: C0 delta = +1.0, C3 delta = -1.0, C13 (delay 1, doesn't contribute this tick) = 0 → net change to `team_fitness` THIS tick = 0. Test C13's delayed contribution arrives at W+1.
15. **Determinism**: C2 across two `runTick` calls with the same seedrandom state → identical deltas including the noise term.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c2-c3-c13.test.ts`:

- C2 spot values with rng injection (AC #1, #2, #3).
- C2 noise bound across 1000 seeds (AC #4) — uses a `mulberry32`-style PRNG or `seedrandom` initialized with explicit state.
- C2 delay routing (AC #5).
- C3 spot values (AC #6, #7, #8).
- C13 spot values (AC #9–#12).
- C13 delay routing (AC #13).
- C0+C3+C13 additive composition (AC #14).
- Determinism re-call for C2 (AC #15).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 014 (some threshold ACs reference `squad_available_pct < 60`), story 017 (full AC-ADD-01 — all 7 writers of team_fitness in one tick).

## Estimate

**1.5 days.** Simpler than C1 (no counterintuitive flag, no piecewise). The noise-bound test (AC #4) is the main novelty here — it pioneers the rng-injection pattern that C4 / C9a / C14 will all reuse.

## QA Test Cases

**Test file**: `packages/shared/tests/cascade-engine/chains-c2-c3-c13.test.ts`
_(Use `packages/shared/tests/cascade-engine/` not `tests/unit/cascade-engine/`)_

**Estimated test count**: ~20 unit tests

### C2 — injury_risk → squad_available_pct (delay 1, noisy)
- `test_chain_c2_baseline_zero_noise`: injury_risk=50, rng()=0.5 → delta=-9.0 (AC #1)
- `test_chain_c2_noise_positive_rng_1`: rng()=1.0 → delta=-8.0 (AC #1)
- `test_chain_c2_noise_negative_rng_0`: rng()=0.0 → delta=-10.0 (AC #1)
- `test_chain_c2_at_base_zero_delta`: injury_risk=20, rng()=0.5 → delta=0.0 (AC #2)
- `test_chain_c2_below_base_positive_recovery`: injury_risk=10, rng()=0.5 → delta=+3.0 (AC #3)
- `test_chain_c2_noise_bound_1000_seeds`: |noisy_delta - base| ≤ NOISE_C2_AMP/2 across 1000 seeds (AC #4)
- `test_chain_c2_delay_routing_applyAt_correct`: evaluated at W=3 → applyAt=4 (AC #5)

### C3 — field_quality → team_fitness (threshold)
- `test_chain_c3_below_threshold_negative`: field_quality=25 → delta=-1.5 (AC #6)
- `test_chain_c3_at_threshold_zero`: field_quality=40 → delta=0.0 (AC #7)
- `test_chain_c3_above_threshold_zero`: field_quality=60 → delta=0.0 (AC #7)
- `test_chain_c3_floor_at_zero_field`: field_quality=0 → delta=-4.0 (AC #8)

### C13 — squad_available_pct → team_fitness (sweet spot)
- `test_chain_c13_below_sweet_spot_negative`: squad_available_pct=60 → delta=-0.75 (AC #9)
- `test_chain_c13_at_sweet_spot_zero`: squad_available_pct=75 → delta=0.0 (AC #10)
- `test_chain_c13_at_max_positive`: squad_available_pct=100 → delta=+1.25 (AC #11)
- `test_chain_c13_at_min_negative`: squad_available_pct=0 → delta=-3.75 (AC #12)
- `test_chain_c13_delay_routing_applyAt_correct`: evaluated at W=2 → applyAt=3 (AC #13)

### Integration
- `test_chain_c0_c3_additive_composition_net_zero_this_tick`: team_fitness=50, field_quality=30, squad=60 → C0+C3 net = 0 this tick; C13 delayed to W+1 (AC #14)
- `test_chain_c2_determinism_same_seed_same_noise`: two runTick calls with same seedrandom state → identical C2 delta including noise (AC #15)

## Notes / Gotchas

- **Rng injection pattern**: To test C2 with `ctx.rng()` returning exactly 0.5 (or 0.0, 1.0), construct a `ctx` with `rng: () => 0.5`. Do NOT use `Math.random()` here (control-manifest forbidden). For multi-call edges, a stateful generator: `let i=0; const seq=[0.5,0.3,0.7]; ctx.rng=()=>seq[i++]`.
- The noise term is `(rng() - 0.5) × AMP`, which gives a symmetric ±AMP/2 swing. For NOISE_C2_AMP=2.0, swing is ±1.0. Verify the formula matches cascade-engine.md §Formulas head-note ("Cuando se indica `noise(AMP)`, se usa `(ctx.rng() - 0.5) * AMP`").
- C3's `max(0, ...)` clamp means good fields produce zero delta — they don't help team_fitness, they just stop hurting it. This is intentional asymmetry (matches the project's pattern: positive states are silent; negative states are loud).
- C13's denominator is `100` (the constant); the formula `(SQ - 75) / 100` produces a `[-0.75, +0.25]` ratio multiplied by `K_squad_fit=5.0` → `[-3.75, +1.25]` range. Spot-check matches GDD §C13 rango.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 15/15 passing
**Deviations**:
  - ADVISORY: AC#4 test uses 1001 linear values instead of seedrandom — stronger coverage (no PRNG period concerns), documented.
  - ADVISORY: AC#14 W+1 arrival test uses C13_ONLY isolation instead of full C0+C3+C13 scenario — verifies mechanical invariant; full fan-in in story 017.
  - OUT OF SCOPE (valid): graph-topology.test.ts placeholder guard updated (same pattern as story 006).
**Test Evidence**: Logic — `packages/shared/tests/cascade-engine/chains-c2-c3-c13.test.ts` — 21/21 passing (187/187 suite)
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, max-value overflow test added)

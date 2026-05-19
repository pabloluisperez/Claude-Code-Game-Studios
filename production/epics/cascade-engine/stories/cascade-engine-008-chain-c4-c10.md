---
Story: CASCADE-ENGINE-008
Status: Pending
Type: Logic
GDD Requirement: AC-CTI-C4, AC-C10-interaction + cascade-engine.md §C4, §C10
Governing ADR: ADR-002, ADR-003
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c4-c10.test.ts
---

# Story: Chain C4 (training_intensity inverted parabola) + C10 multiplier (counterintuitive)

## Goal

Implement **C4** — `training_intensity → team_fitness` (delay 1w, noisy) — with C10's `staff_morale` multiplier integrated into K_C4 (per cascade-engine.md §C10 — C10 is NOT a separate edge). C4 is the project's second anchor counterintuitive chain: both extremes (>75 sobreentrenamiento, <25 infraentrenamiento) damage fitness; only the sweet spot 40-60 helps. The C10 multiplier means staff_morale modulates how much C4 helps in the sweet spot — but does NOT reverse the sign.

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

**C4 transferFn** (delay 1):

```
const SM_prev = prevState.staff_morale;
const K_C4_eff = K_C4 * (MORALE_SCALE_MIN + (SM_prev / 100) * (1 - MORALE_SCALE_MIN));
const I_train = prevState.training_intensity;
const base = K_C4_eff * (I_train - T_low) * (T_high - I_train) / 625;
const noise = (ctx.rng() - 0.5) * NOISE_C4_AMP;
return base + noise;
```

Constants: `K_C4 = 8.0`, `T_low = 25`, `T_high = 75`, `MORALE_SCALE_MIN = 0.5`, `NOISE_C4_AMP = 2.0`. `625 = (T_high - T_low)² / 4` — confirm with a code comment.

C10 is NOT a separate edge. Document this with a comment near the C4 transferFn body: "C10 — staff_morale modulator on K_C4 — integrated here per cascade-engine.md".

## Out of Scope

- C12 (sobreentrenamiento desesperado — the OTHER training-related chain). Story 013.
- C11 (staff_morale → match_performance_index). Story 010.
- C5b (catering → staff_morale upstream) — does not block this story since C4 reads `staff_morale` from prevState. Story 009.

## Acceptance Criteria

1. **AC-CTI-C4 spot 1** (T_low boundary): prevState `training_intensity=25, staff_morale=60`, `ctx.rng()=0.5` (noise=0) → C4 delta = `0.0` (parabola is zero at its roots).
2. **AC-CTI-C4 spot 2** (sobreentrenamiento): prevState `training_intensity=80, staff_morale=60`, `ctx.rng()=0.5` → C4 delta ≈ `-2.82`. (`K_C4_eff = 8.0 × 0.8 = 6.4`; `base = 6.4 × (80-25) × (75-80) / 625 = 6.4 × 55 × (-5) / 625 = -2.816`.)
3. **AC-CTI-C4 spot 3** (infraentrenamiento): prevState `training_intensity=10, staff_morale=60`, `ctx.rng()=0.5` → C4 delta = `-9.984` (per GDD math: `K_C4_eff = 6.4; delta = 6.4 × (10-25) × (75-10) / 625 = 6.4 × -975/625 = -9.984`).
4. **AC-CTI-C4 sweet spot**: prevState `training_intensity=50, staff_morale=60`, `ctx.rng()=0.5` → C4 delta = `+6.4` (`K_C4_eff = 6.4; base = 6.4 × 25 × 25 / 625 = +6.4`).
5. **Cross-verification of counterintuitivity (mandatory)**: BOTH extreme=80 AND extreme=10 produce **negative** deltas; sweet spot=50 produces positive delta. Assert all three signs explicitly in one combined test.
6. **AC-C10-interaction** (staff_morale=0 boundary): prevState `training_intensity=50, staff_morale=0`, `ctx.rng()=0.5` → `K_C4_eff = 8.0 × 0.5 = 4.0`, delta = `+4.0` (50% efficiency).
7. **AC-C10-interaction** (staff_morale=100 boundary): same inputs, `staff_morale=100` → `K_C4_eff = 8.0 × 1.0 = 8.0`, delta = `+8.0`.
8. **C10 reads prevState, NOT nextState (critical)**: in the same tick, C5b applies `+4` to `staff_morale` (e.g. catering_budget=100 from prevState `staff_morale=50`); C4's `K_C4_eff` STILL uses `prevState.staff_morale = 50`, not `nextState.staff_morale = 54`. This is ADR-003 Rule 3 — verify with an integration test that wires C5b in upstream (or stub C5b with a known delta) and confirms C4's delta uses staff_morale=50, not 54.
9. **AC-CTI-C4 oscillation edge case** (from cascade-engine.md Edge Cases line 544): GIVEN `training_intensity=90` in W=1 and `training_intensity=10` in W=2 (alternating extremes), 2 ticks with `ctx.rng()=0.5` → net 2-week C4 effect on team_fitness ≈ `-10.5` (within tolerance ±0.5). Verifies "alternating extremes is contraproducente".
10. **Noise term applied**: with `ctx.rng()=1.0` → delta gets `+1.0` add; with `rng()=0.0` → `-1.0`. Verify symmetry.
11. **Determinism**: same prevState + same seedrandom state → identical C4 delta across two `runTick` calls.
12. **Delay routing**: C4 has delay 1 — evaluated at W=N, contributes at W=N+1.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c4-c10.test.ts`:

- AC-CTI-C4 spots (AC #1, #2, #3, #4).
- Counterintuitivity proof (AC #5).
- AC-C10 boundaries (AC #6, #7).
- prevState invariance (AC #8) — critical Rule 3 test.
- Oscillation edge case (AC #9).
- Noise symmetry (AC #10).
- Determinism re-call (AC #11).
- Delay routing (AC #12).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 014 (no thresholds on team_fitness in MVP — but if added, C4 contributes). Story 017 (AC-EQL-02/03 require C4 to be silent at training_intensity=25 — verify in story 017).

## Estimate

**2 days.** The parabola has 3 boundary cases + sweet spot + 2 morale endpoints + oscillation edge case + the Rule 3 critical test. Test volume is high; the math is doable but the boundary semantics (T_low=25 produces delta=0 — is it strictly =0 or ε?) must match GDD line-by-line.

## Notes / Gotchas

- The parabola is `(I_train - T_low) × (T_high - I_train) / 625`. At `I_train = T_low = 25`: `(0) × (50) / 625 = 0`. At `I_train = T_high = 75`: `(50) × (0) / 625 = 0`. These are the parabola's roots — both produce delta = 0 in the deterministic part; the noise is the only deviation.
- The normalizer `625` is `(T_high - T_low)² / 4 = 50² / 4`. If T_low or T_high change in tuning, the normalizer must update — define it as a derived constant, NOT a magic number: `const C4_PARABOLA_NORMALIZER = ((T_high - T_low) ** 2) / 4;`. Add as named constant in story 002.
- AC-C10-interaction is the trick: the multiplier is `MORALE_SCALE_MIN + (SM / 100) × (1 - MORALE_SCALE_MIN)`, NOT `SM / 100`. At SM=0 → multiplier=0.5 (not 0.0); at SM=50 → multiplier=0.75; at SM=100 → multiplier=1.0. Document this in the transferFn body's comment block — it's been a source of confusion in the slice review.
- Per control-manifest Foundation Forbidden: ❌ Math.random(). C4 uses `ctx.rng()` exclusively. The noise test must inject a deterministic rng.
- Per cascade-engine.md Edge Case (oscillation): the alternating-extremes scenario is a player anti-pattern; the cascade C4 by itself dings them for ~-10.5 over 2 weeks. The preparador físico (staff-system, separate epic) emits warnings for both extremes — but that's downstream; this story just verifies the engine's behavior.

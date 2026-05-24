---
Story: CASCADE-ENGINE-010
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-CTI-C6 (asymmetric hysteresis), AC-PLD-04, AC-PLD-05 + cascade-engine.md §C6, §C7, §C11, §C14
Governing ADR: ADR-002, ADR-003, ADR-007 (match-sim writes MPI), ADR-008 (hasMatchThisWeek)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c6-c7-c11-c14.test.ts
---

# Story: Chains C6 + C7 + C11 + C14 (match-driven cluster — counterintuitive C6 hysteresis)

## Goal

Implement 4 chains in the match-driven cluster:

- **C6**: `match_performance_index → fan_momentum`, delay 0w, **counterintuitive asymmetric hysteresis** — win adds little, loss subtracts much (R4-tuned ratio = 1.0 K_loss/K_win but logarithmic-vs-quadratic shapes produce ~3.4× asymmetry). One of the 7 anchor counterintuitive chains.
- **C7**: `consecutive_wins → fan_momentum`, delay 0w, pure quadratic streak bonus.
- **C11**: `staff_morale → match_performance_index`, delay 0w, **guarded by `ctx.hasMatchThisWeek`**.
- **C14**: `field_quality → match_performance_index`, delay 0w, **guarded by `ctx.hasMatchThisWeek`**, **with noise** (`NOISE_C14_AMP = 2.0`).

These all evaluate match weeks; together with C16b they form the on-match-day cluster. C6 is the system's emotional spine: it's the chain that converts on-pitch performance into fan_momentum, the path-dependent variable from Core Rule 8.

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

**C6 transferFn** (delay 0, no guard — match-sim writes MPI ONLY on match weeks per ADR-007, but the engine treats MPI as a normal node):

```
const MPI = prevState.match_performance_index;
if (MPI >= 50) {
  const P_win = (MPI - 50) / 50;
  return K_win_base * Math.log1p(P_win);   // ln(1 + P_win)
} else {
  const P_loss = (50 - MPI) / 50;
  return -K_loss_base * (1 + P_loss * P_loss);
}
```

Constants: `K_win_base = 8.0`, `K_loss_base = 8.0` (per R4 fix — was 10, lowered to 8 to keep ratio at 1.0).

**C7 transferFn** (delay 0, pure):
`delta = K_streak_base × prevState.consecutive_wins × (prevState.consecutive_wins + 1) / 110`. `K_streak_base = 2.0`.

**C11 transferFn** (delay 0, guarded by hasMatchThisWeek):
`delta = K_morale_perf × (prevState.staff_morale - 50) / 50`. `K_morale_perf = 8.0`.

**C14 transferFn** (delay 0, guarded by hasMatchThisWeek, noisy):
`delta = K_home_advantage × (prevState.field_quality - 50) / 50 + (ctx.rng() - 0.5) × NOISE_C14_AMP`. `K_home_advantage = 6.0`, `NOISE_C14_AMP = 2.0`.

## Out of Scope

- C8 (price/momentum interaction) — story 011.
- C15 (price erosion delayed) — story 011.

## Acceptance Criteria

1. **AC-CTI-C6 victory**: prevState `match_performance_index=70` → C6 delta ≈ `+2.71`. (Verify: `8.0 × ln(1.4) = 8.0 × 0.3365 = +2.692` — accept within ±0.05.)
2. **AC-CTI-C6 defeat**: prevState `match_performance_index=30` → C6 delta = `-9.28`. (`P_loss = 0.4; delta = -8.0 × (1 + 0.16) = -9.28`. Note R4 example value differs slightly from line 337's `-8.32` due to the R4 reduction of K_loss; the AC-CTI-C6 R4 spec value is `-9.28` and supersedes the line 337 example. Treat the spec section as authoritative.) **CONFIRMED via the GDD R4 fix in the header**: K_loss_base 10→8; cross-reference cascade-engine.md AC-CTI-C6 (line 808).
3. **Cross-verification of asymmetry (mandatory per AC-CTI-C6)**: `|C6(MPI=30)| > |C6(MPI=70)|` AND specifically the magnitude ratio is roughly 3.4× (≥3.0× tolerance). I.e. `9.28 / 2.71 ≈ 3.42`. Assert this in a test — failing means the asymmetric structure has collapsed (e.g. K values made symmetric by mistake).
4. **AC-C6-equilibrium**: prevState `MPI=50` → C6 delta = `0.0` (uses positive branch by edge-case rule: line 536 of cascade-engine.md says "MPI exactamente 50 usa rama positiva, delta = 0").
5. **AC-C6-extreme-loss**: prevState `MPI=0` → C6 delta = `-16.0` (`P_loss=1.0; delta = -8.0 × 2.0 = -16.0`). Matches GDD rango.
6. **AC-C6-extreme-win**: prevState `MPI=100` → C6 delta ≈ `+5.5` (`8.0 × ln(2.0) = 8.0 × 0.693 = +5.546`).
7. **AC-C7 baseline**: prevState `consecutive_wins=5` → C7 delta = `+0.55` (matches GDD).
8. **AC-C7 max**: prevState `consecutive_wins=10` → C7 delta = `+2.0`.
9. **AC-C7 zero**: prevState `consecutive_wins=0` → C7 delta = `0.0`.
10. **AC-PLD-04 mirror (integration)**: prevState `consecutive_wins=3, consecutive_losses=0`, victory PlayerDecision pattern (`+1` to wins, `0` to losses) → C7 NEXT tick uses prevState.consecutive_wins=4 → delta = `(4×5)/110 × 2 = +0.36`. (This tests that the engine's Step 3 update of consecutive_wins is visible to C7 in the FOLLOWING tick.)
11. **AC-C11-baseline**: prevState `staff_morale=20`, `hasMatchThisWeek=true` → C11 delta = `-4.8` (matches GDD).
12. **AC-C11-guarded**: prevState `staff_morale=20`, `hasMatchThisWeek=false` → C11 does NOT fire. Log has `'guarded'` entry. `match_performance_index` not modified by C11 in that tick.
13. **AC-C14-baseline**: prevState `field_quality=80`, `hasMatchThisWeek=true`, `ctx.rng()=0.5` → C14 delta = `+3.6` (matches GDD; noise=0).
14. **AC-C14-noise**: same inputs with `ctx.rng()=1.0` → delta = `+3.6 + 1.0 = +4.6`. With `rng()=0.0` → `+2.6`.
15. **AC-C14-guarded**: `hasMatchThisWeek=false` → C14 does NOT fire. Note this means in non-match weeks, the entire MPI node is untouched by cascade edges (verifying AC-THR-06's precondition).
16. **Match-week MPI invariance (combined test)**: with `hasMatchThisWeek=true`, neither C11 nor C14 nor C16b is the SOLE writer to MPI in MVP — match-sim writes MPI from external compute (ADR-007). The engine treats it as a normal node fan-in target. Verify: `getEdgesByTarget('match_performance_index')` returns `['C11','C14','C16b']` per story 002 fan-in spot check.
17. **AC-THR-06 precondition**: a 100-tick run with `hasMatchThisWeek=false` for all 100 ticks, `ctx.rng()=0.5`, default WorldState → `match_performance_index` stays at 50 (its default) for all 100 ticks. C11, C14, C16b all guarded → no edge writes to MPI.
18. **Determinism for C14**: re-call → identical noise delta when seedrandom state matches.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c6-c7-c11-c14.test.ts`:

- AC-CTI-C6 spots (AC #1, #2, #4, #5, #6) — covering victory, defeat, equilibrium, extremes.
- AC-CTI-C6 asymmetry proof (AC #3) — ratio test.
- C7 spots (AC #7, #8, #9).
- C7 next-tick following Step 3 (AC #10) — integration test using `runTick` two times.
- AC-C11 baseline + guarded (AC #11, #12).
- AC-C14 baseline + noise + guarded (AC #13, #14, #15).
- MPI fan-in spot check (AC #16).
- AC-THR-06 precondition long-run test (AC #17).
- Determinism (AC #18).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 014 (thresholds — fan_momentum thresholds depend on C6+C7 outputs).

## Estimate

**2 days.** C6 is the system's emotional core; the asymmetry test (AC #3) is canonical and easy to break under tuning changes — explicit ratio assertion protects future tuning.

## Notes / Gotchas

- **R4 fix confusion**: line 337 of cascade-engine.md still shows the OLD example "−8.0 × (1 + 0.04) = −8.32" — this is a stale comment in the formula section. The authoritative R4-corrected value is in AC-CTI-C6 (line 808) which states `−8.0 × (1 + 0.16) = −9.28`. The math reconciles: `P_loss = 0.4 → P_loss² = 0.16` (not 0.04). The example computation on line 337 has an arithmetic error and is BACKWARDS — `0.4² = 0.16`, not `0.04`. Implement the formula correctly (P_loss² = 0.16 at MPI=30); AC #2 above codifies the correct value.
- C6 uses `Math.log1p(P_win)` rather than `Math.log(1 + P_win)` for numerical stability at small P_win. The slice's implementation used `Math.log(1 + x)` which is identical in our value range — either works, document the choice in a code comment.
- Edge case from cascade-engine.md line 536: MPI=50 exactly uses the positive branch; AC #4 verifies this.
- The hysteresis is asymmetric BY SHAPE (log on the win side, quadratic on the loss side), not by K. R4 fix made K equal on both sides; the structural asymmetry remains.
- C7's denominator `110` is `10 × 11`, the maximum value of `CW × (CW+1)` when CW=10. Stored as a derived constant `C7_DENOM = 110` (added during this story since story-002 omitted it).

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 18/18 passing
**Deviations**: None. C7_DENOM constant added here (was omitted from story-002's scope).
**Test Evidence**: Logic — `packages/shared/tests/cascade-engine/chains-c6-c7-c11-c14.test.ts` — 21/21 passing (264/264 suite)
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, MPI=49 boundary + C14 determinism strengthened)

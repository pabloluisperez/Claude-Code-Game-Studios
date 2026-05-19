---
Story: MATCH-SIM-007
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-13 (P_goal clamped [0.05, 0.45]), AC-MATCH-17 (emergency DEF-portero produces P_goal ≈ 0.417, normal GK ≈ 0.318)
Governing ADR: ADR-007 (P_goal formula with NaN guard), ADR-002 (no Math.random)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/p-goal.test.ts
---

# Story: F7 P_goal — Attacker vs Goalkeeper with NaN Guard (incl. Emergency DEF-as-GK)

## Goal

Implement F7: probability that a shot becomes a goal. Reads:

- Attacker's `finishing` and effectiveRating → `goal_att = (finishing × 0.6 + effective_rating × 0.4) / 100`.
- Goalkeeper's `reflexes`, `handling`, effectiveFitness(t) → `gk_def = (reflexes × 0.5 + handling × 0.3 + effective_fitness × 0.2) / 100`.
- **NaN guard**: `(goal_att + gk_def) > 0`? Else fallback to `0.25` (neutral midpoint — "ambos sin habilidad = partido de calle, probabilidad media").
- Clamp to `[0.05, 0.45]`.

Critically, when the goalkeeper is an emergency DEF (assignedAs='GOALKEEPER'), `getReflexes` and `getHandling` use the derived values `skill × 0.4` and `skill × 0.3` (per story 003). This story verifies the F7 output reflects the worse keeper correctly — the AC-MATCH-17 numeric trip-wire.

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `P_GOAL_CLAMP_MIN = 0.05`.
- `P_GOAL_CLAMP_MAX = 0.45`.
- `P_GOAL_FALLBACK_NAN = 0.25`.
- `P_GOAL_MULTIPLIER = 0.65`.

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function pGoal(attacker: PlayerStats, keeper: PlayerStats, t: number): number` — F7.
  - `goal_att = (getFinishing(attacker) × 0.6 + effectiveRating(attacker, t) × 0.4) / 100`.
  - `gk_def = (getReflexes(keeper) × 0.5 + getHandling(keeper) × 0.3 + effectiveFitness(keeper, t) × 0.2) / 100`.
    - `getReflexes` and `getHandling` from story 003 handle the emergency-GK derivation automatically — if `keeper.assignedAs === 'GOALKEEPER' && keeper.position === 'DEFENDER'`, the values are `keeper.skill × 0.4` and `keeper.skill × 0.3` respectively.
  - `sum = goal_att + gk_def`.
  - **NaN guard**: `if (!(sum > 0)) return P_GOAL_FALLBACK_NAN;`.
  - `raw = (goal_att / sum) × P_GOAL_MULTIPLIER`.
  - `return clamp(raw, P_GOAL_CLAMP_MIN, P_GOAL_CLAMP_MAX);`.

## Out of Scope

- The decision to fire `pGoal` (story 013 — per-tick loop calls it when F6 says "shot").
- Selecting the keeper from the lineup — the per-tick algorithm finds the player with `position === 'GOALKEEPER'` OR `assignedAs === 'GOALKEEPER'`.
- VAR resolution post-goal (story 010).

## Acceptance Criteria

- [ ] **AC-MATCH-13 upper bound**: FWD `finishing=100, effectiveRating=100` vs GK `reflexes=0, handling=0, fitness=0, stamina=100` (so effective_fitness=0) → `goal_att = 1.0`, `gk_def = 0`, `sum = 1.0`, `raw = 0.65` → clamped to `0.45`.
- [ ] **AC-MATCH-13 lower bound**: FWD `finishing=0, effectiveRating=0` vs GK `reflexes=100, handling=100, fitness=100, stamina=100` → `goal_att = 0`, `gk_def = 1.0`, `sum = 1.0`, `raw = 0 → clamped to 0.05`.
- [ ] **GDD reference example**: `goal_att=0.671, gk_def=0.601` → `raw = 0.671/1.272 × 0.65 = 0.343` (clamp passthrough, value in range). Tolerance 0.005.
- [ ] **AC-MATCH-17 quantification (emergency DEF-portero)**:
  - DEF with `skill=70`, `fitness=90`, `stamina=70`, `assignedAs='GOALKEEPER'`, `position='DEFENDER'`. effective_fitness(t=31) ≈ `90 - (31/90)×(1-70/100)×15 = 90 - 1.55 = 88.45`. `getReflexes = 70 × 0.4 = 28`; `getHandling = 70 × 0.3 = 21`.
  - FWD with `finishing=70, effective_rating=65, fitness=90, stamina=70` (effective at t=31 ≈ 88.45).
  - `goal_att = (70 × 0.6 + 65 × 0.4) / 100 = (42 + 26) / 100 = 0.680`.
  - `gk_def_DEF = (28 × 0.5 + 21 × 0.3 + 88.45 × 0.2) / 100 = (14 + 6.3 + 17.69) / 100 = 0.380`.
  - `raw_DEF = 0.680 / (0.680 + 0.380) × 0.65 = 0.680 / 1.060 × 0.65 = 0.417`.
  - Assert `pGoal(fwd, defKeeper, 31) ≈ 0.417` (tolerance 0.005).
- [ ] **AC-MATCH-17 normal-GK comparison**: same FWD vs a normal GK `reflexes=70, handling=60, fitness=90, stamina=70`. `gk_def_GK = (70 × 0.5 + 60 × 0.3 + 88.45 × 0.2) / 100 = (35 + 18 + 17.69) / 100 = 0.707` (the GDD says 0.712 — slight tolerance because GDD rounds effective_fitness to 88.5).
  - `raw_GK = 0.680 / (0.680 + 0.707) × 0.65 = 0.680 / 1.387 × 0.65 = 0.319` (GDD says 0.318).
  - **Critical assertion**: `pGoal(fwd, defKeeper, 31) > pGoal(fwd, normalGK, 31)` — emergency keeper is quantifiably worse. AC-MATCH-17 mandates this differential.
- [ ] **NaN guard**: FWD all-zero vs GK all-zero → `sum = 0` → returns `0.25` (fallback). NO NaN.
- [ ] **Clamp endpoints**: enumerate `raw ∈ {0.02, 0.25, 0.50}` → results `{0.05, 0.25, 0.45}`.
- [ ] **Time-dependence via effective_fitness**: same GK at t=1 vs t=90 with stamina<100 → P_goal at t=90 is higher (GK fatigue lowers `gk_def`). Validates that F7 integrates the F1 decay correctly.

## Implementation Notes

*From GDD F7 + Edge case "portero lesionado sin GK":*

- The 0.25 fallback (not 0.05 like F6) was chosen intentionally: "ambos sin habilidad = partido de calle". This is the GDD's choice — don't change it without a quick-design revision.
- Emergency DEF-portero derivation happens in `getReflexes`/`getHandling` (story 003), not here. F7 just calls those helpers and the math flows correctly. Verify integration.
- The slice's match-sim has the AC-MATCH-17 numbers as a comment — production must reproduce exactly.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/p-goal.test.ts`:

- AC-MATCH-13 upper + lower clamps.
- GDD example (0.343).
- AC-MATCH-17 dual case: DEF-portero ≈ 0.417, normal GK ≈ 0.318. Assert DEF > GK.
- NaN guard (zero/zero).
- Clamp endpoint enumeration.
- t=1 vs t=90 effective_fitness sensitivity.

## Dependencies

- **Upstream**: 001 (types), 003 (effectiveFitness, effectiveRating, getFinishing, getReflexes, getHandling helpers — esp. emergency-GK derivation).
- **Downstream blockers**: 010 (VAR fires on a confirmed goal → P_goal needs to have produced one), 013 (per-tick loop).

## Estimate

**1 day.** Formula is small; AC-MATCH-17 is the verification weight — three formula evaluations per assertion with exact-decimal expectations.

## Notes / Gotchas

- **AC-MATCH-17 tolerance**: GDD says 0.417 and 0.318 using `effective_fitness ≈ 88.5`. The math is `effective_fitness(t=31) = 90 - (31/90)×0.3×15 = 90 - 1.55 = 88.45`. The 0.05 difference compounds slightly. Use `toBeCloseTo(0.417, 2)` (2 decimals) rather than exact equality.
- **Don't mutate `assignedAs` in F7**. The emergency derivation is a *read-only* property of the keeper. The substitution that ASSIGNS a DEF as GK happens in story 014 (FSM state transition), not here.
- **`!(sum > 0)` form** catches NaN AND zero AND negative. Cleaner than `if (Number.isNaN(sum) || sum <= 0)`.

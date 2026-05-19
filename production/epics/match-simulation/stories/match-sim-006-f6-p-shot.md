---
Story: MATCH-SIM-006
Status: Pending
Type: Logic
GDD Requirement: AC-MATCH-12 (P_shot clamped to [0.10, 0.70])
Governing ADR: ADR-007 (P_shot formula with defender-team formation_mod + hold_shape_mod), ADR-002 (NaN guards stem from determinism discipline)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/p-shot.test.ts
---

# Story: F6 P_shot — Attacker vs Defender Context with NaN Guard + Defender-Team Modifiers

## Goal

Implement F6: probability that an attack reaches a shot. Reads:

- Attacker FWD's effectiveRating, speed, and the attacking team's avg MID vision (`att_ctx`).
- Defender DEF's effectiveRating, strength, tackling (`def_ctx`).
- **Defender-team** formation_mod and hold_shape_mod applied multiplicatively in the **divisor**: `def_ctx_adj = def_ctx / (formation_mod × hold_shape_mod)`. The 4-3-3 defender has `formation_mod = 1.15`, increasing the divisor and *decreasing* `def_ctx_adj`, which *increases* `P_shot` (defender's high-attack formation = less defensive shape, more shots conceded — intentional per GDD).
- **NaN guard**: if `att_ctx + def_ctx_adj <= 0` (e.g. DEF-portero with skill=0 exhausted against a striker with skill=0), 0/0 = NaN in TypeScript — the clamp does NOT protect (NaN propagates through `Math.min`/`Math.max`). Fall back to 0.10 (the clamp minimum).

The clamp range is `[0.10, 0.70]`.

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `FORMATION_DEFENSE_MOD: Record<FormationPreset, number>` — `{ '4-4-2': 1.0, '4-3-3': 1.15, '3-5-2': 1.05, '5-3-2': 0.85 }`. Higher = more shots conceded (less defensive integrity).
- `HOLD_SHAPE_MOD = 0.9`. Applied when the defender's instruction is `HOLD_SHAPE`.
- `P_SHOT_CLAMP_MIN = 0.10`.
- `P_SHOT_CLAMP_MAX = 0.70`.
- `P_SHOT_FALLBACK_NAN = 0.10`.
- `P_SHOT_MULTIPLIER = 0.80` (the `× 0.80` in `(att_ctx / sum) × 0.80`).

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function pShot(args: { attacker: PlayerStats; attackingMids: PlayerStats[]; defender: PlayerStats; defenderFormation: FormationPreset; defenderHasHoldShape: boolean; t: number; }): number` — F6.
  - Compute `att_ctx = (effectiveRating(attacker, t) × 0.4 + getSpeed(attacker) × 0.3 + avg(attackingMids.map(getVision)) × 0.3) / 100`.
  - Compute `def_ctx = (effectiveRating(defender, t) × 0.4 + getStrength(defender) × 0.3 + getTackling(defender) × 0.3) / 100`.
  - `formationDefMod = FORMATION_DEFENSE_MOD[defenderFormation]`.
  - `holdShapeMod = defenderHasHoldShape ? HOLD_SHAPE_MOD : 1.0`.
  - `def_ctx_adj = def_ctx / (formationDefMod × holdShapeMod)`.
  - `sum = att_ctx + def_ctx_adj`.
  - **NaN guard**: `if (!(sum > 0)) return P_SHOT_FALLBACK_NAN;` — the `!(x > 0)` form catches `NaN` and `<= 0` simultaneously.
  - `raw = (att_ctx / sum) × P_SHOT_MULTIPLIER`.
  - `return clamp(raw, P_SHOT_CLAMP_MIN, P_SHOT_CLAMP_MAX)`.

## Out of Scope

- F7 (P_goal — story 007).
- Selecting which defender is "the defender" for a given attack — the per-tick algorithm (story 013) picks the highest-rated DEF on the field. F6 receives the chosen player.
- The defender's instruction value source — the per-tick algorithm passes `currentInstructionDefender === 'HOLD_SHAPE'` as `defenderHasHoldShape`.

## Acceptance Criteria

- [ ] **AC-MATCH-12 upper bound**: attacker with all stats 100 vs defender with all stats 0, `t=1`: `att_ctx ≈ 1.0`, `def_ctx ≈ 0.0`, defender 4-4-2 no HOLD_SHAPE → `def_ctx_adj = 0.0`, `sum = 1.0`, `raw = 0.80` → clamped to `0.70`.
- [ ] **AC-MATCH-12 lower bound**: attacker stats 0 vs defender stats 100, defender 4-4-2 no HOLD_SHAPE → `att_ctx ≈ 0`, `def_ctx ≈ 1.0`, `sum = 1.0`, `raw = 0 → clamped to 0.10`.
- [ ] **GDD reference example**: `att_ctx=0.654, def_ctx=0.586`, 4-4-2 no HOLD_SHAPE → `def_ctx_adj = 0.586`, `sum = 1.240`, `raw = 0.654/1.240 × 0.80 = 0.422` (the GDD's "0.42" rounded). Tolerance 0.005.
- [ ] **Defender 4-3-3 increases P_shot**: same attacker + defender stats, defender formation 4-4-2 vs 4-3-3. The 4-3-3 case yields a HIGHER P_shot (4-3-3 has `formation_mod = 1.15`, increasing the divisor, decreasing `def_ctx_adj`, increasing P_shot). Numeric: with `att_ctx=0.5, def_ctx=0.5`, 4-4-2: P_shot = 0.4; 4-3-3: `def_ctx_adj = 0.5/1.15 ≈ 0.435`, `raw = 0.5/0.935 × 0.80 ≈ 0.428`. Assert 4-3-3 > 4-4-2.
- [ ] **HOLD_SHAPE decreases P_shot**: same stats, defender has HOLD_SHAPE active. `holdShapeMod = 0.9`; divisor becomes smaller (since we divide by 0.9 inside the formation_mod * holdShapeMod product... wait: `def_ctx / (formation_mod × hold_shape_mod) = def_ctx / (1.0 × 0.9) = def_ctx / 0.9`, which is LARGER than def_ctx, meaning `def_ctx_adj` is LARGER, P_shot is SMALLER). Test: assert P_shot with HOLD_SHAPE < P_shot without (defender 4-4-2 baseline).
- [ ] **Multiplicative composition**: defender 5-3-2 + HOLD_SHAPE → `formation_mod × hold_shape_mod = 0.85 × 0.9 = 0.765`; def_ctx_adj = def_ctx / 0.765. Assert this matches the explicit product (no rounding drift).
- [ ] **NaN guard**: with `attacker.skill=0, fitness=0, form=30, morale=0, speed=0`, `mids` all stats 0, `defender` similarly zeroed → `att_ctx = 0, def_ctx = 0, def_ctx_adj = 0/1 = 0, sum = 0`. Result: `0.10` (fallback). Verify NO NaN propagates.
- [ ] **NaN guard variant — `Infinity / Infinity`**: with massively scaled inputs, no overflow path produces NaN. (Defensive only — values in [0,100] are bounded so this should never trigger.)
- [ ] **Clamp endpoints**: enumerate scenarios producing `raw = 0.05`, `raw = 0.5`, `raw = 0.8` → results 0.10, 0.50, 0.70 respectively.

## Implementation Notes

*From GDD F6 R3 fix:*

- `formation_mod` and `hold_shape_mod` belong to the **defender team** (the team NOT attacking in this tick).
- They are applied **multiplicatively in a SINGLE divisor** — `def_ctx / (formation_mod × hold_shape_mod)`. Previous R2 had them as separate divisors, R3 collapsed to one.
- `formation_mod` semantics: HIGHER value → MORE shots conceded. Counter-intuitive at first glance — document in code: "4-3-3 defender = lower defensive integrity, more shots conceded; 5-3-2 = tighter shape, fewer shots."
- NaN guard pattern: `if (!(sum > 0)) return 0.10;` rather than `if (sum === 0)` because NaN `!== 0` but `NaN > 0` is false. The negation form catches both.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/p-shot.test.ts`:

- AC-MATCH-12 upper + lower clamps.
- GDD example reproduction (0.42).
- Defender formation comparisons (4-4-2 vs 4-3-3, 4-4-2 vs 5-3-2).
- HOLD_SHAPE effect (with vs without).
- Multiplicative formation × HOLD_SHAPE.
- NaN guard with zeroed inputs.
- Clamp endpoint enumeration.

## Dependencies

- **Upstream**: 001 (types), 003 (effectiveRating, getSpeed, getVision, getStrength, getTackling helpers).
- **Downstream blockers**: 007 (F7 follows F6), 013 (per-tick loop calls pShot when F5 says "attack").

## Estimate

**1 day.** Formula is well-defined; the NaN guard and the defender-team modifier semantics are the testing focus.

## Notes / Gotchas

- **The `NaN` guard is the slice's hard-won lesson** — slice's match-determinism.test.ts has a regression test for exactly this case. Production must replicate.
- **Defender 4-3-3 = more shots conceded is intentional but unintuitive**. A defender that picks 4-3-3 is choosing offense over defense; the GDD is consistent. Code comment must explain why future maintainers don't "fix" it by inverting the mod.
- **HOLD_SHAPE belongs to the defender team's instruction** — not the attacker. The per-tick algorithm (story 013) is responsible for passing the correct `defenderHasHoldShape` boolean.

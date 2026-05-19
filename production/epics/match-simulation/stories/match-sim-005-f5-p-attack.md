---
Story: MATCH-SIM-005
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-11 (mean goals in [2.0, 3.0] over 10,000 sims), AC-MATCH-26 (COUNTER: no effect when momentum ≤ 65, no effect for home), AC-MATCH-31 (formation_attack_mod affects P_attack ratio, not P_goal)
Governing ADR: ADR-007 (per-team formation+instruction modifiers), ADR-002 (single rng() roll for attack resolution)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/p-attack.test.ts
---

# Story: F5 P_attack — Per-Team Formation + Instruction Modifiers + Single-Roll Invariant

## Goal

Implement F5: the per-tick probability that each team launches an attack, with **per-team** formation modifiers (`formation_attack_mod_home/away`) and **per-team** instruction modifiers (`instruction_mod_home/away`), plus the COUNTER instruction conditional bonus (away-only, when `home_momentum > 65`).

The critical invariant: a **single `rng()` call** resolves the attack — `roll < P_attack_home` → home attack; `roll < P_attack_home + P_attack_away` → away attack; else no attack. The GDD validates `P_attack_home + P_attack_away < 1.0` in all combinations (verified in §F5 Invariant). This single-roll structure is what makes formation/instruction modifiers compose without breaking the determinism contract.

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `BASE_ATTACK_RATE = 0.15`.
- `FORMATION_ATTACK_MOD: Record<FormationPreset, number>` = `{ '4-4-2': 1.0, '4-3-3': 1.2, '3-5-2': 0.9, '5-3-2': 0.75 }`.
- `INSTRUCTION_ATTACK_MOD` lookup helper: returns `1.05` for `PRESS_HIGH`, `0.95` for `HOLD_SHAPE`, `1.0` for `null` or `'COUNTER'` (COUNTER does NOT modify the base rate; it adds a conditional multiplicative bonus to `P_attack_away` only — see below).
- `COUNTER_MOMENTUM_THRESHOLD = 65`.
- `COUNTER_BONUS_FACTOR = 1.10`.

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function computePAttackHome(home: TeamPAttackContext, momentum: number): number` and `computePAttackAway(...)`. The `TeamPAttackContext` bundles `{ formation: FormationPreset; instruction: TeamInstruction | null; avgFwdSpeed: number }`.
- `export function resolveAttackRoll(ctx: SimContext, pAttackHome: number, pAttackAway: number): 'home' | 'away' | 'none'` — single rng() roll. Per the GDD §F5 invariant, `pAttackHome + pAttackAway < 1.0` always — assert this in dev (non-throwing log if violated; do NOT crash production).
- COUNTER application is handled inside `computePAttackAway`: if `instruction === 'COUNTER' && momentum > 65`, multiply the away P_attack by `1.10`. Home team's COUNTER is a no-op (enforced at HTTP layer too — see story 017).

## Out of Scope

- The HTTP rejection of home-team COUNTER (story 017 — `400 'counter_unavailable_for_home'`).
- The single-roll invariant **chained** with F6/F7 (story 013 integrates).
- The 10,000-sim AC-MATCH-11 mean-goals validation (story 019 — full sim integration; this story only validates the F5 formula in isolation).

## Acceptance Criteria

- [ ] **Per-team formation mod**: with `momentum=50`, `avgFwdSpeed=70`, 4-4-2 + no instruction: `pAttackHome ≈ 0.15×1.0×1.0×0.5 + 0.70×0.03 = 0.075 + 0.021 = 0.096`. Change home formation to 4-3-3: pAttackHome ≈ `0.15×1.2×1.0×0.5 + 0.021 = 0.090 + 0.021 = 0.111`. **AC-MATCH-31 ratio**: `pAttackHome_4-3-3 / pAttackHome_4-4-2 ≈ 1.2` (the speed-bonus term is unaffected by formation, so ratio is slightly less than 1.2; budget tolerance 0.01).
  - **Correction**: AC-MATCH-31 says the ratio is exactly `1.2`. To satisfy this, the test must compute the formation-only component `BASE_ATTACK_RATE × formation_mod × (momentum/100)` separately and assert ratio 1.2 there. Add a non-public helper or expose the unmodified `base_rate × momentum_normalized` term for testing.
- [ ] **Instruction mod**: PRESS_HIGH bumps base_rate by 5%; HOLD_SHAPE shaves 5%; no instruction is neutral. Test all three.
- [ ] **COUNTER active, momentum > 65**: away P_attack = `(base × momentum_norm + speed_bonus) × 1.10`. Test with momentum=70.
- [ ] **AC-MATCH-26 case 1**: COUNTER active, momentum=60 → away P_attack equals the value computed WITHOUT COUNTER (the 65 threshold is `>`, not `≥`).
- [ ] **AC-MATCH-26 case 2**: home team with COUNTER + momentum=70 → home P_attack equals the value computed WITHOUT COUNTER. COUNTER has no effect for home team.
- [ ] **Single-roll invariant**: `resolveAttackRoll` calls `ctx.rng()` exactly ONCE. Use vi.fn spy.
- [ ] **`P_home + P_away < 1.0` always**: enumerate all worst-case combinations (4-3-3 home + PRESS_HIGH + max momentum + max speed) AND (4-3-3 away + PRESS_HIGH + COUNTER + max momentum=80). Assert sum < 1.0. (GDD calculation: peak sum = 0.256 in COUNTER case.)
- [ ] **Speed bonus**: with `avgFwdSpeed=0`, the speed term is 0. With `avgFwdSpeed=100`, the speed term is `0.03`. Linear in between.
- [ ] **AC-MATCH-31 P_goal NOT affected by formation_attack_mod**: F5 ratio = 1.2; F7 (P_goal) called with identical attacker + GK gives identical result regardless of homeFormation. (This is a cross-check — the actual F7 implementation is in story 007; this AC is asserted in the integration sim test, not in this story's unit tests.)

## Implementation Notes

*From GDD F5 R4 fix:*

- `instruction_mod_home = PRESS_HIGH ? 1.05 : (HOLD_SHAPE ? 0.95 : 1.0)` — COUNTER does NOT enter this expression (COUNTER applies AFTER `P_attack_away` is computed).
- `BASE_ATTACK_RATE × formation_mod × instruction_mod` is the per-team `base_rate`. Both formation and instruction multipliers compose multiplicatively.
- The 10,000-sim test at AC-MATCH-11 budget: `testTimeout: 300_000` (5 min) in `vitest.config.ts` — that's for the FULL match sim, not just F5. Story 019 owns the full integration test.
- **COUNTER threshold is strict `>` 65** — momentum=65 exactly does NOT trigger. The GDD wording "home_momentum > 65" is exclusive. Test the boundary.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/p-attack.test.ts`:

- Numeric AC computations (per-team mods, COUNTER, speed bonus).
- AC-MATCH-26 both branches (momentum=60 + COUNTER; home + COUNTER).
- Single-rng() invariant on resolveAttackRoll.
- P_sum < 1.0 worst case (parameterized test sweeping formations × instructions × momentum extremes).
- AC-MATCH-31 ratio (formation-only component) — test the helper that exposes `base_rate × momentum_norm` separately.

## Dependencies

- **Upstream**: 001 (types), 003 (effectiveFitness/effectiveRating used inside the attack resolver downstream — but F5 itself uses `avgFwdSpeed`, not effective_rating), 004 (consumes `home_momentum[t]` from F4).
- **Downstream blockers**: 006 (F6 fires when F5 says "attack"), 013 (per-tick loop integrates F5+F6+F7).

## Estimate

**1.5 days.** Modifier composition is straightforward but the COUNTER conditional + the boundary tests (momentum=65 exactly, home-COUNTER no-op) need careful test design.

## Notes / Gotchas

- **The single-roll structure** is what makes per-team modifiers safe. If a future change splits attack resolution into two `rng()` calls (one per team), the determinism contract breaks at any combination where the modifier order matters. Stick to one roll.
- **AC-MATCH-31 ratio sleight**: the ratio of 1.2 is **exactly 1.2 only for the formation-driven component** (`BASE_ATTACK_RATE × formation_mod × momentum_norm`). The full `P_attack` includes the speed bonus, which is invariant to formation, so the full ratio is slightly less than 1.2. The test asserts on the formation component, not the full value. The GDD AC-MATCH-31 wording could be cleaner — flag for a future GDD R7 revision.
- **`instruction_mod` for COUNTER = 1.0**: the table in GDD line 590 says "COUNTER: 1.0" — that is, COUNTER does NOT enter the multiplicative base_rate calculation; instead it's a separate conditional bonus on P_attack_away. Implement accordingly.

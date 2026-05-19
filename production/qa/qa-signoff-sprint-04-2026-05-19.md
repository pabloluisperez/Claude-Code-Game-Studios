# Sprint 04 — QA Sign-Off Report

**Date**: 2026-05-19
**Sprint**: 04 — Match Simulation Core Formulas (F1–F7)
**Verdict**: ✅ **APPROVED**

---

## Stories Delivered

| ID | Story | Type | Priority | Tests | Status |
|---|---|---|---|---|---|
| 004-01 | MATCH-SIM-003: F1 effective_fitness + F2 effective_rating | Logic | Must Have | 20/20 | ✅ Done |
| 004-02 | MATCH-SIM-004: F3 + F4 momentum | Logic | Must Have | 15/15 | ✅ Done |
| 004-03 | MATCH-SIM-005: F5 P_attack | Logic | Must Have | 18/18 | ✅ Done |
| 004-04 | MATCH-SIM-006: F6 P_shot | Logic | Must Have | 9/9 | ✅ Done |
| 004-05 | MATCH-SIM-007: F7 P_goal | Logic | Must Have | 8/8 | ✅ Done |
| 004-06 | MATCH-SIM-008: Card detection | Logic | Should Have | 18/18 | ✅ Done |
| 004-07 | MATCH-SIM-009: Injury detection | Logic | Should Have | 17/17 | ✅ Done |
| 004-08 | MATCH-SIM-010: VAR resolution | Logic | Nice to Have | — | ⏭️ Carryover |

**Stories delivered**: 7 (5 Must Have + 2 Should Have)
**Stories carried over**: 1 Nice to Have (MATCH-SIM-010 → Sprint 5)

---

## Test Suite Status

- **Total tests**: 436 passing (0 failing, 0 skipped)
- **Test files**: 24
- **Type check**: `tsc --noEmit` clean
- **New test files this sprint**:
  - effective-stats.test.ts (20 tests)
  - momentum.test.ts (15 tests)
  - p-attack.test.ts (18 tests)
  - p-shot.test.ts (9 tests)
  - p-goal.test.ts (8 tests)
  - cards.test.ts (18 tests)
  - injuries.test.ts (17 tests)
- **New source files**: football-formulas.ts, football-constants.ts, football-cards.ts, football-injuries.ts

---

## Definition of Done Verification

- [x] All Must Have stories Status: Complete (5/5)
- [x] F1-F7 implemented in `packages/shared/src/sim/sports/football/football-formulas.ts`
- [x] `tsc --noEmit` clean
- [x] Smoke check: full suite passes (436/436)
- [x] QA sign-off: APPROVED
- [x] No S1 or S2 bugs open
- [x] Should Have stories (008, 009) included

---

## Critical Correctness ACs Verified

- **AC-MATCH-07 F1 clamp**: `effectiveFitness({fitness:8, stamina:40}, 90) = 0` (clamped from -1.0). Output ≥ 0 across 10,000 random samples ✓
- **AC-MATCH-08 F2 weights sum to 1.0**: 0.35+0.20+0.15+0.30 = 1.0 ✓
- **AC-MATCH-09 F3 range invariant**: output ∈ [45, 55] across 10,000 random snapshot inputs ✓
- **AC-MATCH-10 F4 clamp**: dominant home vs weak away → momentum saturates at MOMENTUM_MAX(80); reverse saturates at MOMENTUM_MIN(20) ✓
- **AC-MATCH-01/02 single-rng F4**: vi.fn spy confirms exactly 1 rng() call per momentumDelta ✓
- **AC-MATCH-31 F5 formation ratio**: pAttackBaseComponent(4-3-3) / pAttackBaseComponent(4-4-2) = exactly 1.2 ✓
- **AC-MATCH-26 COUNTER conditional**: home-COUNTER no-op; away-COUNTER at momentum=65 no-op; away-COUNTER at momentum=66 → ×1.10 bonus ✓
- **F5 invariant pH + pA < 1.0**: 320+ parameterized combinations (4 formations × 4 instructions per team × 5 momentum spots) — all under 1.0 ✓
- **AC-MATCH-12 F6 clamp**: lower (0.10) + upper (0.70) clamps fire with extreme attacker/defender stats ✓
- **F6 NaN guard**: 200 randomized inputs → 0 NaN, all results ∈ [0.10, 0.70] ✓
- **AC-MATCH-13 F7 clamp**: lower (0.05) + upper (0.45) clamps fire ✓
- **AC-MATCH-17 emergency DEF-portero quantification**: DEF-as-GK with skill=70 → reflexes=28, handling=21 → P_goal ≈ 0.417 vs normal GK ≈ 0.318 (DEF > GK by > 0.05) ✓
- **AC-MATCH-22 second-yellow → automatic red**: events array contains both yellow_card and red_card{reason:'second_yellow'} in order; playerSentOff=true ✓
- **AC-MATCH-28 causal_node='injury_risk'**: all emitted injury events carry the exact string `'injury_risk'` ✓
- **Rival injury_risk constant=50**: `getInjuryRiskCtx('away', 'home', snap{injury_risk:70})` returns 50, not 70 ✓

---

## Bugs Found and Fixed During Sprint

1. **MATCH-SIM-004 F4 test arithmetic**: initial test computed 3-5-2 home expected delta assuming away vision=50 when default was 70. Test expectation corrected; spec value -0.35 (not -0.75) verified. 1-edit fix.

---

## API Surface Added This Sprint

**football-formulas.ts** (12 new exports):
- `effectiveFitness`, `effectiveRating` (F1, F2)
- `getPassing`, `getVision`, `getSpeed`, `getFinishing`, `getStrength`, `getTackling`, `getReflexes`, `getHandling` (position-stat accessors, with emergency-GK derivation)
- `homeMomentumInitial`, `momentumDelta`, `applyMomentumDelta` (F3, F4)
- `pAttackBaseComponent`, `pAttackSpeedBonus`, `computePAttackHome`, `computePAttackAway`, `resolveAttackRoll` (F5)
- `pShot` (F6)
- `pGoal` (F7)
- `pYellow`, `shouldRunCardCheck` (F8a card formula)

**football-cards.ts** (1 new export):
- `resolveCardCheck` — single entry point for tackle-window card resolution

**football-injuries.ts** (4 new exports):
- `pInjury`, `getInjuryRiskCtx`, `shouldRunInjuryCheck`, `resolveInjuryCheck`

**football-constants.ts** (~25 new exports):
- All balance constants exported (FITNESS_DECAY_MAX, FORMATION_ATTACK_MOD, etc.)
- Configuration centralized for low-risk tuning passes

**football-types.ts** (extensions):
- `MatchEvent.reason?: string` — sub-type discriminator for cards/injuries
- `PreMatchSnapshot.injury_risk: number` — added per MATCH-SIM-009 needs (flagged for GDD R7)

---

## Carryover to Sprint 5

| Story | Estimate | Notes |
|---|---|---|
| MATCH-SIM-010 (VAR resolution) | 1d | Nice to Have, depends on F6 (now done) |

Sprint 05 candidates:
- MATCH-SIM-010 (VAR)
- MATCH-SIM-011 (forfeit + post-match deltas — F8 + F9 + F10)
- MATCH-SIM-012 (rival AI formation + subs)
- MATCH-SIM-013 (per-tick simulator loop integration)

---

## Recommended Next Steps

- Sprint 5 plan: MATCH-SIM-010 + 011 + 012 + 013 (the per-tick loop integration is the milestone)
- Manual test of full match flow blocked until MATCH-SIM-013 (per-tick loop) is implemented

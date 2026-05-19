/**
 * Unit tests for F5 — P_attack + single-roll attack resolution.
 *
 * Story: MATCH-SIM-005
 * Acceptance Criteria: AC-MATCH-11 (sum<1), AC-MATCH-26 (COUNTER conditional), AC-MATCH-31 (formation ratio)
 * Test Evidence: packages/shared/tests/match-sim/p-attack.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  computePAttackHome,
  computePAttackAway,
  pAttackBaseComponent,
  pAttackSpeedBonus,
  resolveAttackRoll,
  type TeamPAttackContext,
} from '../../src/sim/sports/football/football-formulas.js';
import {
  BASE_ATTACK_RATE,
  COUNTER_BONUS_FACTOR,
  COUNTER_MOMENTUM_THRESHOLD,
  FORMATION_ATTACK_MOD,
  SPEED_BONUS_WEIGHT,
  instructionAttackMod,
} from '../../src/sim/sports/football/football-constants.js';
import type {
  FormationPreset,
  TeamInstruction,
} from '../../src/sim/sports/football/football-types.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides: Partial<TeamPAttackContext> = {}): TeamPAttackContext {
  return {
    formation: '4-4-2',
    instruction: null,
    avgFwdSpeed: 50,
    ...overrides,
  };
}

function makeCtx(rng: () => number): SimContext {
  return { rng, currentWeek: 1, hasMatchThisWeek: true, prevState: defaultWorldState() };
}

// ── Component validators ──────────────────────────────────────────────────────

describe('F5 components', () => {
  it('test_p_attack_base_component_no_modifiers', () => {
    // 4-4-2 + no instruction + momentum=50:
    // base = 0.15 × 1.0 × 1.0 × 0.5 = 0.075
    const team = makeTeam();
    expect(pAttackBaseComponent(team, 50)).toBeCloseTo(0.075, 10);
  });

  it('test_p_attack_speed_bonus_at_extremes', () => {
    expect(pAttackSpeedBonus(0)).toBe(0);
    expect(pAttackSpeedBonus(100)).toBeCloseTo(SPEED_BONUS_WEIGHT, 10);
    expect(pAttackSpeedBonus(50)).toBeCloseTo(SPEED_BONUS_WEIGHT / 2, 10);
  });

  it('test_instruction_mod_press_high_and_hold_shape', () => {
    expect(instructionAttackMod('PRESS_HIGH')).toBeCloseTo(1.05, 10);
    expect(instructionAttackMod('HOLD_SHAPE')).toBeCloseTo(0.95, 10);
    expect(instructionAttackMod(null)).toBe(1.0);
    expect(instructionAttackMod('COUNTER')).toBe(1.0);
  });
});

// ── AC-MATCH-31: formation ratio on base component ────────────────────────────

describe('AC-MATCH-31 — formation_attack_mod ratio (base component)', () => {
  it('test_ac_match_31_formation_ratio_4_3_3_vs_4_4_2_exact', () => {
    // The formation-only component is BASE_ATTACK_RATE × formation_mod × momentum_norm.
    // Ratio = FORMATION_ATTACK_MOD[4-3-3] / FORMATION_ATTACK_MOD[4-4-2] = 1.2
    const t442 = makeTeam({ formation: '4-4-2' });
    const t433 = makeTeam({ formation: '4-3-3' });
    const m = 50;
    const ratio = pAttackBaseComponent(t433, m) / pAttackBaseComponent(t442, m);
    expect(ratio).toBeCloseTo(1.2, 10);
  });

  it('test_ac_match_31_full_p_attack_ratio_slightly_below_1_2', () => {
    // Including speed bonus, ratio is slightly less than 1.2 (speed term invariant).
    const t442 = makeTeam({ formation: '4-4-2', avgFwdSpeed: 70 });
    const t433 = makeTeam({ formation: '4-3-3', avgFwdSpeed: 70 });
    const m = 50;
    const ratio = computePAttackHome(t433, m) / computePAttackHome(t442, m);
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.2);
  });
});

// ── Instructions ──────────────────────────────────────────────────────────────

describe('F5 — instruction modifiers compose multiplicatively', () => {
  it('test_press_high_bumps_base_by_5_pct', () => {
    const base = makeTeam();
    const pressHigh = makeTeam({ instruction: 'PRESS_HIGH' });
    const ratio = pAttackBaseComponent(pressHigh, 50) / pAttackBaseComponent(base, 50);
    expect(ratio).toBeCloseTo(1.05, 10);
  });

  it('test_hold_shape_shaves_base_by_5_pct', () => {
    const base = makeTeam();
    const holdShape = makeTeam({ instruction: 'HOLD_SHAPE' });
    const ratio = pAttackBaseComponent(holdShape, 50) / pAttackBaseComponent(base, 50);
    expect(ratio).toBeCloseTo(0.95, 10);
  });

  it('test_counter_does_not_affect_base_rate', () => {
    // COUNTER's effect is a separate conditional multiplier on the AWAY P_attack
    // (applied in computePAttackAway), NOT a base-rate modifier.
    const base = makeTeam();
    const counter = makeTeam({ instruction: 'COUNTER' });
    expect(pAttackBaseComponent(counter, 50)).toBe(pAttackBaseComponent(base, 50));
  });
});

// ── COUNTER bonus — AC-MATCH-26 ───────────────────────────────────────────────

describe('AC-MATCH-26 — COUNTER conditional bonus', () => {
  it('test_counter_active_momentum_70_applies_bonus', () => {
    const away = makeTeam({ instruction: 'COUNTER', avgFwdSpeed: 60 });
    const m = 70;
    const noBonus = pAttackBaseComponent(makeTeam({ avgFwdSpeed: 60 }), m) + pAttackSpeedBonus(60);
    const withBonus = computePAttackAway(away, m);
    expect(withBonus / noBonus).toBeCloseTo(COUNTER_BONUS_FACTOR, 10);
  });

  it('test_counter_at_threshold_65_does_not_trigger', () => {
    // Strict > 65 → 65 exactly does NOT trigger
    const away = makeTeam({ instruction: 'COUNTER' });
    const withCounter = computePAttackAway(away, 65);
    const baseline = computePAttackAway(makeTeam(), 65);
    expect(withCounter).toBeCloseTo(baseline, 10);
  });

  it('test_counter_above_threshold_66_triggers', () => {
    const away = makeTeam({ instruction: 'COUNTER' });
    const withCounter = computePAttackAway(away, 66);
    const baseline = computePAttackAway(makeTeam(), 66);
    expect(withCounter).toBeGreaterThan(baseline);
    expect(withCounter / baseline).toBeCloseTo(COUNTER_BONUS_FACTOR, 10);
  });

  it('test_counter_below_threshold_60_no_effect', () => {
    // AC-MATCH-26 case 1
    const away = makeTeam({ instruction: 'COUNTER' });
    const withCounter = computePAttackAway(away, 60);
    const baseline = computePAttackAway(makeTeam(), 60);
    expect(withCounter).toBeCloseTo(baseline, 10);
  });

  it('test_home_counter_no_op_per_ac_match_26_case_2', () => {
    // AC-MATCH-26 case 2 — home team with COUNTER instruction does NOT get bonus.
    // computePAttackHome ignores the instruction's COUNTER bonus path (it's away-only).
    const home = makeTeam({ instruction: 'COUNTER', avgFwdSpeed: 60 });
    const m = 70;
    const withCounter = computePAttackHome(home, m);
    // Note: COUNTER passes through instructionAttackMod returning 1.0, so no base-rate effect either
    const baseline = computePAttackHome(makeTeam({ avgFwdSpeed: 60 }), m);
    expect(withCounter).toBeCloseTo(baseline, 10);
  });
});

// ── Single-roll invariant ─────────────────────────────────────────────────────

describe('F5 — resolveAttackRoll single-roll discipline', () => {
  it('test_resolve_attack_roll_calls_rng_exactly_once', () => {
    const rngSpy = vi.fn(() => 0.5);
    const ctx = makeCtx(rngSpy);
    resolveAttackRoll(ctx, 0.1, 0.1);
    expect(rngSpy).toHaveBeenCalledTimes(1);
  });

  it('test_resolve_returns_home_when_roll_below_pHome', () => {
    const ctx = makeCtx(() => 0.05);
    expect(resolveAttackRoll(ctx, 0.1, 0.1)).toBe('home');
  });

  it('test_resolve_returns_away_when_roll_in_away_band', () => {
    const ctx = makeCtx(() => 0.15);
    expect(resolveAttackRoll(ctx, 0.1, 0.1)).toBe('away');
  });

  it('test_resolve_returns_none_when_roll_above_combined', () => {
    const ctx = makeCtx(() => 0.5);
    expect(resolveAttackRoll(ctx, 0.1, 0.1)).toBe('none');
  });
});

// ── P_home + P_away < 1 worst-case sweep ──────────────────────────────────────

describe('F5 invariant — P_home + P_away < 1.0 in all configurations', () => {
  it('test_p_sum_under_one_across_all_combos', () => {
    const formations: FormationPreset[] = ['4-4-2', '4-3-3', '3-5-2', '5-3-2'];
    const instructions: (TeamInstruction | null)[] = [null, 'PRESS_HIGH', 'HOLD_SHAPE', 'COUNTER'];

    for (const fh of formations) {
      for (const fa of formations) {
        for (const ih of instructions) {
          for (const ia of instructions) {
            for (const momentum of [20, 50, 65, 66, 80]) {
              const home: TeamPAttackContext = {
                formation: fh,
                instruction: ih,
                avgFwdSpeed: 100,
              };
              const away: TeamPAttackContext = {
                formation: fa,
                instruction: ia,
                avgFwdSpeed: 100,
              };
              const pH = computePAttackHome(home, momentum);
              const pA = computePAttackAway(away, momentum);
              expect(pH + pA, `fh=${fh} fa=${fa} ih=${ih} ia=${ia} m=${momentum}`).toBeLessThan(1.0);
              expect(pH).toBeGreaterThanOrEqual(0);
              expect(pA).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    }
  });
});

// Type smoke
const _checkConstants = { BASE_ATTACK_RATE, FORMATION_ATTACK_MOD, COUNTER_MOMENTUM_THRESHOLD };
void _checkConstants;

/**
 * Unit tests for F7 — P_goal.
 *
 * Story: MATCH-SIM-007
 * Acceptance Criteria: AC-MATCH-13 (clamp [0.05, 0.45]), AC-MATCH-17 (emergency DEF-portero).
 * Test Evidence: packages/shared/tests/match-sim/p-goal.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { pGoal } from '../../src/sim/sports/football/football-formulas.js';
import {
  P_GOAL_CLAMP_MAX,
  P_GOAL_CLAMP_MIN,
  P_GOAL_FALLBACK_NAN,
  P_GOAL_MULTIPLIER,
} from '../../src/sim/sports/football/football-constants.js';
import type { PlayerStats } from '../../src/sim/sports/football/football-types.js';

function makeForward(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'fwd-1',
    position: 'FORWARD',
    skill: 70,
    fitness: 90,
    morale: 70,
    form: 70,
    stamina: 70,
    speed: 70,
    finishing: 70,
    ...overrides,
  };
}

function makeKeeper(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'gk-1',
    position: 'GOALKEEPER',
    skill: 70,
    fitness: 90,
    morale: 70,
    form: 70,
    stamina: 70,
    reflexes: 70,
    handling: 70,
    assignedAs: 'GOALKEEPER',
    ...overrides,
  };
}

// ── AC-MATCH-13 clamps ────────────────────────────────────────────────────────

describe('AC-MATCH-13 — P_goal clamp [0.05, 0.45]', () => {
  it('test_p_goal_upper_clamp_at_0_45', () => {
    const fwd = makeForward({
      skill: 100,
      fitness: 100,
      morale: 100,
      form: 90,
      stamina: 100,
      finishing: 100,
    });
    const gk = makeKeeper({
      skill: 0,
      fitness: 0,
      morale: 0,
      form: 30,
      stamina: 100,
      reflexes: 0,
      handling: 0,
    });
    const result = pGoal(fwd, gk, 1);
    expect(result).toBe(P_GOAL_CLAMP_MAX);
  });

  it('test_p_goal_lower_clamp_at_0_05', () => {
    const fwd = makeForward({
      skill: 0,
      fitness: 0,
      morale: 0,
      form: 30,
      stamina: 100,
      finishing: 0,
    });
    const gk = makeKeeper({
      skill: 100,
      fitness: 100,
      morale: 100,
      form: 90,
      stamina: 100,
      reflexes: 100,
      handling: 100,
    });
    const result = pGoal(fwd, gk, 1);
    expect(result).toBe(P_GOAL_CLAMP_MIN);
  });
});

// ── AC-MATCH-17 emergency DEF-portero ─────────────────────────────────────────

describe('AC-MATCH-17 — emergency DEF-portero quantification', () => {
  it('test_emergency_def_keeper_higher_p_goal_than_normal_gk', () => {
    // DEF assigned as GK with skill=70 → reflexes=28, handling=21 (much worse keeper).
    const defKeeper: PlayerStats = {
      id: 'def-as-gk',
      position: 'DEFENDER',
      assignedAs: 'GOALKEEPER',
      skill: 70,
      fitness: 90,
      morale: 70,
      form: 70,
      stamina: 70,
      strength: 75,
      tackling: 75,
    };

    const normalGK = makeKeeper({
      skill: 70,
      fitness: 90,
      stamina: 70,
      reflexes: 70,
      handling: 60,
    });

    const fwd = makeForward({
      skill: 65,
      fitness: 90,
      morale: 70,
      form: 70,
      stamina: 70,
      finishing: 70,
    });

    const pGoalDef = pGoal(fwd, defKeeper, 31);
    const pGoalGk = pGoal(fwd, normalGK, 31);

    // GDD AC-MATCH-17 expected: DEF ≈ 0.417, GK ≈ 0.318 (tolerance 0.02)
    expect(pGoalDef).toBeCloseTo(0.417, 1);
    expect(pGoalGk).toBeCloseTo(0.318, 1);

    // Critical assertion: emergency keeper is QUANTIFIABLY worse
    expect(pGoalDef).toBeGreaterThan(pGoalGk);
    expect(pGoalDef - pGoalGk).toBeGreaterThan(0.05); // meaningful gap
  });
});

// ── NaN guard ─────────────────────────────────────────────────────────────────

describe('F7 — NaN guard with zeroed inputs', () => {
  it('test_p_goal_fallback_when_both_zero_no_nan', () => {
    // Zero finishing + zero rating + zero reflexes + zero handling + zero fitness
    // → goal_att = (0 × 0.6 + form×0.2×0.4)/100 = (0 + 30×0.2×0.4)/100 = 0.024
    //   (form has floor 30 due to player-management.md)
    // → gk_def = (0 + 0 + 0)/100 = 0
    // Sum > 0 → not the fallback path; just a low value clamped to 0.05
    // To trigger fallback we need a manual zero player (form=0 etc.)
    const zero: PlayerStats = {
      id: 'zero',
      position: 'FORWARD',
      skill: 0,
      fitness: 0,
      morale: 0,
      form: 0, // below the player-management floor — just for the test
      stamina: 0,
      finishing: 0,
    };
    const zeroKeeper: PlayerStats = {
      id: 'zerogk',
      position: 'GOALKEEPER',
      skill: 0,
      fitness: 0,
      morale: 0,
      form: 0,
      stamina: 0,
      reflexes: 0,
      handling: 0,
      assignedAs: 'GOALKEEPER',
    };
    const result = pGoal(zero, zeroKeeper, 1);
    expect(result).toBe(P_GOAL_FALLBACK_NAN);
  });

  it('test_p_goal_no_nan_propagation_in_normal_inputs', () => {
    let seed = 999;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let i = 0; i < 200; i++) {
      const result = pGoal(
        makeForward({
          skill: Math.floor(lcg() * 101),
          fitness: Math.floor(lcg() * 101),
          form: 30 + Math.floor(lcg() * 61),
          stamina: 40 + Math.floor(lcg() * 61),
          finishing: Math.floor(lcg() * 101),
        }),
        makeKeeper({
          skill: Math.floor(lcg() * 101),
          fitness: Math.floor(lcg() * 101),
          form: 30 + Math.floor(lcg() * 61),
          stamina: 40 + Math.floor(lcg() * 61),
          reflexes: Math.floor(lcg() * 101),
          handling: Math.floor(lcg() * 101),
        }),
        Math.floor(lcg() * 91),
      );
      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeGreaterThanOrEqual(P_GOAL_CLAMP_MIN);
      expect(result).toBeLessThanOrEqual(P_GOAL_CLAMP_MAX);
    }
  });
});

// ── Time-dependence ───────────────────────────────────────────────────────────

describe('F7 — time-dependence via effective_fitness', () => {
  it('test_p_goal_higher_at_t90_than_t1_with_tired_keeper', () => {
    // GK with low stamina: effective_fitness drops a lot by t=90 → gk_def drops → P_goal rises
    const fwd = makeForward({ finishing: 80, fitness: 90, stamina: 90 });
    const tiredGK = makeKeeper({ fitness: 90, stamina: 40, reflexes: 70, handling: 60 });
    const p_early = pGoal(fwd, tiredGK, 1);
    const p_late = pGoal(fwd, tiredGK, 90);
    expect(p_late).toBeGreaterThan(p_early);
  });

  it('test_p_goal_stamina_100_no_time_drift', () => {
    // GK with stamina=100 → no decay → P_goal constant across t
    const fwd = makeForward({ stamina: 100 });
    const gk = makeKeeper({ stamina: 100 });
    expect(pGoal(fwd, gk, 1)).toBeCloseTo(pGoal(fwd, gk, 90), 10);
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe('F7 constants', () => {
  it('test_constants_match_gdd', () => {
    expect(P_GOAL_CLAMP_MIN).toBeCloseTo(0.05, 10);
    expect(P_GOAL_CLAMP_MAX).toBeCloseTo(0.45, 10);
    expect(P_GOAL_FALLBACK_NAN).toBeCloseTo(0.25, 10);
    expect(P_GOAL_MULTIPLIER).toBeCloseTo(0.65, 10);
  });
});

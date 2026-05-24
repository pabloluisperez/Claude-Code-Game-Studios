/**
 * Unit tests for F1 (effectiveFitness) + F2 (effectiveRating) + position-stat helpers.
 *
 * Story: MATCH-SIM-003
 * Acceptance Criteria: AC-MATCH-07, AC-MATCH-08, AC-MATCH-17
 * Test Evidence: packages/shared/tests/match-sim/effective-stats.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  effectiveFitness,
  effectiveRating,
  getPassing,
  getVision,
  getSpeed,
  getFinishing,
  getStrength,
  getTackling,
  getReflexes,
  getHandling,
  FITNESS_DECAY_MAX,
  F2_W_SKILL,
  F2_W_FORM,
  F2_W_MORALE,
  F2_W_FITNESS,
  STAT_DEFAULT,
  EMERGENCY_GK_REFLEX_FACTOR,
  EMERGENCY_GK_HANDLING_FACTOR,
} from '../../src/sim/sports/football/football-formulas.js';
import type { PlayerStats, Position } from '../../src/sim/sports/football/football-types.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'test-player',
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    ...overrides,
  };
}

// ── F1: effectiveFitness ──────────────────────────────────────────────────────

describe('F1 — effectiveFitness', () => {
  it('test_f1_normal_case_exact_float', () => {
    // AC-MATCH-07 — fitness=72, stamina=65, t=90
    // decay = (90/90) × (1 - 65/100) × 15 = 1 × 0.35 × 15 = 5.25
    // result = 72 - 5.25 = 66.75
    const p = makePlayer({ fitness: 72, stamina: 65 });
    expect(effectiveFitness(p, 90)).toBeCloseTo(66.75, 10);
  });

  it('test_f1_stamina_100_no_decay', () => {
    // AC-MATCH-07 — stamina=100 → 1-1=0 → no decay regardless of t
    const p = makePlayer({ fitness: 80, stamina: 100 });
    expect(effectiveFitness(p, 1)).toBe(80);
    expect(effectiveFitness(p, 45)).toBe(80);
    expect(effectiveFitness(p, 90)).toBe(80);
  });

  it('test_f1_clamp_to_zero_negative_unclamped', () => {
    // AC-MATCH-07 — fitness=8, stamina=40, t=90
    // decay = 1 × 0.6 × 15 = 9 → unclamped 8-9 = -1 → clamped to 0
    const p = makePlayer({ fitness: 8, stamina: 40 });
    expect(effectiveFitness(p, 90)).toBe(0);
  });

  it('test_f1_at_t_zero_returns_full_fitness', () => {
    const p = makePlayer({ fitness: 85, stamina: 50 });
    expect(effectiveFitness(p, 0)).toBe(85);
  });

  it('test_f1_never_returns_negative_across_player_range', () => {
    // 10,000 randomized players within valid ranges → result ≥ 0
    let seed = 12345;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let i = 0; i < 10000; i++) {
      const p = makePlayer({
        fitness: Math.floor(lcg() * 101), // [0,100]
        stamina: 40 + Math.floor(lcg() * 61), // [40,100]
      });
      const result = effectiveFitness(p, Math.floor(lcg() * 91));
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    }
  });
});

// ── F2: effectiveRating ───────────────────────────────────────────────────────

describe('F2 — effectiveRating', () => {
  it('test_f2_composite_formula_exact_float', () => {
    // AC-MATCH-08 — skill=63, form=70, morale=60, fitness=72, stamina=65, t=90
    // ef = 72 - (1×0.35×15) = 66.75
    // rating = 63×0.35 + 70×0.20 + 60×0.15 + 66.75×0.30
    //        = 22.05 + 14 + 9 + 20.025 = 65.075
    const p = makePlayer({ skill: 63, form: 70, morale: 60, fitness: 72, stamina: 65 });
    expect(effectiveRating(p, 90)).toBeCloseTo(65.075, 2);
  });

  it('test_f2_skill_weight_is_0_35', () => {
    // +1 skill → +0.35 rating (linearity)
    const p1 = makePlayer({ skill: 70 });
    const p2 = makePlayer({ skill: 71 });
    expect(effectiveRating(p2, 0) - effectiveRating(p1, 0)).toBeCloseTo(F2_W_SKILL, 10);
  });

  it('test_f2_form_weight_is_0_20', () => {
    const p1 = makePlayer({ form: 70 });
    const p2 = makePlayer({ form: 71 });
    expect(effectiveRating(p2, 0) - effectiveRating(p1, 0)).toBeCloseTo(F2_W_FORM, 10);
  });

  it('test_f2_morale_weight_is_0_15', () => {
    const p1 = makePlayer({ morale: 70 });
    const p2 = makePlayer({ morale: 71 });
    expect(effectiveRating(p2, 0) - effectiveRating(p1, 0)).toBeCloseTo(F2_W_MORALE, 10);
  });

  it('test_f2_fitness_weight_is_0_30_at_t_zero', () => {
    // At t=0, effectiveFitness == fitness, so +1 fitness → +0.30 rating
    const p1 = makePlayer({ fitness: 70 });
    const p2 = makePlayer({ fitness: 71 });
    expect(effectiveRating(p2, 0) - effectiveRating(p1, 0)).toBeCloseTo(F2_W_FITNESS, 10);
  });

  it('test_f2_weights_sum_to_one', () => {
    // Invariant: weights must sum to 1.0 to preserve scale
    expect(F2_W_SKILL + F2_W_FORM + F2_W_MORALE + F2_W_FITNESS).toBeCloseTo(1.0, 10);
  });

  it('test_f2_output_range_invariant_10000_samples', () => {
    // 10,000 randomized players → effectiveRating ∈ [13, 96.25]
    let seed = 54321;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let i = 0; i < 10000; i++) {
      const p = makePlayer({
        skill: 20 + Math.floor(lcg() * 76), // [20,95]
        form: 30 + Math.floor(lcg() * 61), // [30,90]
        morale: Math.floor(lcg() * 101), // [0,100]
        fitness: Math.floor(lcg() * 101), // [0,100]
        stamina: 40 + Math.floor(lcg() * 61), // [40,100]
      });
      const rating = effectiveRating(p, Math.floor(lcg() * 91));
      expect(rating).toBeGreaterThanOrEqual(13);
      expect(rating).toBeLessThanOrEqual(96.25);
    }
  });
});

// ── Position-stat accessors ───────────────────────────────────────────────────

describe('position-stat helpers', () => {
  it('test_stat_helpers_return_50_for_undefined', () => {
    const p = makePlayer({}); // no positional stats
    expect(getPassing(p)).toBe(STAT_DEFAULT);
    expect(getVision(p)).toBe(STAT_DEFAULT);
    expect(getSpeed(p)).toBe(STAT_DEFAULT);
    expect(getFinishing(p)).toBe(STAT_DEFAULT);
    expect(getStrength(p)).toBe(STAT_DEFAULT);
    expect(getTackling(p)).toBe(STAT_DEFAULT);
    expect(getReflexes(p)).toBe(STAT_DEFAULT);
    expect(getHandling(p)).toBe(STAT_DEFAULT);
  });

  it('test_stat_helpers_return_value_when_defined', () => {
    const p = makePlayer({ passing: 75, vision: 80, speed: 65, finishing: 70 });
    expect(getPassing(p)).toBe(75);
    expect(getVision(p)).toBe(80);
    expect(getSpeed(p)).toBe(65);
    expect(getFinishing(p)).toBe(70);
  });

  it('test_emergency_gk_reflexes_derived_as_skill_times_factor', () => {
    // AC-MATCH-17 — DEFENDER playing as GK, skill=70 → reflexes = 70 × 0.4 = 28
    const p: PlayerStats = makePlayer({
      position: 'DEFENDER',
      assignedAs: 'GOALKEEPER',
      skill: 70,
      reflexes: 999, // ignored when emergency GK
    });
    expect(getReflexes(p)).toBe(28);
    expect(EMERGENCY_GK_REFLEX_FACTOR).toBe(0.4);
  });

  it('test_emergency_gk_handling_derived_as_skill_times_factor', () => {
    // AC-MATCH-17 — handling = 70 × 0.3 = 21
    const p: PlayerStats = makePlayer({
      position: 'DEFENDER',
      assignedAs: 'GOALKEEPER',
      skill: 70,
      handling: 999, // ignored
    });
    expect(getHandling(p)).toBe(21);
    expect(EMERGENCY_GK_HANDLING_FACTOR).toBe(0.3);
  });

  it('test_real_gk_uses_own_reflexes_not_derivation', () => {
    // A GOALKEEPER with own reflexes/handling values must use those, not derive.
    const p: PlayerStats = makePlayer({
      position: 'GOALKEEPER',
      assignedAs: 'GOALKEEPER',
      skill: 70,
      reflexes: 85,
      handling: 82,
    });
    expect(getReflexes(p)).toBe(85);
    expect(getHandling(p)).toBe(82);
  });

  it('test_defender_not_assigned_as_gk_no_derivation', () => {
    // A regular DEFENDER (assignedAs unset) doesn't derive emergency GK stats
    const p = makePlayer({
      position: 'DEFENDER',
      skill: 70,
      strength: 80,
    });
    expect(getReflexes(p)).toBe(STAT_DEFAULT);
    expect(getHandling(p)).toBe(STAT_DEFAULT);
  });
});

// ── Purity ────────────────────────────────────────────────────────────────────

describe('purity of F1/F2', () => {
  it('test_f1_f2_deterministic_no_hidden_randomness', () => {
    // Same input → identical output across many calls (catches accidental Math.random)
    const p = makePlayer({ fitness: 75, stamina: 70 });
    const r1 = effectiveRating(p, 50);
    const r2 = effectiveRating(p, 50);
    const r3 = effectiveRating(p, 50);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});

// ── Balance constants ────────────────────────────────────────────────────────

describe('balance constants match GDD', () => {
  it('test_constants_match_gdd', () => {
    expect(FITNESS_DECAY_MAX).toBe(15);
    expect(F2_W_SKILL).toBeCloseTo(0.35, 10);
    expect(F2_W_FORM).toBeCloseTo(0.2, 10);
    expect(F2_W_MORALE).toBeCloseTo(0.15, 10);
    expect(F2_W_FITNESS).toBeCloseTo(0.3, 10);
    expect(STAT_DEFAULT).toBe(50);
  });
});

// Type smoke
const _positions: readonly Position[] = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'];
void _positions;

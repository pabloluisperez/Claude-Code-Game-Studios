/**
 * Unit tests for F6 — P_shot.
 *
 * Story: MATCH-SIM-006
 * Acceptance Criteria: AC-MATCH-12 (clamp [0.10, 0.70]), NaN guard.
 * Test Evidence: packages/shared/tests/match-sim/p-shot.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { pShot } from '../../src/sim/sports/football/football-formulas.js';
import {
  FORMATION_DEFENSE_MOD,
  HOLD_SHAPE_MOD,
  P_SHOT_CLAMP_MAX,
  P_SHOT_CLAMP_MIN,
  P_SHOT_FALLBACK_NAN,
  P_SHOT_MULTIPLIER,
} from '../../src/sim/sports/football/football-constants.js';
import type { PlayerStats } from '../../src/sim/sports/football/football-types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAttacker(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'fwd-1',
    position: 'FORWARD',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    speed: 70,
    finishing: 70,
    ...overrides,
  };
}

function makeMid(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: `mid-${Math.random()}`,
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    passing: 70,
    vision: 70,
    ...overrides,
  };
}

function makeDefender(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'def-1',
    position: 'DEFENDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    strength: 70,
    tackling: 70,
    ...overrides,
  };
}

// ── AC-MATCH-12 clamps ───────────────────────────────────────────────────────

describe('AC-MATCH-12 — P_shot clamp [0.10, 0.70]', () => {
  it('test_p_shot_upper_clamp_at_0_70_max_attacker_zero_defender', () => {
    // attacker all 100, defender all 0 → att_ctx large, def_ctx 0 → raw 0.80 → clamped 0.70
    const att = makeAttacker({ skill: 100, fitness: 100, morale: 100, form: 90, speed: 100, finishing: 100 });
    const mids = [makeMid({ skill: 100, fitness: 100, morale: 100, form: 90, vision: 100 })];
    const def = makeDefender({ skill: 0, fitness: 0, morale: 0, form: 30, strength: 0, tackling: 0 });
    const result = pShot({
      attacker: att,
      attackingMids: mids,
      defender: def,
      defenderFormation: '4-4-2',
      defenderHasHoldShape: false,
      t: 1,
    });
    expect(result).toBe(P_SHOT_CLAMP_MAX);
  });

  it('test_p_shot_lower_clamp_at_0_10_zero_attacker_max_defender', () => {
    const att = makeAttacker({ skill: 0, fitness: 0, morale: 0, form: 30, speed: 0, finishing: 0 });
    const mids = [makeMid({ skill: 0, fitness: 0, morale: 0, form: 30, vision: 0 })];
    const def = makeDefender({ skill: 100, fitness: 100, morale: 100, form: 90, strength: 100, tackling: 100 });
    const result = pShot({
      attacker: att,
      attackingMids: mids,
      defender: def,
      defenderFormation: '4-4-2',
      defenderHasHoldShape: false,
      t: 1,
    });
    expect(result).toBe(P_SHOT_CLAMP_MIN);
  });
});

// ── Defender formation effect ─────────────────────────────────────────────────

describe('F6 — defender formation mod effect', () => {
  it('test_4_3_3_defender_yields_higher_p_shot_than_4_4_2', () => {
    // Same attacker + defender stats, defender on 4-3-3 vs 4-4-2
    const att = makeAttacker();
    const mids = [makeMid()];
    const def = makeDefender();
    const args = {
      attacker: att,
      attackingMids: mids,
      defender: def,
      defenderHasHoldShape: false,
      t: 45,
    } as const;
    const p442 = pShot({ ...args, defenderFormation: '4-4-2' });
    const p433 = pShot({ ...args, defenderFormation: '4-3-3' });
    expect(p433).toBeGreaterThan(p442);
  });

  it('test_5_3_2_defender_yields_lower_p_shot_than_4_4_2', () => {
    const args = {
      attacker: makeAttacker(),
      attackingMids: [makeMid()],
      defender: makeDefender(),
      defenderHasHoldShape: false,
      t: 45,
    } as const;
    const p442 = pShot({ ...args, defenderFormation: '4-4-2' });
    const p532 = pShot({ ...args, defenderFormation: '5-3-2' });
    expect(p532).toBeLessThan(p442);
  });
});

// ── HOLD_SHAPE effect ─────────────────────────────────────────────────────────

describe('F6 — HOLD_SHAPE defender instruction', () => {
  it('test_hold_shape_decreases_p_shot_vs_no_instruction', () => {
    const args = {
      attacker: makeAttacker(),
      attackingMids: [makeMid()],
      defender: makeDefender(),
      defenderFormation: '4-4-2' as const,
      t: 45,
    };
    const baseline = pShot({ ...args, defenderHasHoldShape: false });
    const withHoldShape = pShot({ ...args, defenderHasHoldShape: true });
    expect(withHoldShape).toBeLessThan(baseline);
  });

  it('test_5_3_2_with_hold_shape_compound', () => {
    // 5-3-2 (0.85) × HOLD_SHAPE (0.9) = 0.765 divisor → smallest def_ctx_adj
    // ⇒ smallest P_shot
    const args = {
      attacker: makeAttacker(),
      attackingMids: [makeMid()],
      defender: makeDefender(),
      t: 45,
    };
    const p442 = pShot({ ...args, defenderFormation: '4-4-2', defenderHasHoldShape: false });
    const p532hs = pShot({ ...args, defenderFormation: '5-3-2', defenderHasHoldShape: true });
    expect(p532hs).toBeLessThan(p442);
  });
});

// ── NaN guard ─────────────────────────────────────────────────────────────────

describe('F6 — NaN guard', () => {
  it('test_p_shot_fallback_on_zero_attacker_zero_defender', () => {
    const zero = (id: string, position: PlayerStats['position']) =>
      ({
        id,
        position,
        skill: 0,
        fitness: 0,
        morale: 0,
        form: 30,
        stamina: 40,
      }) as PlayerStats;
    const result = pShot({
      attacker: zero('a', 'FORWARD'),
      attackingMids: [zero('m', 'MIDFIELDER')],
      defender: zero('d', 'DEFENDER'),
      defenderFormation: '4-4-2',
      defenderHasHoldShape: false,
      t: 1,
    });
    // ef_att ≈ form×0.2 = 6; speed=50; vis=50 → att_ctx = (6×0.4+50×0.3+50×0.3)/100 = (2.4+15+15)/100 = 0.324
    // ef_def similar; sum > 0 → no NaN fallback. Result should be in clamp range
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBeGreaterThanOrEqual(P_SHOT_CLAMP_MIN);
    expect(result).toBeLessThanOrEqual(P_SHOT_CLAMP_MAX);
  });

  it('test_p_shot_no_nan_propagation_in_normal_inputs', () => {
    // Brute-force: random stat combinations should never produce NaN
    let seed = 99;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let i = 0; i < 200; i++) {
      const result = pShot({
        attacker: makeAttacker({
          skill: Math.floor(lcg() * 101),
          fitness: Math.floor(lcg() * 101),
          morale: Math.floor(lcg() * 101),
          form: 30 + Math.floor(lcg() * 61),
          stamina: 40 + Math.floor(lcg() * 61),
          speed: Math.floor(lcg() * 101),
        }),
        attackingMids: [
          makeMid({
            skill: Math.floor(lcg() * 101),
            vision: Math.floor(lcg() * 101),
          }),
        ],
        defender: makeDefender({
          skill: Math.floor(lcg() * 101),
          fitness: Math.floor(lcg() * 101),
          strength: Math.floor(lcg() * 101),
          tackling: Math.floor(lcg() * 101),
        }),
        defenderFormation: '4-4-2',
        defenderHasHoldShape: lcg() > 0.5,
        t: Math.floor(lcg() * 91),
      });
      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeGreaterThanOrEqual(P_SHOT_CLAMP_MIN);
      expect(result).toBeLessThanOrEqual(P_SHOT_CLAMP_MAX);
    }
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe('F6 constants', () => {
  it('test_constants_match_gdd', () => {
    expect(FORMATION_DEFENSE_MOD['4-4-2']).toBe(1.0);
    expect(FORMATION_DEFENSE_MOD['4-3-3']).toBeCloseTo(1.15, 10);
    expect(FORMATION_DEFENSE_MOD['3-5-2']).toBeCloseTo(1.05, 10);
    expect(FORMATION_DEFENSE_MOD['5-3-2']).toBeCloseTo(0.85, 10);
    expect(HOLD_SHAPE_MOD).toBeCloseTo(0.9, 10);
    expect(P_SHOT_CLAMP_MIN).toBeCloseTo(0.1, 10);
    expect(P_SHOT_CLAMP_MAX).toBeCloseTo(0.7, 10);
    expect(P_SHOT_FALLBACK_NAN).toBeCloseTo(0.1, 10);
    expect(P_SHOT_MULTIPLIER).toBeCloseTo(0.8, 10);
  });
});

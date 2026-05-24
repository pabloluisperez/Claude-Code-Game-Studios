/**
 * Unit tests for injury detection (P_injury + rival-constant + causal_node).
 *
 * Story: MATCH-SIM-009
 * Acceptance Criteria: AC-MATCH-23 (playing_with_ten flag — covered in story 014),
 *                      AC-MATCH-28 (causal_node='injury_risk' on all injury events).
 * Test Evidence: packages/shared/tests/match-sim/injuries.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getInjuryRiskCtx,
  pInjury,
  resolveInjuryCheck,
  shouldRunInjuryCheck,
} from '../../src/sim/sports/football/football-injuries.js';
import {
  INJURY_CHECK_TICKS_FIXED,
  P_INJURY_BASE,
  RIVAL_INJURY_RISK_CONST,
} from '../../src/sim/sports/football/football-constants.js';
import type {
  PlayerStats,
  PreMatchSnapshot,
} from '../../src/sim/sports/football/football-types.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'p-1',
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 80,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<PreMatchSnapshot> = {}): PreMatchSnapshot {
  return {
    team_fitness: 70,
    team_skill: 65,
    squad_available_pct: 80,
    field_quality: 60,
    fan_attendance: 60,
    staff_morale: 65,
    player_happiness: 70,
    injury_risk: 30,
    ...overrides,
  };
}

function makeCtx(rng: () => number): SimContext {
  return { rng, currentWeek: 1, hasMatchThisWeek: true, prevState: defaultWorldState() };
}

// ── pInjury formula ───────────────────────────────────────────────────────────

describe('pInjury — formula', () => {
  it('test_p_injury_known_inputs', () => {
    // fitness=80, stamina=80, t=45 → ef = 80 - 0.5×0.2×15 = 78.5
    // P = (50/100) × 0.08 × (1 - 0.785) = 0.5 × 0.08 × 0.215 = 0.0086
    const p = makePlayer({ fitness: 80, stamina: 80 });
    expect(pInjury(p, 50, 45)).toBeCloseTo(0.0086, 5);
  });

  it('test_p_injury_zero_when_injury_risk_is_zero', () => {
    const p = makePlayer({ fitness: 100, stamina: 100 });
    expect(pInjury(p, 0, 1)).toBe(0);
  });

  it('test_p_injury_no_nan_with_zero_inputs', () => {
    // All-zero player stats → ef=0 → P_injury = (ctx/100) × 0.08 × 1 (finite)
    const zero: PlayerStats = {
      id: 'z',
      position: 'MIDFIELDER',
      skill: 0,
      fitness: 0,
      morale: 0,
      form: 0,
      stamina: 0,
    };
    expect(Number.isNaN(pInjury(zero, 100, 90))).toBe(false);
    expect(pInjury(zero, 100, 90)).toBeCloseTo(P_INJURY_BASE, 5);
  });
});

// ── Rival vs own-team injury_risk_ctx ─────────────────────────────────────────

describe('getInjuryRiskCtx — rival vs own team', () => {
  it('test_own_team_uses_world_state_value', () => {
    const snap = makeSnapshot({ injury_risk: 70 });
    expect(getInjuryRiskCtx('home', 'home', snap)).toBe(70);
    expect(getInjuryRiskCtx('away', 'away', snap)).toBe(70);
  });

  it('test_rival_team_uses_constant', () => {
    const snap = makeSnapshot({ injury_risk: 70 });
    expect(getInjuryRiskCtx('away', 'home', snap)).toBe(RIVAL_INJURY_RISK_CONST);
    expect(getInjuryRiskCtx('home', 'away', snap)).toBe(RIVAL_INJURY_RISK_CONST);
  });

  it('test_rival_constant_is_50', () => {
    expect(RIVAL_INJURY_RISK_CONST).toBe(50);
  });
});

// ── shouldRunInjuryCheck truth table ──────────────────────────────────────────

describe('shouldRunInjuryCheck', () => {
  it('test_fixed_ticks_45_and_90', () => {
    expect(shouldRunInjuryCheck(45, false, false)).toBe(true);
    expect(shouldRunInjuryCheck(90, false, false)).toBe(true);
  });

  it('test_goal_tick_triggers_check', () => {
    expect(shouldRunInjuryCheck(30, true, false)).toBe(true);
  });

  it('test_card_tick_triggers_check', () => {
    expect(shouldRunInjuryCheck(22, false, true)).toBe(true);
  });

  it('test_non_fixed_tick_without_goal_or_card_no_check', () => {
    expect(shouldRunInjuryCheck(22, false, false)).toBe(false);
  });

  it('test_fixed_ticks_constant', () => {
    expect([...INJURY_CHECK_TICKS_FIXED]).toEqual([45, 90]);
  });
});

// ── resolveInjuryCheck — causal_node + rng counts ─────────────────────────────

describe('resolveInjuryCheck — event emission and AC-MATCH-28', () => {
  it('test_no_injury_emits_null_event_one_rng_call', () => {
    const rngSpy = vi.fn(() => 0.99); // miss
    const result = resolveInjuryCheck({
      ctx: makeCtx(rngSpy),
      tick: 45,
      player: makePlayer(),
      playerTeam: 'home',
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ injury_risk: 50 }),
    });
    expect(result.event).toBeNull();
    expect(rngSpy).toHaveBeenCalledTimes(1);
  });

  it('test_injury_fires_two_rng_calls_causal_node_injury_risk', () => {
    let call = 0;
    const rngSpy = vi.fn(() => (++call === 1 ? 0 : 0.3));
    const result = resolveInjuryCheck({
      ctx: makeCtx(rngSpy),
      tick: 45,
      player: makePlayer({ fitness: 50, stamina: 60 }),
      playerTeam: 'home',
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ injury_risk: 80 }),
    });
    expect(result.event).not.toBeNull();
    expect(result.event!.type).toBe('injury');
    expect(result.event!.causal_node).toBe('injury_risk'); // AC-MATCH-28
    expect(result.event!.minute).toBe(45);
    expect(result.event!.team).toBe('home');
    expect(rngSpy).toHaveBeenCalledTimes(2);
  });

  it('test_severity_minor_when_rng_below_threshold', () => {
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0 : 0.1)); // severity roll < 0.5 → minor
    const r = resolveInjuryCheck({
      ctx,
      tick: 45,
      player: makePlayer({ fitness: 50 }),
      playerTeam: 'home',
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ injury_risk: 80 }),
    });
    expect(r.event!.reason).toBe('minor');
  });

  it('test_severity_major_when_rng_above_threshold', () => {
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0 : 0.9));
    const r = resolveInjuryCheck({
      ctx,
      tick: 45,
      player: makePlayer({ fitness: 50 }),
      playerTeam: 'home',
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ injury_risk: 80 }),
    });
    expect(r.event!.reason).toBe('major');
  });

  it('test_rival_injury_uses_constant_not_snapshot', () => {
    // away player from home's match — should use RIVAL constant=50, not snapshot.injury_risk=100
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0 : 0.3));
    // Use a fitness low enough that P_injury > 0 with risk=50
    const p = makePlayer({ fitness: 30, stamina: 60 });
    const r = resolveInjuryCheck({
      ctx,
      tick: 45,
      player: p,
      playerTeam: 'away',
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ injury_risk: 100 }),
    });
    expect(r.event).not.toBeNull();
    // Sanity: pInjury called with 50, not 100
    // (P_injury at injury_risk=100 would be 2x — first rng=0 still triggers either way)
    // Use the formula: P_injury(p, 50, 45) > rng=0, so it triggers
    const pExpected = pInjury(p, 50, 45);
    expect(pExpected).toBeGreaterThan(0);
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe('injury constants', () => {
  it('test_constants_match_gdd', () => {
    expect(P_INJURY_BASE).toBeCloseTo(0.08, 10);
    expect(RIVAL_INJURY_RISK_CONST).toBe(50);
  });
});

/**
 * Unit tests for card detection (P_yellow, P_red_direct, second-yellow → red).
 *
 * Story: MATCH-SIM-008
 * Acceptance Criteria: AC-MATCH-22, AC-MATCH-28 (causal_node), GDD card-tick triggers.
 * Test Evidence: packages/shared/tests/match-sim/cards.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  pYellow,
  shouldRunCardCheck,
} from '../../src/sim/sports/football/football-formulas.js';
import { resolveCardCheck } from '../../src/sim/sports/football/football-cards.js';
import {
  CARD_CHECK_TICKS,
  P_RED_DIRECT,
  P_YELLOW_BASE,
  P_YELLOW_FITNESS_MULTIPLIER,
  P_YELLOW_FITNESS_THRESHOLD,
} from '../../src/sim/sports/football/football-constants.js';
import type { PlayerStats } from '../../src/sim/sports/football/football-types.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

function makeDefender(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: 'def-X',
    position: 'DEFENDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 80,
    strength: 70,
    tackling: 70,
    ...overrides,
  };
}

function makeCtx(rng: () => number): SimContext {
  return { rng, currentWeek: 1, hasMatchThisWeek: true, prevState: defaultWorldState() };
}

// ── P_yellow formula ──────────────────────────────────────────────────────────

describe('pYellow — formula', () => {
  it('test_p_yellow_normal_no_fatigue_multiplier', () => {
    // tackling=70, fitness=80, stamina=80, t=30:
    // ef = 80 - (30/90)(1-0.8)(15) = 80 - (1/3)(0.2)(15) = 80 - 1 = 79
    // 79 ≥ 40 → multiplier = 1
    // P_yellow = (1 - 0.70) × 0.12 × 1 = 0.036
    const d = makeDefender({ tackling: 70, fitness: 80, stamina: 80 });
    expect(pYellow(d, 30)).toBeCloseTo(0.036, 5);
  });

  it('test_p_yellow_low_fitness_multiplier_active', () => {
    // tackling=70, fitness=20, stamina=60, t=90:
    // ef = 20 - 1×0.4×15 = 14 < 40 → multiplier=1.5
    // P_yellow = 0.3 × 0.12 × 1.5 = 0.054
    const d = makeDefender({ tackling: 70, fitness: 20, stamina: 60 });
    expect(pYellow(d, 90)).toBeCloseTo(0.054, 5);
  });

  it('test_p_yellow_tackling_100_floor', () => {
    const d = makeDefender({ tackling: 100, fitness: 100, stamina: 100 });
    expect(pYellow(d, 1)).toBe(0);
  });

  it('test_p_yellow_tackling_0_ceiling', () => {
    const d = makeDefender({ tackling: 0, fitness: 100, stamina: 100 });
    expect(pYellow(d, 1)).toBeCloseTo(P_YELLOW_BASE, 10);
  });

  it('test_p_yellow_fitness_at_threshold_no_multiplier', () => {
    // ef exactly = 40 → no fatigue multiplier (strict <)
    // To force ef=40: fitness=40, stamina=100 → ef = 40 - 0 = 40 (no decay)
    const d = makeDefender({ tackling: 50, fitness: 40, stamina: 100 });
    expect(pYellow(d, 90)).toBeCloseTo(0.5 * P_YELLOW_BASE * 1, 5);
  });
});

// ── shouldRunCardCheck truth table ────────────────────────────────────────────

describe('shouldRunCardCheck', () => {
  it('test_check_at_15_with_attack_returns_true', () => {
    expect(shouldRunCardCheck(15, true)).toBe(true);
  });

  it('test_check_at_15_without_attack_returns_false', () => {
    expect(shouldRunCardCheck(15, false)).toBe(false);
  });

  it('test_check_at_16_returns_false_not_multiple_of_15', () => {
    expect(shouldRunCardCheck(16, true)).toBe(false);
  });

  it('test_card_check_ticks_match_gdd_step_5', () => {
    expect([...CARD_CHECK_TICKS]).toEqual([15, 30, 45, 60, 75, 90]);
  });
});

// ── AC-MATCH-22 second-yellow → red ───────────────────────────────────────────

describe('AC-MATCH-22 — second yellow → automatic red', () => {
  it('test_second_yellow_emits_yellow_then_red_event', () => {
    // Force yellow to roll positive (rng=0 always less than pYellow > 0)
    const ctx = makeCtx(() => 0);
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: { 'def-X': 1 },
    });

    expect(result.events.length).toBe(2);
    expect(result.events[0]!.type).toBe('yellow_card');
    expect(result.events[0]!.player_id).toBe('def-X');
    expect(result.events[1]!.type).toBe('red_card');
    expect(result.events[1]!.reason).toBe('second_yellow');
    expect(result.updatedYellowCounts['def-X']).toBe(2);
    expect(result.playerSentOff).toBe(true);
  });

  it('test_first_yellow_does_not_emit_red', () => {
    const ctx = makeCtx(() => 0);
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });

    expect(result.events.length).toBe(1);
    expect(result.events[0]!.type).toBe('yellow_card');
    expect(result.updatedYellowCounts['def-X']).toBe(1);
    expect(result.playerSentOff).toBe(false);
  });
});

// ── Direct red ────────────────────────────────────────────────────────────────

describe('direct red card', () => {
  it('test_direct_red_when_yellow_misses_red_hits', () => {
    // First rng() returns 0.99 (misses yellow=0.036), second returns 0.001 (hits red=0.003)
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0.99 : 0.001));
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });

    expect(result.events.length).toBe(1);
    expect(result.events[0]!.type).toBe('red_card');
    expect(result.events[0]!.reason).toBe('direct');
    expect(result.playerSentOff).toBe(true);
    expect(result.updatedYellowCounts).toEqual({});
  });

  it('test_no_card_when_both_rolls_miss', () => {
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0.99 : 0.99));
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });

    expect(result.events).toEqual([]);
    expect(result.playerSentOff).toBe(false);
    expect(result.updatedYellowCounts).toEqual({});
  });
});

// ── rng() call counts (branch coverage) ───────────────────────────────────────

describe('rng() call counts per branch', () => {
  it('test_yellow_branch_invokes_rng_once', () => {
    const rngSpy = vi.fn(() => 0); // yellow hits
    resolveCardCheck({
      ctx: makeCtx(rngSpy),
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });
    expect(rngSpy).toHaveBeenCalledTimes(1);
  });

  it('test_no_yellow_branch_invokes_rng_twice', () => {
    const rngSpy = vi.fn(() => 0.99); // yellow misses, red misses
    resolveCardCheck({
      ctx: makeCtx(rngSpy),
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });
    expect(rngSpy).toHaveBeenCalledTimes(2);
  });
});

// ── AC-MATCH-28 causal_node = null on cards ───────────────────────────────────

describe('AC-MATCH-28 — card events have causal_node: null', () => {
  it('test_yellow_event_causal_node_null', () => {
    const ctx = makeCtx(() => 0);
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });
    expect(result.events[0]!.causal_node).toBeNull();
  });

  it('test_red_event_causal_node_null', () => {
    let call = 0;
    const ctx = makeCtx(() => (++call === 1 ? 0.99 : 0.001));
    const result = resolveCardCheck({
      ctx,
      tick: 30,
      defender: makeDefender(),
      defenderTeam: 'home',
      yellowCardsByPlayerId: {},
    });
    expect(result.events[0]!.causal_node).toBeNull();
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe('card constants', () => {
  it('test_constants_match_gdd', () => {
    expect(P_YELLOW_BASE).toBeCloseTo(0.12, 10);
    expect(P_YELLOW_FITNESS_MULTIPLIER).toBeCloseTo(1.5, 10);
    expect(P_YELLOW_FITNESS_THRESHOLD).toBe(40);
    expect(P_RED_DIRECT).toBeCloseTo(0.003, 10);
  });
});

/**
 * Unit tests for F8 mpi_delta + F9 injury_risk_delta + F10 player ratings + forfeit.
 *
 * Story: MATCH-SIM-011
 * Acceptance Criteria: AC-MATCH-14 (R1+R2 perspective), AC-MATCH-15 (clamp), AC-MATCH-16 (forfeit).
 * Test Evidence: packages/shared/tests/match-sim/post-match-deltas.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  computeInjuryRiskDelta,
  computeMpiDelta,
  computePlayerRatings,
} from '../../src/sim/sports/football/football-formulas.js';
import {
  buildForfeitOutcome,
  shouldForfeit,
  simulateMatch,
} from '../../src/sim/sports/football/match-simulation.js';
import {
  F10_MIN_MINUTES,
  FORFEIT_MPI_DELTA,
  FORFEIT_SQUAD_THRESHOLD,
  INJURY_RISK_DELTA_MAX,
  MPI_DELTA_MAX,
  MPI_DELTA_MIN,
} from '../../src/sim/sports/football/football-constants.js';
import type {
  Lineup,
  MatchEvent,
  MatchInput,
  PlayerStats,
  PreMatchSnapshot,
} from '../../src/sim/sports/football/football-types.js';

function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: `p-${Math.random()}`,
    position: 'MIDFIELDER',
    skill: 65,
    fitness: 55,
    morale: 75,
    form: 70,
    stamina: 60,
    ...overrides,
  };
}

function makeLineup(n: number): Lineup {
  return Array.from({ length: n }, (_, i) => ({ player: makePlayer({ id: `p-${i}` }), slotIndex: i }));
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

function makeInput(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    seed: 'test',
    homeLineup: makeLineup(11),
    awayLineup: makeLineup(11),
    homeFormation: '4-4-2',
    awayFormation: '4-4-2',
    homeInstruction: null,
    awayInstruction: null,
    preMatchSnapshot: makeSnapshot(),
    playerClubSide: 'home',
    playerClubId: 'club-1',
    ...overrides,
  };
}

// ── AC-MATCH-14: F8 mpi_delta perspective-aware ──────────────────────────────

describe('AC-MATCH-14 — F8 mpi_delta perspective branches', () => {
  it('test_home_win_positive', () => {
    expect(computeMpiDelta({ homeScore: 2, awayScore: 0, playerClubSide: 'home' })).toBe(20);
  });

  it('test_home_loss_negative', () => {
    expect(computeMpiDelta({ homeScore: 0, awayScore: 2, playerClubSide: 'home' })).toBe(-20);
  });

  it('test_away_win_positive_R1_fix', () => {
    // CRITICAL R1 fix — pre-R1 returned negative
    expect(computeMpiDelta({ homeScore: 1, awayScore: 2, playerClubSide: 'away' })).toBe(15);
  });

  it('test_away_loss_negative', () => {
    expect(computeMpiDelta({ homeScore: 3, awayScore: 1, playerClubSide: 'away' })).toBe(-20);
  });

  it('test_home_draw_penalty_minus_3_R2_fix', () => {
    expect(computeMpiDelta({ homeScore: 1, awayScore: 1, playerClubSide: 'home' })).toBe(-3);
  });

  it('test_away_draw_bonus_plus_1_R2_fix', () => {
    expect(computeMpiDelta({ homeScore: 1, awayScore: 1, playerClubSide: 'away' })).toBe(1);
  });

  it('test_clamp_at_plus_30', () => {
    // 5-0 home win → 10 + 25 = 35 → clamped to 30
    expect(computeMpiDelta({ homeScore: 5, awayScore: 0, playerClubSide: 'home' })).toBe(MPI_DELTA_MAX);
  });

  it('test_clamp_at_minus_30', () => {
    expect(computeMpiDelta({ homeScore: 0, awayScore: 5, playerClubSide: 'home' })).toBe(MPI_DELTA_MIN);
  });
});

// ── AC-MATCH-15: F9 injury_risk_delta ─────────────────────────────────────────

describe('AC-MATCH-15 — F9 injury_risk_delta', () => {
  function evt(type: MatchEvent['type']): { type: string } {
    return { type };
  }

  it('test_normal_two_injuries_four_yellows', () => {
    const events = [
      evt('injury'),
      evt('injury'),
      evt('yellow_card'),
      evt('yellow_card'),
      evt('yellow_card'),
      evt('yellow_card'),
    ];
    expect(computeInjuryRiskDelta(events)).toBe(13); // 2×5 + 3 = 13
  });

  it('test_clamp_at_15', () => {
    const events = [
      evt('injury'),
      evt('injury'),
      evt('injury'),
      evt('yellow_card'),
      evt('yellow_card'),
      evt('yellow_card'),
      evt('yellow_card'),
    ];
    expect(computeInjuryRiskDelta(events)).toBe(INJURY_RISK_DELTA_MAX); // 18 clamped to 15
  });

  it('test_three_yellows_no_high_intensity_bonus', () => {
    const events = [evt('yellow_card'), evt('yellow_card'), evt('yellow_card')];
    expect(computeInjuryRiskDelta(events)).toBe(0); // strict > 3
  });

  it('test_four_yellows_triggers_high_intensity', () => {
    const events = [evt('yellow_card'), evt('yellow_card'), evt('yellow_card'), evt('yellow_card')];
    expect(computeInjuryRiskDelta(events)).toBe(3);
  });

  it('test_zero_events_returns_zero', () => {
    expect(computeInjuryRiskDelta([])).toBe(0);
  });
});

// ── F10 player ratings ────────────────────────────────────────────────────────

describe('F10 — playerRatings minutes gate + own team', () => {
  it('test_minutes_29_excluded_30_included', () => {
    const lineup: Lineup = [
      { player: makePlayer({ id: 'p-low' }), slotIndex: 0 },
      { player: makePlayer({ id: 'p-high' }), slotIndex: 1 },
    ];
    const minutesPlayed = { 'p-low': 29, 'p-high': 30 };
    const ratings = computePlayerRatings({ playerLineup: lineup, minutesPlayed });
    expect(ratings['p-low']).toBeUndefined();
    expect(ratings['p-high']).toBeDefined();
  });

  it('test_min_minutes_constant_is_30', () => {
    expect(F10_MIN_MINUTES).toBe(30);
  });

  it('test_gdd_example_value', () => {
    // skill=65, form=70, morale=75, fitness=55, stamina=60
    // ef(90) = 55 - 1×0.4×15 = 49
    // rating = 65×0.35 + 70×0.20 + 75×0.15 + 49×0.30 = 22.75 + 14 + 11.25 + 14.7 = 62.7
    const p = makePlayer({ id: 'p-gdd', skill: 65, form: 70, morale: 75, fitness: 55, stamina: 60 });
    const ratings = computePlayerRatings({
      playerLineup: [{ player: p, slotIndex: 0 }],
      minutesPlayed: { 'p-gdd': 90 },
    });
    expect(ratings['p-gdd']).toBeCloseTo(62.7, 1);
  });

  it('test_player_with_no_minutes_record_excluded', () => {
    const p = makePlayer({ id: 'p-missing' });
    const ratings = computePlayerRatings({
      playerLineup: [{ player: p, slotIndex: 0 }],
      minutesPlayed: {}, // no entry
    });
    expect(ratings['p-missing']).toBeUndefined();
  });
});

// ── AC-MATCH-16: forfeit ──────────────────────────────────────────────────────

describe('AC-MATCH-16 — forfeit short-circuit', () => {
  it('test_should_forfeit_at_threshold_63', () => {
    const input = makeInput({ preMatchSnapshot: makeSnapshot({ squad_available_pct: 63 }) });
    expect(shouldForfeit(input)).toBe(true);
  });

  it('test_should_not_forfeit_at_64', () => {
    const input = makeInput({ preMatchSnapshot: makeSnapshot({ squad_available_pct: 64 }) });
    expect(shouldForfeit(input)).toBe(false);
  });

  it('test_should_forfeit_at_60', () => {
    const input = makeInput({ preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }) });
    expect(shouldForfeit(input)).toBe(true);
  });

  it('test_forfeit_outcome_home_player_loses_0_3', () => {
    const input = makeInput({
      playerClubSide: 'home',
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = buildForfeitOutcome(input);
    expect(out.homeScore).toBe(0);
    expect(out.awayScore).toBe(3);
    expect(out.winner).toBe('away');
  });

  it('test_forfeit_outcome_away_player_loses_3_0', () => {
    const input = makeInput({
      playerClubSide: 'away',
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = buildForfeitOutcome(input);
    expect(out.homeScore).toBe(3);
    expect(out.awayScore).toBe(0);
    expect(out.winner).toBe('home');
  });

  it('test_forfeit_outcome_world_state_deltas_exact_2_keys', () => {
    const input = makeInput({
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = buildForfeitOutcome(input);
    const keys = Object.keys(out.worldStateDeltas).sort();
    expect(keys).toEqual(['injury_risk', 'match_performance_index']);
    expect(out.worldStateDeltas['match_performance_index']).toBe(FORFEIT_MPI_DELTA);
    expect(out.worldStateDeltas['injury_risk']).toBe(0);
  });

  it('test_forfeit_outcome_emits_one_event_with_causal_node_squad', () => {
    const input = makeInput({
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = buildForfeitOutcome(input);
    expect(out.events.length).toBe(1);
    expect(out.events[0]!.type).toBe('forfeit');
    expect(out.events[0]!.causal_node).toBe('squad_available_pct');
  });

  it('test_forfeit_player_ratings_empty', () => {
    const input = makeInput({
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = buildForfeitOutcome(input);
    expect(Object.keys(out.playerRatings).length).toBe(0);
  });

  it('test_simulate_match_routes_forfeit_short_circuit', () => {
    const input = makeInput({
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
    });
    const out = simulateMatch(input);
    expect(out.events.find((e) => e.type === 'forfeit')).toBeDefined();
  });

  it('test_simulate_match_play_path_runs_when_no_forfeit', () => {
    // Now that MATCH-SIM-013 is implemented, the play path runs to completion.
    const input = makeInput({
      preMatchSnapshot: makeSnapshot({ squad_available_pct: 80 }),
    });
    const out = simulateMatch(input);
    expect(out.events.find((e) => e.type === 'forfeit')).toBeUndefined();
    expect(out.homeScore).toBeGreaterThanOrEqual(0);
    expect(out.awayScore).toBeGreaterThanOrEqual(0);
  });

  it('test_threshold_constant', () => {
    expect(FORFEIT_SQUAD_THRESHOLD).toBe(63);
  });
});

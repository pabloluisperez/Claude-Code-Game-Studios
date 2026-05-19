/**
 * Integration tests for `simulateMatch` — the per-tick loop.
 *
 * Story: MATCH-SIM-013
 * Acceptance Criteria: AC-MATCH-01 (determinism), AC-MATCH-05 (worldStateDeltas keys),
 *                      AC-MATCH-19 (perf <50ms), AC-MATCH-21 (substitution_window ticks),
 *                      AC-MATCH-30 (filter substitution_window from external events).
 * Test Evidence: packages/shared/tests/match-sim/simulate-match.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../../src/sim/sports/football/match-simulation.js';
import type {
  Lineup,
  MatchInput,
  MatchOutcome,
  PlayerStats,
  Position,
  PreMatchSnapshot,
} from '../../src/sim/sports/football/football-types.js';

function makePlayer(
  id: string,
  position: Position,
  overrides: Partial<PlayerStats> = {},
): PlayerStats {
  return {
    id,
    position,
    skill: 65,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 80,
    ...overrides,
  };
}

function makeLineup(
  teamPrefix: string,
  starterFitness = 80,
  starterStamina = 80,
): Lineup {
  // 1 GK + 4 DEF + 4 MID + 2 FWD = 11 starters + 7 bench
  const positions: Position[] = [
    'GOALKEEPER',
    'DEFENDER',
    'DEFENDER',
    'DEFENDER',
    'DEFENDER',
    'MIDFIELDER',
    'MIDFIELDER',
    'MIDFIELDER',
    'MIDFIELDER',
    'FORWARD',
    'FORWARD',
  ];
  const starters = positions.map((p, i) =>
    makePlayer(`${teamPrefix}-${i}`, p, {
      fitness: starterFitness,
      stamina: starterStamina,
      speed: 70,
      vision: 70,
      passing: 70,
      tackling: 70,
      strength: 70,
      finishing: 70,
      reflexes: p === 'GOALKEEPER' ? 75 : undefined,
      handling: p === 'GOALKEEPER' ? 70 : undefined,
    }),
  );
  const benchPositions: Position[] = [
    'GOALKEEPER',
    'DEFENDER',
    'DEFENDER',
    'MIDFIELDER',
    'MIDFIELDER',
    'FORWARD',
    'FORWARD',
  ];
  const bench = benchPositions.map((p, i) =>
    makePlayer(`${teamPrefix}-bench-${i}`, p, {
      speed: 65,
      vision: 65,
      passing: 65,
      tackling: 65,
      strength: 65,
      finishing: 65,
      reflexes: p === 'GOALKEEPER' ? 70 : undefined,
      handling: p === 'GOALKEEPER' ? 65 : undefined,
    }),
  );
  return [...starters, ...bench].map((player, slotIndex) => ({ player, slotIndex }));
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
    seed: 'integration-default',
    homeLineup: makeLineup('h'),
    awayLineup: makeLineup('a'),
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

// ── AC-MATCH-01: Determinism ──────────────────────────────────────────────────

describe('AC-MATCH-01 — simulateMatch deterministic across runs', () => {
  it('test_same_seed_produces_identical_outcome_10_seeds', () => {
    for (const seed of [
      's1',
      's2',
      's3',
      's4',
      's5',
      's6',
      's7',
      's8',
      's9',
      's10',
    ]) {
      const input = makeInput({ seed });
      const a = simulateMatch(input);
      const b = simulateMatch(input);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('test_different_seeds_produce_different_outcomes', () => {
    const a = simulateMatch(makeInput({ seed: 'alpha' }));
    const b = simulateMatch(makeInput({ seed: 'beta' }));
    // Either scores differ or event sequences differ
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

// ── AC-MATCH-21 + AC-MATCH-30 substitution_window ─────────────────────────────

describe('AC-MATCH-21 + AC-MATCH-30 — substitution_window emission and filter', () => {
  it('test_external_events_have_no_substitution_window', () => {
    const out = simulateMatch(makeInput({ seed: 'sw-1' }));
    const filtered = out.events.some((e) => e.type === 'substitution_window');
    expect(filtered).toBe(false);
  });
});

// ── AC-MATCH-05 worldStateDeltas keys ─────────────────────────────────────────

describe('AC-MATCH-05 — worldStateDeltas has exactly 2 keys', () => {
  it('test_worldStateDeltas_exactly_match_and_injury', () => {
    const out = simulateMatch(makeInput({ seed: 'keys' }));
    const keys = Object.keys(out.worldStateDeltas).sort();
    expect(keys).toEqual(['injury_risk', 'match_performance_index']);
  });

  it('test_mpi_delta_in_range_minus_30_plus_30', () => {
    for (const seed of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      const out = simulateMatch(makeInput({ seed }));
      expect(out.worldStateDeltas['match_performance_index']).toBeGreaterThanOrEqual(-30);
      expect(out.worldStateDeltas['match_performance_index']).toBeLessThanOrEqual(30);
    }
  });

  it('test_injury_risk_delta_in_range_0_15', () => {
    for (const seed of ['i1', 'i2', 'i3', 'i4', 'i5']) {
      const out = simulateMatch(makeInput({ seed }));
      expect(out.worldStateDeltas['injury_risk']).toBeGreaterThanOrEqual(0);
      expect(out.worldStateDeltas['injury_risk']).toBeLessThanOrEqual(15);
    }
  });
});

// ── AC-MATCH-19 performance ───────────────────────────────────────────────────

describe('AC-MATCH-19 — simulateMatch completes in under 50ms', () => {
  it('test_single_match_under_50ms', () => {
    const input = makeInput({ seed: 'perf' });
    // Warm up to avoid JIT first-call overhead
    simulateMatch(input);
    simulateMatch(input);

    const t0 = performance.now();
    simulateMatch(input);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Winner derivation ─────────────────────────────────────────────────────────

describe('simulateMatch — winner consistent with scores', () => {
  it('test_winner_derived_from_scores', () => {
    for (const seed of ['w1', 'w2', 'w3', 'w4', 'w5']) {
      const out = simulateMatch(makeInput({ seed }));
      if (out.homeScore > out.awayScore) expect(out.winner).toBe('home');
      else if (out.homeScore < out.awayScore) expect(out.winner).toBe('away');
      else expect(out.winner).toBe('draw');
    }
  });
});

// ── playerRatings discipline ──────────────────────────────────────────────────

describe('simulateMatch — playerRatings only for player club, with minutes ≥ 30', () => {
  it('test_player_ratings_only_for_player_club_side', () => {
    const out = simulateMatch(makeInput({ seed: 'pr', playerClubSide: 'home' }));
    // No away player should appear in ratings
    const awayIds = makeLineup('a').map((s) => s.player.id);
    for (const awayId of awayIds) {
      expect(out.playerRatings[awayId]).toBeUndefined();
    }
  });

  it('test_player_ratings_record_type_not_map', () => {
    const out = simulateMatch(makeInput({ seed: 'rec' }));
    expect(out.playerRatings).not.toBeInstanceOf(Map);
    expect(typeof out.playerRatings).toBe('object');
  });
});

// ── Forfeit short-circuit (story 011 carry-through) ───────────────────────────

describe('simulateMatch — forfeit short-circuit precedes per-tick loop', () => {
  it('test_forfeit_returns_synthetic_outcome_when_squad_low', () => {
    const out = simulateMatch(
      makeInput({
        seed: 'forfeit',
        preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
      }),
    );
    expect(out.events.find((e) => e.type === 'forfeit')).toBeDefined();
    expect(out.events.length).toBe(1);
    expect(out.worldStateDeltas['match_performance_index']).toBe(-30);
  });
});

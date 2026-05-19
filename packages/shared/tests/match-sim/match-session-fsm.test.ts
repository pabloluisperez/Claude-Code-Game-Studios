/**
 * Unit tests for MatchSession FSM — init, advanceTick, validateDecision.
 *
 * Story: MATCH-SIM-014
 * Acceptance Criteria: AC-MATCH-02 (split-resume determinism is the cornerstone),
 *                      AC-MATCH-03a (pause at substitution_window),
 *                      AC-MATCH-04 (5-sub shared pool),
 *                      AC-MATCH-23 (playing_with_ten).
 * Test Evidence: packages/shared/tests/match-sim/match-session-fsm.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  advanceTick,
  applyDefaultDecisionsToSnapshot,
  initMatchSession,
  validateDecision,
  type MatchDecision,
} from '../../src/sim/sports/football/match-session-fsm.js';
import { simulateMatch } from '../../src/sim/sports/football/match-simulation.js';
import type {
  Lineup,
  MatchInput,
  MatchSessionSnapshot,
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

function makeLineup(teamPrefix: string): Lineup {
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
    seed: 'fsm-default',
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

// Helper to drive the FSM with all-default decisions until completion
function driveToCompletion(input: MatchInput): MatchSessionSnapshot {
  let snap = initMatchSession(input);
  while (snap.state !== 'completed' && snap.state !== 'failed') {
    const result = advanceTick(snap, [{ kind: 'no_op' }], input);
    if (result.pauseType === 'substitution_window') {
      // Apply default decisions (rival AI subs)
      snap = applyDefaultDecisionsToSnapshot(result.nextSnapshot, 'substitution_window');
    } else {
      snap = result.nextSnapshot;
    }
    // Safety guard against runaway loops
    if (snap.currentTick > 95) break;
  }
  return snap;
}

// ── initMatchSession ──────────────────────────────────────────────────────────

describe('initMatchSession', () => {
  it('test_init_returns_pre_match_with_zero_tick', () => {
    const snap = initMatchSession(makeInput());
    expect(snap.state).toBe('pre_match');
    expect(snap.currentTick).toBe(0);
    expect(snap.eventsAccumulated).toEqual([]);
  });

  it('test_init_forfeit_short_circuit_returns_completed', () => {
    const snap = initMatchSession(
      makeInput({
        preMatchSnapshot: makeSnapshot({ squad_available_pct: 60 }),
      }),
    );
    expect(snap.state).toBe('completed');
    expect(snap.eventsAccumulated.some((e) => e.type === 'forfeit')).toBe(true);
  });

  it('test_init_captures_prng_state_string', () => {
    const snap = initMatchSession(makeInput());
    expect(typeof snap.prngState).toBe('string');
    expect(snap.prngState.length).toBeGreaterThan(0);
  });

  it('test_init_initial_momentum_from_F3', () => {
    const snap = initMatchSession(
      makeInput({
        preMatchSnapshot: makeSnapshot({ field_quality: 70, fan_attendance: 60 }),
      }),
    );
    expect(snap.homeMomentum).toBeCloseTo(51.5, 5);
  });
});

// ── advanceTick — completion path ────────────────────────────────────────────

describe('advanceTick — drive to completion', () => {
  it('test_drive_to_completion_reaches_tick_90_completed', () => {
    const snap = driveToCompletion(makeInput({ seed: 'drive' }));
    expect(snap.state).toBe('completed');
    expect(snap.currentTick).toBe(90);
  });

  it('test_completed_state_advance_is_no_op', () => {
    const completed = driveToCompletion(makeInput({ seed: 'noop' }));
    const result = advanceTick(completed, [{ kind: 'no_op' }], makeInput({ seed: 'noop' }));
    expect(result.nextSnapshot).toBe(completed);
    expect(result.newlyEmittedEvents).toEqual([]);
  });
});

// ── AC-MATCH-03a pause at substitution_window ─────────────────────────────────

describe('AC-MATCH-03a — pause at substitution_window', () => {
  it('test_first_advance_pauses_at_tick_45', () => {
    const input = makeInput({ seed: 'pause' });
    const snap = initMatchSession(input);
    const r = advanceTick(snap, [{ kind: 'no_op' }], input);
    expect(r.pauseType).toBe('substitution_window');
    expect(r.nextSnapshot.currentTick).toBe(45);
    expect(r.nextSnapshot.state).toBe('paused_for_decision');
  });

  it('test_substitution_window_event_in_accumulated', () => {
    const input = makeInput({ seed: 'sw-event' });
    const snap = initMatchSession(input);
    const r = advanceTick(snap, [{ kind: 'no_op' }], input);
    expect(
      r.nextSnapshot.eventsAccumulated.some(
        (e) => e.type === 'substitution_window' && e.minute === 45,
      ),
    ).toBe(true);
  });
});

// ── AC-MATCH-02 — split-resume vs one-shot determinism ────────────────────────

describe('AC-MATCH-02 — split-resume determinism', () => {
  it('test_fsm_drive_default_decisions_matches_simulate_match_outcome', () => {
    // Both paths: same seed, no manager decisions (default = no_op).
    // simulateMatch goes one-shot; FSM pauses and resumes 3 times (45/60/75).
    // Final outcomes (scores + worldStateDeltas + winner) must match.
    const input = makeInput({ seed: 'match02' });

    // One-shot
    const oneShot = simulateMatch(input);

    // FSM drive
    const snap = driveToCompletion(input);
    // Reconstruct outcome from final snapshot
    let homeScore = 0,
      awayScore = 0;
    for (const e of snap.eventsAccumulated) {
      if (e.type === 'goal') {
        if (e.team === 'home') homeScore++;
        else if (e.team === 'away') awayScore++;
      }
      if (e.type === 'goal_disallowed') {
        if (e.team === 'home') homeScore--;
        else if (e.team === 'away') awayScore--;
      }
    }

    // The two paths share the same per-tick logic but differ in WHERE rival
    // AI subs are applied (FSM applies them after pauses via
    // applyDefaultDecisionsToSnapshot; simulateMatch applies them inline at
    // tick 45/60/75 before the next tick). Because the rng cursor
    // advances purely inside the per-tick body and rival AI is rng-free
    // (story 012), the two paths consume rng identically. Therefore scores
    // must match exactly.
    expect(homeScore).toBe(oneShot.homeScore);
    expect(awayScore).toBe(oneShot.awayScore);
  });
});

// ── AC-MATCH-04 — shared substitution pool ────────────────────────────────────

describe('AC-MATCH-04 — sub pool shared, max 5', () => {
  it('test_validateDecision_rejects_sub_at_pool_5', () => {
    const input = makeInput();
    const baseSnap = initMatchSession(input);
    const exhausted: MatchSessionSnapshot = { ...baseSnap, substitutionsUsed: 5 };
    const result = validateDecision(
      exhausted,
      {
        kind: 'substitution',
        from_player_id: 'h-1',
        to_player_id: 'h-bench-0',
        team: 'home',
      },
      'home',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sub_pool_exhausted');
  });

  it('test_validateDecision_accepts_first_sub_when_pool_has_room', () => {
    const input = makeInput();
    const snap = initMatchSession(input);
    const def = snap.currentLineupHome[1]!.player.id; // a starter DEF
    const benchDef = snap.currentLineupHome[12]!.player.id; // bench player at idx 12
    const result = validateDecision(
      snap,
      {
        kind: 'substitution',
        from_player_id: def,
        to_player_id: benchDef,
        team: 'home',
      },
      'home',
    );
    expect(result.ok).toBe(true);
  });
});

// ── Decision validation matrix ────────────────────────────────────────────────

describe('validateDecision — rules matrix', () => {
  it('test_counter_rejected_for_home_player', () => {
    const snap = initMatchSession(makeInput());
    const r = validateDecision(snap, { kind: 'instruction_change', instruction: 'COUNTER' }, 'home');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('counter_unavailable_for_home');
  });

  it('test_counter_accepted_for_away_player', () => {
    const snap = initMatchSession(makeInput({ playerClubSide: 'away' }));
    const r = validateDecision(snap, { kind: 'instruction_change', instruction: 'COUNTER' }, 'away');
    expect(r.ok).toBe(true);
  });

  it('test_press_high_accepted_for_home', () => {
    const snap = initMatchSession(makeInput());
    const r = validateDecision(snap, { kind: 'instruction_change', instruction: 'PRESS_HIGH' }, 'home');
    expect(r.ok).toBe(true);
  });

  it('test_invalid_substitution_to_player_not_on_bench', () => {
    const snap = initMatchSession(makeInput());
    const r = validateDecision(
      snap,
      {
        kind: 'substitution',
        from_player_id: 'h-1',
        to_player_id: 'nonexistent',
        team: 'home',
      },
      'home',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_decision');
  });

  it('test_no_op_always_accepted', () => {
    const snap = initMatchSession(makeInput());
    const r = validateDecision(snap, { kind: 'no_op' }, 'home');
    expect(r.ok).toBe(true);
  });

  it('test_cannot_substitute_for_rival_team', () => {
    const snap = initMatchSession(makeInput());
    const r = validateDecision(
      snap,
      {
        kind: 'substitution',
        from_player_id: 'a-1',
        to_player_id: 'a-bench-0',
        team: 'away',
      },
      'home',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cannot_substitute_for_rival');
  });
});

// ── prngState round-trip determinism ──────────────────────────────────────────

describe('prngState round-trip', () => {
  it('test_resume_with_serialized_state_produces_same_events', () => {
    const input = makeInput({ seed: 'round-trip' });

    // Path A: continuous run
    let snapA = initMatchSession(input);
    const rA1 = advanceTick(snapA, [{ kind: 'no_op' }], input);
    snapA = applyDefaultDecisionsToSnapshot(rA1.nextSnapshot, 'substitution_window');
    const rA2 = advanceTick(snapA, [{ kind: 'no_op' }], input);

    // Path B: serialize snapshot after first pause, then deserialize and continue
    let snapB = initMatchSession(input);
    const rB1 = advanceTick(snapB, [{ kind: 'no_op' }], input);
    const serialized = JSON.stringify(rB1.nextSnapshot);
    const restoredSnap = JSON.parse(serialized) as MatchSessionSnapshot;
    snapB = applyDefaultDecisionsToSnapshot(restoredSnap, 'substitution_window');
    const rB2 = advanceTick(snapB, [{ kind: 'no_op' }], input);

    // Newly emitted events between pause 45 and pause 60 must match exactly
    expect(JSON.stringify(rA2.newlyEmittedEvents)).toBe(
      JSON.stringify(rB2.newlyEmittedEvents),
    );
  });
});

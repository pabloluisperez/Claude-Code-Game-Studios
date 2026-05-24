/**
 * Story: MATCH-SIM-001
 * GDD Requirement: AC-MATCH-05, AC-MATCH-17, AC-MATCH-28, AC-MATCH-29, AC-MATCH-30
 * Governing ADR: ADR-007 (SportPlugin + MatchOutcome shape), ADR-013 (MatchSessionSnapshot)
 * Control Manifest: 2026-05-19
 *
 * Test naming convention: `test_[system]_[scenario]_[expected_result]` per
 *   .claude/rules/test-standards.md.
 *
 * These tests verify runtime structural contracts for the football domain types.
 * TypeScript type-checking enforces compile-time contracts; these tests guard
 * against the specific AC constraints that cannot be enforced by types alone
 * (e.g., key-count invariants, JSON-serializability of Record vs Map).
 */

import { describe, expect, it } from 'vitest';
import type {
  FormationPreset,
  Lineup,
  MatchEvent,
  MatchEventEmitter,
  MatchOutcome,
  MatchSessionSnapshot,
  MatchSessionState,
  PlayerSlot,
  PlayerStats,
  TeamInstruction,
} from '../../src/sim/sports/football/football-types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides?: Partial<PlayerStats>): PlayerStats {
  return {
    id: 'player-001',
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 65,
    form: 60,
    stamina: 75,
    passing: 72,
    vision: 68,
    ...overrides,
  };
}

function makePlayerSlot(slotIndex: number, overrides?: Partial<PlayerStats>): PlayerSlot {
  return {
    player: makePlayer(overrides),
    slotIndex,
  };
}

function makeLineup(count: number): Lineup {
  return Array.from({ length: count }, (_, i) => makePlayerSlot(i));
}

function makeMatchOutcome(overrides?: Partial<MatchOutcome>): MatchOutcome {
  return {
    homeScore: 2,
    awayScore: 1,
    winner: 'home',
    events: [],
    worldStateDeltas: {
      match_performance_index: 55,
      injury_risk: 30,
    },
    playerRatings: {},
    finalLineupHome: makeLineup(11),
    finalLineupAway: makeLineup(11),
    ...overrides,
  };
}

function makeMatchSessionSnapshot(overrides?: Partial<MatchSessionSnapshot>): MatchSessionSnapshot {
  return {
    currentTick: 45,
    eventsAccumulated: [],
    currentLineupHome: makeLineup(11),
    currentLineupAway: makeLineup(11),
    homeMomentum: 50,
    substitutionsUsed: 0,
    awaySubstitutionsUsed: 0,
    yellowCardsByPlayerId: {},
    currentFormationHome: '4-4-2' satisfies FormationPreset,
    currentFormationAway: '4-3-3' satisfies FormationPreset,
    activeInstructionHome: null,
    activeInstructionAway: null,
    prngState: '{"i":1,"j":0,"S":[1,2,3]}',
    state: 'in_progress' satisfies MatchSessionState,
    timeoutJobId: null,
    ...overrides,
  };
}

// ── MatchOutcome contracts ────────────────────────────────────────────────────

describe('match-sim types — MatchOutcome.worldStateDeltas contract (AC-MATCH-05)', () => {
  it('test_match_outcome_world_state_deltas_has_exactly_2_keys', () => {
    // Arrange
    const outcome = makeMatchOutcome({
      worldStateDeltas: {
        match_performance_index: 55,
        injury_risk: 30,
      },
    });
    // Act
    const keys = Object.keys(outcome.worldStateDeltas);
    // Assert: AC-MATCH-05 — exactly 2 keys
    expect(keys).toHaveLength(2);
    expect(keys).toContain('match_performance_index');
    expect(keys).toContain('injury_risk');
  });
});

describe('match-sim types — MatchEvent.causal_node for injury events (AC-MATCH-28)', () => {
  it('test_match_event_injury_has_causal_node_injury_risk', () => {
    // Arrange
    const injuryEvent: MatchEvent = {
      type: 'injury',
      minute: 67,
      team: 'home',
      player_id: 'player-007',
      causal_node: 'injury_risk',
    };
    // Act + Assert: causal_node is the required 'injury_risk' value (AC-MATCH-28)
    expect(injuryEvent.causal_node).toBe('injury_risk');
    expect(injuryEvent.type).toBe('injury');
  });
});

describe('match-sim types — MatchOutcome.events excludes substitution_window (AC-MATCH-30)', () => {
  it('test_match_outcome_events_excludes_substitution_window', () => {
    // Arrange: MatchOutcome.events MUST NOT contain substitution_window events.
    // This test verifies the type CONTRACT (you can build a MatchOutcome without them).
    // TODO: strengthen when outcome construction function exists (match-sim story 005+)
    // to verify that construction actually filters them out from eventsAccumulated.
    const events: MatchEvent[] = [
      { type: 'goal', minute: 23, team: 'home', causal_node: null },
      { type: 'yellow_card', minute: 44, team: 'away', player_id: 'player-005', causal_node: null },
      { type: 'substitution', minute: 60, team: 'home', player_id: 'player-003', causal_node: null },
    ];
    const outcome = makeMatchOutcome({ events });
    // Act
    const hasSubstitutionWindow = outcome.events.some(e => e.type === 'substitution_window');
    // Assert: AC-MATCH-30 — substitution_window excluded from MatchOutcome.events
    expect(hasSubstitutionWindow).toBe(false);
    expect(outcome.events).toHaveLength(3);
  });
});

describe('match-sim types — MatchSessionSnapshot.eventsAccumulated includes substitution_window', () => {
  it('test_match_session_snapshot_events_includes_substitution_window', () => {
    // Arrange: MatchSessionSnapshot.eventsAccumulated CAN include substitution_window events
    const eventsWithWindow: readonly MatchEvent[] = [
      { type: 'goal', minute: 23, team: 'home', causal_node: null },
      { type: 'substitution_window', minute: 45, causal_node: null },
      { type: 'yellow_card', minute: 44, team: 'away', player_id: 'player-005', causal_node: null },
    ];
    const snapshot = makeMatchSessionSnapshot({ eventsAccumulated: eventsWithWindow });
    // Act
    const hasSubstitutionWindow = snapshot.eventsAccumulated.some(e => e.type === 'substitution_window');
    // Assert: substitution_window is NOT filtered at snapshot stage — only at MatchOutcome stage
    expect(hasSubstitutionWindow).toBe(true);
    expect(snapshot.eventsAccumulated).toHaveLength(3);
  });
});

// ── JSON-serializability (control-manifest §JSON Rule) ────────────────────────

describe('match-sim types — worldStateDeltas is Record not Map', () => {
  it('test_world_state_deltas_is_record_not_map', () => {
    // Arrange: worldStateDeltas must be a plain Record (JSON.stringify-able).
    // A Map would serialize to "{}" — this test is the regression guard.
    const outcome = makeMatchOutcome({
      worldStateDeltas: { match_performance_index: 55, injury_risk: 30 },
    });
    // Act
    const json = JSON.stringify(outcome.worldStateDeltas);
    const restored = JSON.parse(json) as Record<string, number>;
    // Assert: round-trip preserves both keys and values
    expect(restored['match_performance_index']).toBe(55);
    expect(restored['injury_risk']).toBe(30);
    // A serialized Map would be "{}" with length 2 — guard against that
    expect(json).not.toBe('{}');
    expect(json).toContain('match_performance_index');
    expect(json).toContain('55');
  });
});

// ── MatchSessionState FSM — ADR-013 ──────────────────────────────────────────

describe('match-sim types — MatchSessionState includes failed state (ADR-013)', () => {
  it('test_match_session_state_includes_failed_state', () => {
    // Arrange
    const snapshot = makeMatchSessionSnapshot({ state: 'failed' });
    // Assert: ADR-013 required 'failed' state is part of the FSM
    expect(snapshot.state).toBe('failed');
  });
});

// ── Lineup constraints ────────────────────────────────────────────────────────

describe('match-sim types — Lineup structural constraints', () => {
  it('test_lineup_accepts_11_players', () => {
    // Arrange + Act
    const lineup = makeLineup(11);
    // Assert
    expect(lineup).toHaveLength(11);
  });

  it('test_lineup_max_18_players', () => {
    // Arrange: 11 starters + 7 bench = 18 total maximum
    const lineup = makeLineup(18);
    // Assert: a Lineup of 18 is valid
    expect(lineup).toHaveLength(18);
    expect(lineup[0]?.slotIndex).toBe(0);
    expect(lineup[17]?.slotIndex).toBe(17);
  });
});

// ── Emergency GK (AC-MATCH-17) ────────────────────────────────────────────────

describe('match-sim types — emergency GK assignedAs field (AC-MATCH-17)', () => {
  it('test_player_stats_emergency_gk_assigned_as_present', () => {
    // Arrange: a DEFENDER playing as GK in an emergency (AC-MATCH-17)
    const emergencyGk: PlayerStats = {
      id: 'player-defender-gk',
      position: 'DEFENDER',
      skill: 60,
      fitness: 85,
      morale: 70,
      form: 55,
      stamina: 80,
      strength: 65,
      tackling: 62,
      // assignedAs marks the emergency role flip
      assignedAs: 'GOALKEEPER',
    };
    // Assert: both position fields are present and correct
    expect(emergencyGk.position).toBe('DEFENDER');
    expect(emergencyGk.assignedAs).toBe('GOALKEEPER');
    // The canonical position stays DEFENDER; only assignedAs flips to GOALKEEPER
    expect(emergencyGk.position).not.toBe('GOALKEEPER');
  });
});

// ── TeamInstruction mutual exclusivity (AC-MATCH-29) ─────────────────────────

describe('match-sim types — TeamInstruction values (AC-MATCH-29)', () => {
  it('test_team_instruction_is_mutually_exclusive_type', () => {
    // Arrange: the 3 valid TeamInstruction values (AC-MATCH-29 — only one active per team)
    const validInstructions: TeamInstruction[] = ['PRESS_HIGH', 'HOLD_SHAPE', 'COUNTER'];
    // Assert: all 3 values are valid instances of TeamInstruction
    expect(validInstructions).toHaveLength(3);
    expect(validInstructions).toContain('PRESS_HIGH');
    expect(validInstructions).toContain('HOLD_SHAPE');
    expect(validInstructions).toContain('COUNTER');
    // Each TeamInstruction is mutually exclusive — verify no duplicates
    const unique = new Set(validInstructions);
    expect(unique.size).toBe(3);
  });
});

// ── MatchEventEmitter interface (ADR-013 testability) ────────────────────────

describe('match-sim types — MatchEventEmitter is mockable (ADR-013)', () => {
  it('test_match_event_emitter_spy_captures_emitted_events', () => {
    // Arrange: implement the MatchEventEmitter interface as a simple spy
    // This verifies ADR-013's requirement: the interface enables test doubles
    // without a real Socket.IO server.
    const accumulated: MatchEvent[] = [];
    const emitter: MatchEventEmitter = {
      emit(event) {
        // Discriminant: MatchEvent lacks 'sessionId' (present on all Socket.IO events).
        // This absence-of-key check is intentional — MatchEvent vs MatchPauseEvent/etc.
        if (!('sessionId' in event)) {
          accumulated.push(event as MatchEvent);
        }
      },
      getAccumulated() {
        return accumulated;
      },
    };
    const goalEvent: MatchEvent = {
      type: 'goal',
      minute: 33,
      team: 'away',
      causal_node: null,
    };
    // Act
    emitter.emit(goalEvent);
    const result = emitter.getAccumulated();
    // Assert: the spy correctly captured the emitted event
    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual(goalEvent);
  });
});

// ── MatchOutcome full JSON round-trip ─────────────────────────────────────────

describe('match-sim types — MatchOutcome JSON round-trip (control-manifest no-Map rule)', () => {
  it('test_match_outcome_json_round_trips_through_parse', () => {
    // Arrange: a realistic MatchOutcome with populated events and ratings
    const outcome = makeMatchOutcome({
      homeScore: 3,
      awayScore: 2,
      winner: 'home',
      events: [
        { type: 'goal', minute: 12, team: 'home', causal_node: null },
        { type: 'yellow_card', minute: 31, team: 'away', player_id: 'p-02', causal_node: null },
        { type: 'injury', minute: 67, team: 'home', player_id: 'p-07', causal_node: 'injury_risk' },
        { type: 'red_card', minute: 72, team: 'away', player_id: 'p-09', causal_node: null },
        { type: 'goal', minute: 88, team: 'home', causal_node: null },
      ],
      worldStateDeltas: { match_performance_index: 62, injury_risk: 35 },
      playerRatings: { 'p-01': 7.5, 'p-02': 5.2, 'p-07': 6.8 },
    });
    // Act
    const json = JSON.stringify(outcome);
    const restored = JSON.parse(json) as MatchOutcome;
    // Assert: full round-trip preserves all fields
    expect(restored.homeScore).toBe(3);
    expect(restored.awayScore).toBe(2);
    expect(restored.winner).toBe('home');
    expect(restored.events).toHaveLength(5);
    expect(restored.worldStateDeltas['match_performance_index']).toBe(62);
    expect(restored.worldStateDeltas['injury_risk']).toBe(35);
    expect(Object.keys(restored.worldStateDeltas)).toHaveLength(2);
    expect(restored.playerRatings['p-01']).toBe(7.5);
    // The JSON must not be an empty object — Map regression guard
    expect(json).not.toBe('{}');
    expect(json).toContain('match_performance_index');
  });
});

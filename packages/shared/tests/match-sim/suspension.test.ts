/**
 * Suspension formula unit tests — Sprint 13 task 13-1.
 *
 * Covers:
 *   - suspensionMatches formula for each red-card reason
 *   - extractSuspensions filtering + mapping from MatchEvent[]
 *   - processYellowAccumulation 5-yellow rule
 *   - isPlayerAvailable boundary cases
 *   - returnMatchday math
 */

import { describe, it, expect } from 'vitest';
import {
  suspensionMatches,
  extractSuspensions,
  processYellowAccumulation,
  isPlayerAvailable,
  returnMatchday,
  YELLOW_SEASON_SUSPENSION_THRESHOLD,
} from '../../src/sim/sports/football/suspension';
import type { MatchEvent } from '../../src/sim/sports/football/football-types';

function evt(partial: Partial<MatchEvent>): MatchEvent {
  return {
    type: 'red_card',
    minute: 45,
    team: 'home',
    player_id: 'p1',
    causal_node: null,
    ...partial,
  } as MatchEvent;
}

describe('Sprint 13 task 13-1 — Suspension', () => {
  describe('suspensionMatches formula', () => {
    it('test_double_yellow_returns_one_match', () => {
      expect(suspensionMatches('second_yellow')).toBe(1);
    });

    it('test_direct_red_returns_two_matches', () => {
      expect(suspensionMatches('direct')).toBe(2);
    });

    it('test_violent_conduct_returns_three_matches', () => {
      expect(suspensionMatches('violent')).toBe(3);
    });

    it('test_unknown_reason_returns_zero_matches', () => {
      expect(suspensionMatches('unknown_reason')).toBe(0);
      expect(suspensionMatches('')).toBe(0);
    });
  });

  describe('extractSuspensions from MatchEvent[]', () => {
    it('test_returns_empty_when_no_red_events', () => {
      const events: MatchEvent[] = [
        { type: 'goal', minute: 30, team: 'home', player_id: 'p2', causal_node: null } as MatchEvent,
        { type: 'yellow_card', minute: 60, team: 'away', player_id: 'p3', causal_node: null } as MatchEvent,
      ];
      expect(extractSuspensions(events)).toEqual([]);
    });

    it('test_extracts_direct_red_as_two_matches', () => {
      const events = [evt({ reason: 'direct' } as Partial<MatchEvent>)];
      const out = extractSuspensions(events);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        playerId: 'p1',
        matches: 2,
        reason: 'direct',
        team: 'home',
        minute: 45,
      });
    });

    it('test_extracts_second_yellow_as_one_match', () => {
      const events = [evt({ reason: 'second_yellow' } as Partial<MatchEvent>)];
      expect(extractSuspensions(events)[0]?.matches).toBe(1);
    });

    it('test_extracts_violent_as_three_matches', () => {
      const events = [evt({ reason: 'violent' } as Partial<MatchEvent>)];
      expect(extractSuspensions(events)[0]?.matches).toBe(3);
    });

    it('test_skips_red_event_without_player_id', () => {
      const events = [evt({ player_id: undefined, reason: 'direct' } as Partial<MatchEvent>)];
      expect(extractSuspensions(events)).toEqual([]);
    });

    it('test_defaults_to_direct_when_reason_missing', () => {
      const events = [evt({ reason: undefined } as Partial<MatchEvent>)];
      expect(extractSuspensions(events)[0]?.matches).toBe(2);
    });

    it('test_extracts_multiple_red_cards_in_one_match', () => {
      const events = [
        evt({ player_id: 'home_p1', reason: 'second_yellow', team: 'home', minute: 65 } as Partial<MatchEvent>),
        evt({ player_id: 'away_p1', reason: 'direct', team: 'away', minute: 88 } as Partial<MatchEvent>),
      ];
      const out = extractSuspensions(events);
      expect(out).toHaveLength(2);
      expect(out[0]?.matches).toBe(1);
      expect(out[1]?.matches).toBe(2);
    });
  });

  describe('processYellowAccumulation 5-yellow rule', () => {
    it('test_threshold_constant_is_five', () => {
      expect(YELLOW_SEASON_SUSPENSION_THRESHOLD).toBe(5);
    });

    it('test_returns_empty_when_no_yellow_events', () => {
      const events: MatchEvent[] = [
        { type: 'goal', minute: 30, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
      ];
      expect(processYellowAccumulation(events, {})).toEqual([]);
    });

    it('test_first_yellow_of_season_no_trigger', () => {
      const events: MatchEvent[] = [
        { type: 'yellow_card', minute: 30, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
      ];
      const out = processYellowAccumulation(events, {});
      expect(out).toHaveLength(1);
      expect(out[0]?.newSeasonCount).toBe(1);
      expect(out[0]?.triggersSuspension).toBe(false);
    });

    it('test_fifth_yellow_triggers_suspension', () => {
      const events: MatchEvent[] = [
        { type: 'yellow_card', minute: 30, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
      ];
      const out = processYellowAccumulation(events, { p1: 4 });
      expect(out[0]?.newSeasonCount).toBe(5);
      expect(out[0]?.triggersSuspension).toBe(true);
    });

    it('test_two_yellows_in_one_match_trigger_suspension', () => {
      // Player already had 4; this match accumulates 1 more (then would
      // get a second yellow = red, but the YELLOW accumulation rule still
      // counts the first one for season total).
      const events: MatchEvent[] = [
        { type: 'yellow_card', minute: 20, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
        { type: 'yellow_card', minute: 70, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
      ];
      const out = processYellowAccumulation(events, { p1: 3 });
      expect(out[0]?.newSeasonCount).toBe(5);
      expect(out[0]?.triggersSuspension).toBe(true);
    });

    it('test_multiple_players_accumulate_independently', () => {
      const events: MatchEvent[] = [
        { type: 'yellow_card', minute: 20, team: 'home', player_id: 'p1', causal_node: null } as MatchEvent,
        { type: 'yellow_card', minute: 70, team: 'away', player_id: 'p2', causal_node: null } as MatchEvent,
      ];
      const out = processYellowAccumulation(events, { p1: 4, p2: 1 });
      const p1 = out.find((e) => e.playerId === 'p1');
      const p2 = out.find((e) => e.playerId === 'p2');
      expect(p1?.newSeasonCount).toBe(5);
      expect(p1?.triggersSuspension).toBe(true);
      expect(p2?.newSeasonCount).toBe(2);
      expect(p2?.triggersSuspension).toBe(false);
    });
  });

  describe('isPlayerAvailable boundary cases', () => {
    it('test_null_remaining_means_available', () => {
      expect(isPlayerAvailable(null)).toBe(true);
    });

    it('test_zero_remaining_means_available', () => {
      expect(isPlayerAvailable(0)).toBe(true);
    });

    it('test_positive_remaining_means_unavailable', () => {
      expect(isPlayerAvailable(1)).toBe(false);
      expect(isPlayerAvailable(2)).toBe(false);
      expect(isPlayerAvailable(3)).toBe(false);
    });
  });

  describe('returnMatchday math', () => {
    it('test_null_remaining_returns_null', () => {
      expect(returnMatchday(10, null)).toBe(null);
    });

    it('test_zero_remaining_returns_current_matchday', () => {
      expect(returnMatchday(10, 0)).toBe(10);
    });

    it('test_two_matches_remaining_returns_current_plus_two', () => {
      // currentMatchday=10, remaining=2 →
      //   miss J10 → 2→1
      //   miss J11 → 1→0
      //   available J12
      expect(returnMatchday(10, 2)).toBe(12);
    });

    it('test_one_match_remaining_returns_next_matchday', () => {
      expect(returnMatchday(10, 1)).toBe(11);
    });
  });
});

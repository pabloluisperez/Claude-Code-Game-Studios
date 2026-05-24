/**
 * Unit tests for XP_SOURCES mapping + computeXpGrants.
 * Story: MANAGER-RPG-004
 */

import { describe, it, expect } from 'vitest';
import {
  computeXpGrants,
  XP_SOURCES,
} from '../../src/sim/manager-rpg/xp-sources.js';

describe('XP_SOURCES — ADR-010 event mappings', () => {
  it('test_match_win_grants_tactical_insight_10', () => {
    const grants = XP_SOURCES['match_win'];
    expect(grants).toBeDefined();
    expect(grants![0]!.skillId).toBe('tactical_insight');
    expect(grants![0]!.amount).toBe(10);
  });

  it('test_season_end_promoted_grants_reputation_50', () => {
    const grants = XP_SOURCES['season_end:promoted'];
    expect(grants![0]!.skillId).toBe('reputation');
    expect(grants![0]!.amount).toBe(50);
  });

  it('test_first_5_match_streak_grants_two_skills', () => {
    const grants = XP_SOURCES['first_5_match_win_streak'];
    expect(grants!.length).toBe(2);
    expect(grants!.map((g) => g.skillId).sort()).toEqual(['reputation', 'tactical_insight']);
  });

  it('test_relegation_zero_xp', () => {
    const grants = XP_SOURCES['season_end:relegated'];
    expect(grants![0]!.amount).toBe(0);
  });
});

describe('computeXpGrants', () => {
  it('test_known_event_returns_grants', () => {
    expect(computeXpGrants(['match_win'])).toEqual([
      { skillId: 'tactical_insight', amount: 10, reason: 'match_win' },
    ]);
  });

  it('test_unknown_event_silently_dropped', () => {
    expect(computeXpGrants(['nonexistent_event'])).toEqual([]);
  });

  it('test_multiple_events_concatenated', () => {
    const grants = computeXpGrants(['match_win', 'match_draw']);
    expect(grants.length).toBe(2);
  });

  it('test_event_with_multiple_grants_emits_all', () => {
    const grants = computeXpGrants(['first_5_match_win_streak']);
    expect(grants.length).toBe(2);
  });

  it('test_empty_input_empty_output', () => {
    expect(computeXpGrants([])).toEqual([]);
  });
});

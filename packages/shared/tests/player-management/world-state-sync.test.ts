/**
 * Unit tests for F8/F9/F9b WorldState sync.
 * Story: PLAYER-MANAGEMENT-006
 */

import { describe, it, expect } from 'vitest';
import {
  FORFEIT_SQUAD_PCT_THRESHOLD,
  SQUAD_REGISTERED_SIZE,
  buildWorldStateDecisions,
  computePlayerHappinessDelta,
  computeSquadAvailablePct,
  computeTeamSkill,
  squadPctTriggersForceit,
} from '../../src/sim/player-management/world-state-sync.js';

describe('F8 — computeSquadAvailablePct', () => {
  it('test_ac_pm_10_with_canonical_denominator_25', () => {
    // 14 available / 25 registered → round(56) = 56
    expect(computeSquadAvailablePct(14)).toBe(56);
  });

  it('test_ac_pm_11_threshold_boundaries', () => {
    // 16/25 = 64% → no forfeit
    expect(computeSquadAvailablePct(16)).toBe(64);
    expect(squadPctTriggersForceit(64)).toBe(false);
    // 15/25 = 60% → forfeit
    expect(computeSquadAvailablePct(15)).toBe(60);
    expect(squadPctTriggersForceit(60)).toBe(true);
    // 10/25 = 40% → forfeit
    expect(computeSquadAvailablePct(10)).toBe(40);
    expect(squadPctTriggersForceit(40)).toBe(true);
  });

  it('test_full_squad_100', () => {
    expect(computeSquadAvailablePct(SQUAD_REGISTERED_SIZE)).toBe(100);
  });

  it('test_zero_available', () => {
    expect(computeSquadAvailablePct(0)).toBe(0);
    expect(squadPctTriggersForceit(0)).toBe(true);
  });

  it('test_forfeit_threshold_constant', () => {
    expect(FORFEIT_SQUAD_PCT_THRESHOLD).toBe(63);
  });
});

describe('F9 — computeTeamSkill', () => {
  it('test_ac_pm_12_known_lineup', () => {
    // [75,72,68,70,65,71,66,74,68,72,69] sum=770 mean=70
    expect(computeTeamSkill([75, 72, 68, 70, 65, 71, 66, 74, 68, 72, 69])).toBe(70);
  });

  it('test_empty_lineup_minimum_clamp', () => {
    expect(computeTeamSkill([])).toBe(20);
  });

  it('test_uniform_skills', () => {
    expect(computeTeamSkill(Array(11).fill(80))).toBe(80);
  });
});

describe('F9b — computePlayerHappinessDelta', () => {
  it('test_convergence_to_mean_morale', () => {
    const moraleArr = Array(11).fill(65);
    expect(computePlayerHappinessDelta(moraleArr, 60)).toBe(5);
  });

  it('test_zero_delta_when_at_mean', () => {
    expect(computePlayerHappinessDelta(Array(11).fill(70), 70)).toBe(0);
  });

  it('test_negative_delta_when_morale_drops', () => {
    expect(computePlayerHappinessDelta(Array(11).fill(40), 70)).toBe(-30);
  });

  it('test_empty_returns_zero', () => {
    expect(computePlayerHappinessDelta([], 70)).toBe(0);
  });
});

describe('buildWorldStateDecisions', () => {
  it('test_returns_exactly_3_decisions', () => {
    const decisions = buildWorldStateDecisions({
      availableCount: 20,
      startingElevenSkills: Array(11).fill(70),
      startingElevenMorale: Array(11).fill(65),
      prevPlayerHappiness: 60,
      prevSquadAvailablePct: 75,
      prevTeamSkill: 65,
    });
    expect(decisions.length).toBe(3);
    const nodeIds = decisions.map((d) => d.nodeId).sort();
    expect(nodeIds).toEqual(['player_happiness', 'squad_available_pct', 'team_skill']);
  });

  it('test_deltas_computed_against_prev_values', () => {
    const decisions = buildWorldStateDecisions({
      availableCount: 20,
      startingElevenSkills: Array(11).fill(70),
      startingElevenMorale: Array(11).fill(60),
      prevPlayerHappiness: 60,
      prevSquadAvailablePct: 75,
      prevTeamSkill: 65,
    });
    // new squad pct = 20/25*100 = 80 → delta = 80-75 = +5
    const squadDecision = decisions.find((d) => d.nodeId === 'squad_available_pct');
    expect(squadDecision!.delta).toBe(5);
    // new team_skill = 70 → delta = 70-65 = +5
    const skillDecision = decisions.find((d) => d.nodeId === 'team_skill');
    expect(skillDecision!.delta).toBe(5);
    // happiness delta = 60-60 = 0
    const happinessDecision = decisions.find((d) => d.nodeId === 'player_happiness');
    expect(happinessDecision!.delta).toBe(0);
  });
});

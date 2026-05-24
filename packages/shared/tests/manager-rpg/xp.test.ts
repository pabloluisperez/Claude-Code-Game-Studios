/**
 * Unit tests for XP curve + applyXpGrants.
 * Story: MANAGER-RPG-002
 */

import { describe, it, expect } from 'vitest';
import {
  applyXpGrants,
  calculateXpToNextLevel,
  initManagerSkills,
  INITIAL_MANAGER_SKILL,
} from '../../src/sim/manager-rpg/xp.js';
import {
  MANAGER_SKILL_IDS,
  type ManagerProfile,
  type XpGrant,
} from '../../src/sim/manager-rpg/types.js';

function makeProfile(): ManagerProfile {
  return {
    id: 'mp-1',
    playthroughId: 'pt-1',
    name: 'Test Manager',
    skills: initManagerSkills(),
  };
}

describe('calculateXpToNextLevel — ADR-010 exponential curve', () => {
  it('test_level_1_needs_100', () => {
    expect(calculateXpToNextLevel(1)).toBe(100);
  });
  it('test_level_2_needs_200', () => {
    expect(calculateXpToNextLevel(2)).toBe(200);
  });
  it('test_level_3_needs_400', () => {
    expect(calculateXpToNextLevel(3)).toBe(400);
  });
  it('test_level_4_needs_800', () => {
    expect(calculateXpToNextLevel(4)).toBe(800);
  });
  it('test_level_5_is_infinity_cap', () => {
    expect(calculateXpToNextLevel(5)).toBe(Infinity);
  });
});

describe('initManagerSkills', () => {
  it('test_all_5_skills_initialized', () => {
    const skills = initManagerSkills();
    for (const id of MANAGER_SKILL_IDS) {
      expect(skills[id]).toEqual(INITIAL_MANAGER_SKILL);
    }
  });

  it('test_initial_state_level_1_xp_0', () => {
    const s = initManagerSkills();
    expect(s.tactical_insight.level).toBe(1);
    expect(s.tactical_insight.xp).toBe(0);
    expect(s.tactical_insight.xpToNextLevel).toBe(100);
  });
});

describe('applyXpGrants — basic grants', () => {
  it('test_single_grant_no_levelup', () => {
    const profile = makeProfile();
    const grants: XpGrant[] = [{ skillId: 'tactical_insight', amount: 50, reason: 'match_win' }];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    expect(updatedProfile.skills.tactical_insight.xp).toBe(50);
    expect(updatedProfile.skills.tactical_insight.level).toBe(1);
    expect(levelUps).toEqual([]);
  });

  it('test_single_grant_triggers_levelup', () => {
    const profile = makeProfile();
    const grants: XpGrant[] = [{ skillId: 'tactical_insight', amount: 100, reason: 'big_event' }];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    expect(updatedProfile.skills.tactical_insight.level).toBe(2);
    expect(updatedProfile.skills.tactical_insight.xp).toBe(0); // exact threshold consumed
    expect(updatedProfile.skills.tactical_insight.xpToNextLevel).toBe(200);
    expect(levelUps.length).toBe(1);
    expect(levelUps[0]!.fromLevel).toBe(1);
    expect(levelUps[0]!.toLevel).toBe(2);
  });

  it('test_grant_with_overflow_carries_to_next_level', () => {
    const profile = makeProfile();
    const grants: XpGrant[] = [{ skillId: 'tactical_insight', amount: 150, reason: 'win+bonus' }];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    expect(updatedProfile.skills.tactical_insight.level).toBe(2);
    expect(updatedProfile.skills.tactical_insight.xp).toBe(50); // 150-100=50
    expect(levelUps.length).toBe(1);
  });

  it('test_cascade_levelup_large_grant', () => {
    // 100 + 200 + 400 + 800 = 1500 → level 1 → 5
    const profile = makeProfile();
    const grants: XpGrant[] = [{ skillId: 'reputation', amount: 1500, reason: 'huge_promotion' }];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    expect(updatedProfile.skills.reputation.level).toBe(5);
    expect(updatedProfile.skills.reputation.xpToNextLevel).toBe(Infinity);
    expect(levelUps.length).toBe(4);
  });

  it('test_multiple_grants_to_different_skills', () => {
    const profile = makeProfile();
    const grants: XpGrant[] = [
      { skillId: 'tactical_insight', amount: 50, reason: 'win' },
      { skillId: 'financial_acumen', amount: 30, reason: 'positive_month' },
      { skillId: 'tactical_insight', amount: 60, reason: 'another_win' },
    ];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    // 50 + 60 = 110 → level-up to 2 with 10 overflow
    expect(updatedProfile.skills.tactical_insight.level).toBe(2);
    expect(updatedProfile.skills.tactical_insight.xp).toBe(10);
    expect(updatedProfile.skills.financial_acumen.xp).toBe(30);
    expect(levelUps.length).toBe(1);
  });

  it('test_max_level_caps_xp_silently', () => {
    // Start with reputation already at level 5
    const profile: ManagerProfile = {
      id: 'mp',
      playthroughId: 'pt',
      name: 't',
      skills: {
        ...initManagerSkills(),
        reputation: { level: 5, xp: 0, xpToNextLevel: Infinity },
      },
    };
    const grants: XpGrant[] = [{ skillId: 'reputation', amount: 5000, reason: 'overflow' }];
    const { updatedProfile, levelUps } = applyXpGrants(profile, grants);
    expect(updatedProfile.skills.reputation.level).toBe(5);
    // XP should NOT exceed xpToNextLevel (Infinity)
    expect(updatedProfile.skills.reputation.xp).toBeLessThanOrEqual(Infinity);
    expect(levelUps).toEqual([]);
  });

  it('test_does_not_mutate_input_profile', () => {
    const profile = makeProfile();
    const snapshot = JSON.parse(JSON.stringify(profile));
    applyXpGrants(profile, [{ skillId: 'tactical_insight', amount: 50, reason: 't' }]);
    expect(JSON.parse(JSON.stringify(profile))).toEqual(snapshot);
  });

  it('test_empty_grants_returns_unchanged_profile', () => {
    const profile = makeProfile();
    const { updatedProfile, levelUps } = applyXpGrants(profile, []);
    expect(updatedProfile.skills).toEqual(profile.skills);
    expect(levelUps).toEqual([]);
  });
});

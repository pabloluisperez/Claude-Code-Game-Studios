/**
 * XP curve + applyXpGrants pure function.
 *
 * Per ADR-010 §Pure Function (sim layer):
 *   XP curve: 100, 200, 400, 800, ∞ — exponential doubling
 *   Level 5 is max; XP beyond cap is silently floored (intentional).
 *
 * Story: MANAGER-RPG-002
 * Control Manifest: 2026-05-19
 */

import type {
  ManagerProfile,
  ManagerSkill,
  ManagerSkillId,
  ManagerSkills,
  SkillLevel,
  SkillLevelUp,
  XpGrant,
} from './types.js';
import { MAX_SKILL_LEVEL } from './types.js';

/**
 * XP required to reach the NEXT level given the current level.
 *   level 1 → 100 XP to reach 2
 *   level 2 → 200 XP to reach 3
 *   level 3 → 400 XP to reach 4
 *   level 4 → 800 XP to reach 5
 *   level 5 → Infinity (cap)
 */
export function calculateXpToNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_SKILL_LEVEL) return Infinity;
  return 100 * Math.pow(2, currentLevel - 1);
}

export const INITIAL_MANAGER_SKILL: ManagerSkill = Object.freeze({
  level: 1,
  xp: 0,
  xpToNextLevel: calculateXpToNextLevel(1),
});

/** Build the initial skills bundle for a fresh manager. */
export function initManagerSkills(): ManagerSkills {
  return Object.freeze({
    tactical_insight: INITIAL_MANAGER_SKILL,
    man_management: INITIAL_MANAGER_SKILL,
    financial_acumen: INITIAL_MANAGER_SKILL,
    scouting_network: INITIAL_MANAGER_SKILL,
    reputation: INITIAL_MANAGER_SKILL,
  });
}

export interface ApplyXpGrantsResult {
  readonly updatedProfile: ManagerProfile;
  readonly levelUps: readonly SkillLevelUp[];
}

/**
 * Apply XP grants to a manager profile. Pure function — no DB, no I/O.
 *
 * Handles cascading level-ups: if a single grant pushes XP beyond multiple
 * thresholds (rare but possible with large grants like season_end:promoted),
 * level transitions chain through until either max level or remaining XP
 * is below the next threshold.
 *
 * Per ADR-010: XP beyond level-5 cap is silently floored (intentional).
 */
export function applyXpGrants(
  profile: Readonly<ManagerProfile>,
  grants: readonly XpGrant[],
): ApplyXpGrantsResult {
  const updatedSkills: { [K in ManagerSkillId]: ManagerSkill } = {
    ...profile.skills,
  };
  const levelUps: SkillLevelUp[] = [];

  for (const grant of grants) {
    let skill = updatedSkills[grant.skillId];
    let remainingXp = skill.xp + grant.amount;

    // Cascading level-ups
    while (skill.level < MAX_SKILL_LEVEL && remainingXp >= skill.xpToNextLevel) {
      const overflow = remainingXp - skill.xpToNextLevel;
      const nextLevel = (skill.level + 1) as SkillLevel;
      levelUps.push({
        skillId: grant.skillId,
        fromLevel: skill.level,
        toLevel: nextLevel,
      });
      skill = {
        level: nextLevel,
        xp: overflow,
        xpToNextLevel: calculateXpToNextLevel(nextLevel),
      };
      remainingXp = overflow;
    }

    if (skill.level >= MAX_SKILL_LEVEL) {
      // Floor XP at the level-5 cap (silently — ADR-010 spec)
      updatedSkills[grant.skillId] = {
        ...skill,
        xp: Math.min(remainingXp, skill.xpToNextLevel),
      };
    } else {
      updatedSkills[grant.skillId] = {
        ...skill,
        xp: remainingXp,
      };
    }
  }

  return {
    updatedProfile: { ...profile, skills: updatedSkills },
    levelUps,
  };
}

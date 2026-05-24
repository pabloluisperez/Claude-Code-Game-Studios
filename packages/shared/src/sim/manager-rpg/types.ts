/**
 * Manager-RPG types — per ADR-010 §Key Interfaces.
 *
 * 5 skills tracked per playthrough's manager. Each skill has level (1-5) + xp.
 * XP is event-driven (not manually allocated) — see XP_SOURCES.
 *
 * Story: MANAGER-RPG-001/002
 * Control Manifest: 2026-05-19
 */

export type ManagerSkillId =
  | 'tactical_insight'    // match outcome quality (minor sim bonus)
  | 'man_management'      // player morale cascade nodes
  | 'financial_acumen'    // sponsor negotiations, business events
  | 'scouting_network'    // transfer market quality + information
  | 'reputation';         // gates max hirable staff qualityTier (P1↔P3)

export const MANAGER_SKILL_IDS: readonly ManagerSkillId[] = Object.freeze([
  'tactical_insight',
  'man_management',
  'financial_acumen',
  'scouting_network',
  'reputation',
]);

export type SkillLevel = 1 | 2 | 3 | 4 | 5;
export const MAX_SKILL_LEVEL: SkillLevel = 5;

export interface ManagerSkill {
  readonly level: SkillLevel;
  readonly xp: number;
  readonly xpToNextLevel: number;
}

export type ManagerSkills = Readonly<Record<ManagerSkillId, ManagerSkill>>;

export interface ManagerProfile {
  readonly id: string;
  readonly playthroughId: string;
  readonly name: string;
  readonly skills: ManagerSkills;
}

export interface XpGrant {
  readonly skillId: ManagerSkillId;
  readonly amount: number;
  readonly reason: string;
}

export interface SkillLevelUp {
  readonly skillId: ManagerSkillId;
  readonly fromLevel: SkillLevel;
  readonly toLevel: SkillLevel;
}

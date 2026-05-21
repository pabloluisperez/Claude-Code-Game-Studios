/**
 * Manager-RPG service — orchestrates XP grants inside advance().
 *
 * Per ADR-010 §Inline advance() Integration:
 *   1. Load manager profile
 *   2. computeXpGrants from event keys triggered this week
 *   3. applyXpGrants pure function → {updatedProfile, levelUps}
 *   4. UPDATE manager_profiles.skills + INSERT skill_xp_events batch (one tx)
 *   5. INSERT calendar_event(type='manager_level_up') for each level-up
 *
 * Story: MANAGER-RPG-005 (TR-MGR-005)
 * Control Manifest: 2026-05-19
 */

import {
  applyXpGrants,
  computeXpGrants,
  initManagerSkills,
  type ManagerProfile,
  type SkillLevelUp,
  type XpGrant,
} from '@smt/shared';
import type { db as DBType } from '@smt/db';
import * as Repo from './repo.js';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export interface AdvanceXpFlowArgs {
  readonly playthroughId: string;
  readonly week: number;
  readonly season: number;
  readonly eventKeysTriggered: readonly string[];
}

export interface AdvanceXpFlowResult {
  readonly grants: readonly XpGrant[];
  readonly levelUps: readonly SkillLevelUp[];
  readonly updatedProfile: ManagerProfile;
}

/**
 * Apply XP for the events triggered this advance() tick.
 * Caller owns the surrounding transaction.
 */
export async function applyAdvanceXpFlow(
  tx: Tx,
  args: Readonly<AdvanceXpFlowArgs>,
): Promise<AdvanceXpFlowResult | null> {
  const row = await Repo.findByPlaythrough(tx, args.playthroughId);
  if (!row) return null;

  const grants = computeXpGrants(args.eventKeysTriggered);
  if (grants.length === 0) {
    return {
      grants: [],
      levelUps: [],
      updatedProfile: {
        id: row.id,
        playthroughId: row.playthroughId,
        name: row.name,
        skills: row.skills as ManagerProfile['skills'],
      },
    };
  }

  const profile: ManagerProfile = {
    id: row.id,
    playthroughId: row.playthroughId,
    name: row.name,
    skills: row.skills as ManagerProfile['skills'],
  };
  const { updatedProfile, levelUps } = applyXpGrants(profile, grants);

  await Repo.updateSkills(tx, args.playthroughId, updatedProfile.skills);
  await Repo.insertXpEvents(
    tx,
    args.playthroughId,
    args.week,
    args.season,
    grants.map((g) => ({ skillId: g.skillId, xpGranted: g.amount, reason: g.reason })),
  );

  return { grants, levelUps, updatedProfile };
}

/** Initialise a manager profile at playthrough creation. */
export async function initialiseManagerProfile(
  tx: Tx,
  args: { readonly playthroughId: string; readonly name: string },
): Promise<{ id: string }> {
  return Repo.createProfile(tx, {
    playthroughId: args.playthroughId,
    name: args.name,
    skills: initManagerSkills(),
  });
}

/**
 * Staff-system service — hire/dismiss + weekly message generation.
 *
 * Per ADR-009 + ADR-010 (P1↔P3 gating):
 *   - hireStaff: rejects tier > getMaxHirableStaffQuality(managerRep)
 *   - Upgrading: dismisses prior staff in the same role for the same club
 *   - generateAndPersistMessages: runs perception engine, persists to DB
 *
 * Story: STAFF-SYSTEM-003 + 004 (TR-STAFF-003/004)
 * Control Manifest: 2026-05-19
 */

import { eq } from 'drizzle-orm';
import { managerProfiles } from '@smt/db';
import type { db as DBType } from '@smt/db';
import type { Staff } from '@smt/db';
import {
  generateStaffMessages,
  getMaxHirableStaffQuality,
  STAFF_WEEKLY_WAGE_EURK,
  type ManagerSkills,
  type MinimalStaffMember,
  type StaffRole,
  type StaffQualityTier,
  type ThresholdCrossing,
  type WorldState,
} from '@smt/shared';
import * as Repo from './repo.js';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

// ── Hiring ───────────────────────────────────────────────────────────────────

export interface HireStaffArgs {
  readonly playthroughId: string;
  readonly clubId: string;
  readonly role: StaffRole;
  readonly qualityTier: StaffQualityTier;
  readonly name: string;
  readonly hiredWeek: number;
}

export type HireOutcome =
  | { ok: true; id: string; replaced: string | null }
  | { ok: false; reason: 'manager_not_found' | 'tier_above_reputation_cap' };

/**
 * Hire a staff member of the given role/tier. If a prior active staff in the
 * same role exists for the club, it's dismissed first (upgrade pattern).
 *
 * Gates by manager reputation per ADR-010: tier ≤ getMaxHirableStaffQuality(rep).
 */
export async function hireStaff(
  tx: Tx,
  args: Readonly<HireStaffArgs>,
): Promise<HireOutcome> {
  // 1. Load manager profile for reputation check
  const mp = await tx
    .select()
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, args.playthroughId))
    .limit(1);
  const profile = mp[0];
  if (!profile) return { ok: false, reason: 'manager_not_found' };
  const skills = profile.skills as ManagerSkills;
  const maxTier = getMaxHirableStaffQuality(skills.reputation.level);
  if (args.qualityTier > maxTier) {
    return { ok: false, reason: 'tier_above_reputation_cap' };
  }

  // 2. Find + dismiss existing active staff in this role
  const existing = await Repo.findActiveByRole(tx, args.playthroughId, args.clubId, args.role);
  if (existing) {
    await Repo.dismissStaff(tx, existing.id);
  }

  // 3. Insert new staff
  const inserted = await Repo.createStaff(tx, {
    playthroughId: args.playthroughId,
    clubId: args.clubId,
    role: args.role,
    qualityTier: args.qualityTier,
    weeklyEurK: STAFF_WEEKLY_WAGE_EURK[args.qualityTier],
    name: args.name,
    hiredWeek: args.hiredWeek,
    status: 'active',
  });

  return { ok: true, id: inserted.id, replaced: existing?.id ?? null };
}

// ── Message generation (post-advance) ────────────────────────────────────────

export interface GenerateMessagesArgs {
  readonly playthroughId: string;
  readonly clubId: string;
  readonly week: number;
  readonly season: number;
  readonly prevWorldState: Readonly<WorldState>;
  readonly nextWorldState: Readonly<WorldState>;
  readonly thresholdCrossings: readonly ThresholdCrossing[];
}

/**
 * Run the perception engine for the club's active staff + persist any
 * resulting messages. Caller owns the surrounding transaction.
 *
 * Returns the count of messages persisted (URGENT + ROUTINE).
 */
export async function generateAndPersistMessages(
  tx: Tx,
  args: Readonly<GenerateMessagesArgs>,
): Promise<{ urgentCount: number; routineCount: number }> {
  const activeStaff: readonly Staff[] = await Repo.findActiveStaff(
    tx,
    args.playthroughId,
    args.clubId,
  );
  if (activeStaff.length === 0) {
    return { urgentCount: 0, routineCount: 0 };
  }

  const minimalStaff: MinimalStaffMember[] = activeStaff.map((s) => ({
    id: s.id,
    role: s.role as StaffRole,
    qualityTier: s.qualityTier as StaffQualityTier,
  }));

  // Build worldStateDiff (only changed nodes)
  const diff: Record<string, { prev: number; next: number }> = {};
  for (const key of Object.keys(args.nextWorldState)) {
    const k = key as keyof WorldState;
    const prev = args.prevWorldState[k];
    const next = args.nextWorldState[k];
    if (prev !== undefined && next !== undefined && prev !== next) {
      diff[key] = { prev, next };
    }
  }

  const generated = generateStaffMessages({
    staff: minimalStaff,
    worldStateDiff: diff,
    thresholdCrossings: args.thresholdCrossings,
  });

  if (generated.length === 0) {
    return { urgentCount: 0, routineCount: 0 };
  }

  await Repo.insertMessages(
    tx,
    generated.map((m) => ({
      playthroughId: args.playthroughId,
      staffId: m.staffId,
      week: args.week,
      season: args.season,
      priority: m.priority,
      templateKey: m.templateKey,
      content: m.content,
      isRead: false,
    })),
  );

  let urgent = 0;
  let routine = 0;
  for (const m of generated) {
    if (m.priority === 'URGENT') urgent += 1;
    else routine += 1;
  }
  return { urgentCount: urgent, routineCount: routine };
}

/**
 * Manager-RPG repository — owns reads/writes to manager_profiles + skill_xp_events.
 *
 * Story: MANAGER-RPG-005 (TR-MGR-005)
 * Control Manifest: 2026-05-19
 */

import { and, desc, eq } from 'drizzle-orm';
import type {
  ManagerProfileRow,
  NewManagerProfileRow,
  NewSkillXpEventRow,
  SkillXpEventRow,
} from '@smt/db';
import { managerProfiles, skillXpEvents } from '@smt/db';
import type { db as DBType } from '@smt/db';
import type { ManagerSkills } from '@smt/shared';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export async function createProfile(
  tx: Tx,
  row: Omit<NewManagerProfileRow, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ id: string }> {
  const inserted = await tx
    .insert(managerProfiles)
    .values(row)
    .returning({ id: managerProfiles.id });
  return inserted[0]!;
}

export async function findByPlaythrough(
  tx: Tx,
  playthroughId: string,
): Promise<ManagerProfileRow | null> {
  const rows = await tx
    .select()
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, playthroughId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSkills(
  tx: Tx,
  playthroughId: string,
  skills: ManagerSkills,
): Promise<void> {
  await tx
    .update(managerProfiles)
    .set({ skills })
    .where(eq(managerProfiles.playthroughId, playthroughId));
}

export async function insertXpEvents(
  tx: Tx,
  playthroughId: string,
  week: number,
  season: number,
  events: ReadonlyArray<{ readonly skillId: string; readonly xpGranted: number; readonly reason: string }>,
): Promise<void> {
  if (events.length === 0) return;
  const rows: NewSkillXpEventRow[] = events.map((e) => ({
    playthroughId,
    week,
    season,
    skillId: e.skillId,
    xpGranted: e.xpGranted,
    reason: e.reason,
  }));
  await tx.insert(skillXpEvents).values(rows);
}

/** Career log feed — most-recent N events for hud-ui. */
export async function getRecentXpEvents(
  tx: Tx,
  playthroughId: string,
  limit = 50,
): Promise<readonly SkillXpEventRow[]> {
  return tx
    .select()
    .from(skillXpEvents)
    .where(eq(skillXpEvents.playthroughId, playthroughId))
    .orderBy(desc(skillXpEvents.createdAt))
    .limit(limit);
}

/** Filter by skill (used by per-skill drill-downs). */
export async function getRecentXpEventsBySkill(
  tx: Tx,
  playthroughId: string,
  skillId: string,
  limit = 30,
): Promise<readonly SkillXpEventRow[]> {
  return tx
    .select()
    .from(skillXpEvents)
    .where(
      and(
        eq(skillXpEvents.playthroughId, playthroughId),
        eq(skillXpEvents.skillId, skillId),
      ),
    )
    .orderBy(desc(skillXpEvents.createdAt))
    .limit(limit);
}

/**
 * Repository for self-service user operations (GDPR export + deletion).
 *
 * Story v1.0.x (sprint 16 adelantado).
 *
 * Note on cascade deletion: el schema ya define `onDelete: 'cascade'` en
 * playthroughs.userId → users.id (ver packages/db/src/schema/playthroughs.ts).
 * Eliminar la fila de `users` arrastra todas las dependencias tabla a tabla
 * automáticamente. Esta función NO necesita borrar manualmente cada tabla.
 *
 * Note on cross-module DB access in exportUserData: GDPR export is the
 * documented exception — reading across all tables IS the purpose. The
 * existing code already read worldSnapshots/calendarEvents directly; this
 * expands that established pattern to bundle all user-owned data.
 */

import { eq, or, inArray, type Column } from 'drizzle-orm';
import {
  db,
  users,
  playthroughs,
  worldSnapshots,
  calendarEvents,
  clubs,
  players,
  staff,
  stadiumUpgradeItems,
  tvContracts,
  sponsors,
  fixtures,
  standings,
  careerMilestones,
  managerProfiles,
  skillXpEvents,
} from '@smt/db';

/** Cooldown antes de que un delete-request se ejecute. */
export const DELETION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type ExportBundle = {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    createdAt: string;
  };
  playthroughs: Array<{
    id: string;
    clubId: string;
    currentWeek: number;
    currentDayOfSeason: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
  clubs: Array<unknown>;
  players: Array<unknown>;
  staff: Array<unknown>;
  stadiumUpgradeItems: Array<unknown>;
  tvContracts: Array<unknown>;
  sponsors: Array<unknown>;
  fixtures: Array<unknown>;
  standings: Array<unknown>;
  milestones: Array<unknown>;
  managerProfiles: Array<unknown>;
  skillXpEvents: Array<unknown>;
  worldSnapshots: Array<unknown>;
  calendarEvents: Array<unknown>;
};

/**
 * Build a complete data bundle for the authenticated user.
 * Bytes-stable so the user gets the same dump for the same DB state.
 */
export async function exportUserData(userId: string): Promise<ExportBundle> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // --- playthroughs (owned directly by userId) ---
  const ptRows = await db
    .select({
      id: playthroughs.id,
      clubId: playthroughs.clubId,
      currentWeek: playthroughs.currentWeek,
      currentDayOfSeason: playthroughs.currentDayOfSeason,
      createdAt: playthroughs.createdAt,
      updatedAt: playthroughs.updatedAt,
    })
    .from(playthroughs)
    .where(eq(playthroughs.userId, userId));

  const ptIds = ptRows.map((p) => p.id);

  // --- clubs (where managerId = userId) ---
  const clubRows = await db
    .select()
    .from(clubs)
    .where(eq(clubs.managerId, userId));

  const clubIds = clubRows.map((c) => c.id);

  // --- tables keyed by playthroughId ---
  const wsRows = ptIds.length
    ? await db
        .select()
        .from(worldSnapshots)
        .where(inAny(worldSnapshots.playthroughId, ptIds))
    : [];

  const ceRows = ptIds.length
    ? await db
        .select()
        .from(calendarEvents)
        .where(inAny(calendarEvents.playthroughId, ptIds))
    : [];

  const staffRows = ptIds.length
    ? await db
        .select()
        .from(staff)
        .where(inAny(staff.playthroughId, ptIds))
    : [];

  const tvContractRows = ptIds.length
    ? await db
        .select()
        .from(tvContracts)
        .where(inAny(tvContracts.playthroughId, ptIds))
    : [];

  const sponsorRows = ptIds.length
    ? await db
        .select()
        .from(sponsors)
        .where(inAny(sponsors.playthroughId, ptIds))
    : [];

  const milestoneRows = ptIds.length
    ? await db
        .select()
        .from(careerMilestones)
        .where(inAny(careerMilestones.playthroughId, ptIds))
    : [];

  const managerProfileRows = ptIds.length
    ? await db
        .select()
        .from(managerProfiles)
        .where(inAny(managerProfiles.playthroughId, ptIds))
    : [];

  const skillXpRows = ptIds.length
    ? await db
        .select()
        .from(skillXpEvents)
        .where(inAny(skillXpEvents.playthroughId, ptIds))
    : [];

  // --- tables keyed by clubId ---
  const playerRows = clubIds.length
    ? await db
        .select()
        .from(players)
        .where(inAny(players.clubId, clubIds))
    : [];

  const stadiumUpgradeRows = clubIds.length
    ? await db
        .select()
        .from(stadiumUpgradeItems)
        .where(inAny(stadiumUpgradeItems.clubId, clubIds))
    : [];

  const standingRows = clubIds.length
    ? await db
        .select()
        .from(standings)
        .where(inAny(standings.clubId, clubIds))
    : [];

  // fixtures — user's clubs appear as either home or away
  const fixtureRows =
    clubIds.length
      ? await db
          .select()
          .from(fixtures)
          .where(
            or(
              inArray(fixtures.homeClubId, clubIds),
              inArray(fixtures.awayClubId, clubIds),
            ),
          )
      : [];

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    },
    playthroughs: ptRows.map((p) => ({
      id: p.id,
      clubId: p.clubId,
      currentWeek: p.currentWeek,
      currentDayOfSeason: p.currentDayOfSeason,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    clubs: clubRows,
    players: playerRows,
    staff: staffRows,
    stadiumUpgradeItems: stadiumUpgradeRows,
    tvContracts: tvContractRows,
    sponsors: sponsorRows,
    fixtures: fixtureRows,
    standings: standingRows,
    milestones: milestoneRows,
    managerProfiles: managerProfileRows,
    skillXpEvents: skillXpRows,
    worldSnapshots: wsRows,
    calendarEvents: ceRows,
  };
}

function inAny<T>(col: Column, vals: readonly T[]) {
  return inArray(col, vals as T[]);
}

export type DeletionStatus =
  | { state: 'none' }
  | { state: 'pending'; cooldownEndsAt: string }
  | { state: 'ready'; cooldownEndsAt: string };

export async function getDeletionStatus(userId: string): Promise<DeletionStatus> {
  const [row] = await db
    .select({ deletionRequestedAt: users.deletionRequestedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!row?.deletionRequestedAt) return { state: 'none' };
  const cooldownEndsAt = new Date(
    row.deletionRequestedAt.getTime() + DELETION_COOLDOWN_MS,
  );
  return {
    state: cooldownEndsAt.getTime() <= Date.now() ? 'ready' : 'pending',
    cooldownEndsAt: cooldownEndsAt.toISOString(),
  };
}

export async function requestUserDeletion(userId: string): Promise<{
  cooldownEndsAt: string;
}> {
  const now = new Date();
  await db
    .update(users)
    .set({ deletionRequestedAt: now })
    .where(eq(users.id, userId));
  return {
    cooldownEndsAt: new Date(now.getTime() + DELETION_COOLDOWN_MS).toISOString(),
  };
}

export async function cancelUserDeletion(userId: string): Promise<boolean> {
  const [before] = await db
    .select({ deletionRequestedAt: users.deletionRequestedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!before?.deletionRequestedAt) return false;
  await db
    .update(users)
    .set({ deletionRequestedAt: null })
    .where(eq(users.id, userId));
  return true;
}

export type ExecuteDeletionResult =
  | { status: 'deleted' }
  | { status: 'cooldown_active'; cooldownEndsAt: string }
  | { status: 'no_request' };

export async function executeUserDeletion(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<ExecuteDeletionResult> {
  const status = await getDeletionStatus(userId);
  if (status.state === 'none' && !opts.force) return { status: 'no_request' };
  if (status.state === 'pending' && !opts.force) {
    return { status: 'cooldown_active', cooldownEndsAt: status.cooldownEndsAt };
  }
  // CASCADE en playthroughs + downstream tables borra todo lo demás.
  await db.delete(users).where(eq(users.id, userId));
  return { status: 'deleted' };
}

/**
 * Repository for self-service user operations (GDPR export + deletion).
 *
 * Story v1.0.x (sprint 16 adelantado).
 *
 * Note on cascade deletion: el schema ya define `onDelete: 'cascade'` en
 * playthroughs.userId → users.id (ver packages/db/src/schema/playthroughs.ts).
 * Eliminar la fila de `users` arrastra todas las dependencias tabla a tabla
 * automáticamente. Esta función NO necesita borrar manualmente cada tabla.
 */

import { eq } from 'drizzle-orm';
import { db, users, playthroughs, worldSnapshots, calendarEvents } from '@smt/db';

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
    worldSnapshots: wsRows,
    calendarEvents: ceRows,
  };
}

import { inArray, type Column } from 'drizzle-orm';

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

/**
 * Stadium upgrades Drizzle repo. Story STADIUM-UPGRADES-005.
 *
 * Thin wrapper around the schema; service.ts orchestrates business logic.
 * All mutating methods accept a Drizzle `tx` so they can run inside a
 * transaction.
 */

import { eq, and, sql } from 'drizzle-orm';
import type { db as Db } from '@smt/db';
import { stadiumUpgradeItems } from '@smt/db';

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0] | typeof Db;

export type StadiumUpgradeItemRow = typeof stadiumUpgradeItems.$inferSelect;
export type NewStadiumUpgradeItemRow = typeof stadiumUpgradeItems.$inferInsert;

/** Return the single in_progress item for a club, or null. */
export async function getActive(tx: Tx, clubId: string): Promise<StadiumUpgradeItemRow | null> {
  const rows = await tx
    .select()
    .from(stadiumUpgradeItems)
    .where(and(eq(stadiumUpgradeItems.clubId, clubId), eq(stadiumUpgradeItems.status, 'in_progress')))
    .limit(1);
  return rows[0] ?? null;
}

/** Return all complete items for a club, oldest first. */
export async function getCompleted(tx: Tx, clubId: string): Promise<StadiumUpgradeItemRow[]> {
  return tx
    .select()
    .from(stadiumUpgradeItems)
    .where(and(eq(stadiumUpgradeItems.clubId, clubId), eq(stadiumUpgradeItems.status, 'complete')));
}

/** Insert a new row in `in_progress` state. Returns the new row's id. */
export async function insertInProgress(
  tx: Tx,
  params: Omit<NewStadiumUpgradeItemRow, 'id' | 'createdAt' | 'status'>,
): Promise<string> {
  const [inserted] = await tx
    .insert(stadiumUpgradeItems)
    .values({
      ...params,
      status: 'in_progress',
      startedAt: new Date(),
    })
    .returning({ id: stadiumUpgradeItems.id });
  if (!inserted) throw new Error('insertInProgress failed: no row returned');
  return inserted.id;
}

/** Find a row by primary key. */
export async function findById(tx: Tx, id: string): Promise<StadiumUpgradeItemRow | null> {
  const rows = await tx
    .select()
    .from(stadiumUpgradeItems)
    .where(eq(stadiumUpgradeItems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Mark a row as a given status, setting timestamp fields atomically. */
export async function updateStatus(
  tx: Tx,
  id: string,
  status: 'complete' | 'cancelled',
  fields: { completedAt?: Date; cancelledAt?: Date } = {},
): Promise<void> {
  await tx
    .update(stadiumUpgradeItems)
    .set({
      status,
      ...(fields.completedAt ? { completedAt: fields.completedAt } : {}),
      ...(fields.cancelledAt ? { cancelledAt: fields.cancelledAt } : {}),
    })
    .where(eq(stadiumUpgradeItems.id, id));
}

/** Decrement weeks_remaining by 1 atomically; returns the new value. */
export async function decrementWeeksRemaining(tx: Tx, id: string): Promise<number> {
  const [row] = await tx
    .update(stadiumUpgradeItems)
    .set({ weeksRemaining: sql`${stadiumUpgradeItems.weeksRemaining} - 1` })
    .where(eq(stadiumUpgradeItems.id, id))
    .returning({ weeksRemaining: stadiumUpgradeItems.weeksRemaining });
  if (!row?.weeksRemaining === undefined) throw new Error('decrementWeeksRemaining failed: no row returned');
  return row?.weeksRemaining ?? 0;
}

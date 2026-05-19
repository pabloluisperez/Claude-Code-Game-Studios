/**
 * Staff-system repository — owns reads/writes to staff + staff_messages.
 *
 * Story: STAFF-SYSTEM-003 + 005
 * Control Manifest: 2026-05-19
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { NewStaff, Staff, NewStaffMessage, StaffMessage } from '@smt/db';
import { staff, staffMessages } from '@smt/db';
import type { db as DBType } from '@smt/db';
import type { StaffRole, StaffQualityTier } from '@smt/shared';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

// ── staff ─────────────────────────────────────────────────────────────────────

export async function createStaff(
  tx: Tx,
  row: Omit<NewStaff, 'id' | 'createdAt'>,
): Promise<{ id: string }> {
  const inserted = await tx.insert(staff).values(row).returning({ id: staff.id });
  return inserted[0]!;
}

export async function findActiveStaff(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<readonly Staff[]> {
  return tx
    .select()
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, playthroughId),
        eq(staff.clubId, clubId),
        eq(staff.status, 'active'),
      ),
    );
}

export async function findActiveByRole(
  tx: Tx,
  playthroughId: string,
  clubId: string,
  role: StaffRole,
): Promise<Staff | null> {
  const rows = await tx
    .select()
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, playthroughId),
        eq(staff.clubId, clubId),
        eq(staff.role, role),
        eq(staff.status, 'active'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function dismissStaff(tx: Tx, staffId: string): Promise<void> {
  await tx.update(staff).set({ status: 'dismissed' }).where(eq(staff.id, staffId));
}

// ── staff_messages ───────────────────────────────────────────────────────────

export async function insertMessages(
  tx: Tx,
  rows: ReadonlyArray<Omit<NewStaffMessage, 'id' | 'createdAt'>>,
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(staffMessages).values([...rows]);
}

export async function getMessagesSince(
  tx: Tx,
  playthroughId: string,
  sinceWeek: number,
  limit = 200,
): Promise<readonly StaffMessage[]> {
  return tx
    .select()
    .from(staffMessages)
    .where(eq(staffMessages.playthroughId, playthroughId))
    .orderBy(desc(staffMessages.createdAt))
    .limit(limit);
}

export async function markMessagesRead(
  tx: Tx,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(staffMessages)
    .set({ isRead: true })
    .where(inArray(staffMessages.id, [...ids]));
}

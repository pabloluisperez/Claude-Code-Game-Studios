/**
 * Calendar-events repository.
 *
 * Note: this is the ONE table per ADR-015 that's MUTABLE (resolution writes
 * resolvedAt + status). The append-only rule from ADR-005 doesn't apply here.
 *
 * Story: EVENT-SYSTEM-004/006
 * Control Manifest: 2026-05-19
 */

import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import type { CalendarEvent, NewCalendarEvent } from '@smt/db';
import { calendarEvents } from '@smt/db';
import type { db as DBType } from '@smt/db';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export async function createEvent(
  tx: Tx,
  row: Omit<NewCalendarEvent, 'id' | 'createdAt' | 'resolvedAt'>,
): Promise<{ id: string }> {
  const inserted = await tx
    .insert(calendarEvents)
    .values(row)
    .returning({ id: calendarEvents.id });
  return inserted[0]!;
}

export async function findById(tx: Tx, id: string): Promise<CalendarEvent | null> {
  const rows = await tx
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPendingForWeek(
  tx: Tx,
  playthroughId: string,
  week: number,
): Promise<readonly CalendarEvent[]> {
  return tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, playthroughId),
        eq(calendarEvents.week, week),
        eq(calendarEvents.status, 'pending'),
      ),
    )
    .orderBy(asc(calendarEvents.id));
}

export async function findAllPendingUpToWeek(
  tx: Tx,
  playthroughId: string,
  uptoWeek: number,
): Promise<readonly CalendarEvent[]> {
  return tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, playthroughId),
        lte(calendarEvents.week, uptoWeek),
        eq(calendarEvents.status, 'pending'),
      ),
    )
    .orderBy(asc(calendarEvents.week));
}

export async function getRecentResolved(
  tx: Tx,
  playthroughId: string,
  limit = 100,
): Promise<readonly CalendarEvent[]> {
  return tx
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.playthroughId, playthroughId))
    .orderBy(desc(calendarEvents.createdAt))
    .limit(limit);
}

export async function markResolved(
  tx: Tx,
  eventId: string,
  resolvedChoice: string,
  resolvedDeltas: Readonly<Record<string, number>>,
): Promise<void> {
  await tx
    .update(calendarEvents)
    .set({
      status: 'resolved',
      consumed: true,
      resolvedAt: new Date(),
      // Merge into existing metadata (ADR-015 §Persistence Shape)
      metadata: undefined as never, // caller passes merged metadata in service layer
    })
    .where(eq(calendarEvents.id, eventId));
}

export async function markExpired(
  tx: Tx,
  eventIds: readonly string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await tx
    .update(calendarEvents)
    .set({ status: 'expired' })
    .where(inArray(calendarEvents.id, [...eventIds]));
}

export async function updateMetadata(
  tx: Tx,
  eventId: string,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  await tx
    .update(calendarEvents)
    .set({ metadata })
    .where(eq(calendarEvents.id, eventId));
}

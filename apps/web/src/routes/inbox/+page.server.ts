/**
 * Inbox — full history of staff messages + calendar events.
 *
 * Story: Topbar envelope → inbox
 * Control Manifest: 2026-05-20
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  db,
  staffMessages,
  staff,
  calendarEvents,
  eq,
  desc,
} from '@smt/db';
import { weekToDate } from '@smt/shared';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };

  const messages = await db
    .select({
      id: staffMessages.id,
      role: staff.role,
      name: staff.name,
      tier: staff.qualityTier,
      priority: staffMessages.priority,
      content: staffMessages.content,
      week: staffMessages.week,
      isRead: staffMessages.isRead,
      createdAt: staffMessages.createdAt,
    })
    .from(staffMessages)
    .innerJoin(staff, eq(staff.id, staffMessages.staffId))
    .where(eq(staffMessages.playthroughId, activePlaythrough.id))
    .orderBy(desc(staffMessages.createdAt))
    .limit(100);

  const events = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.playthroughId, activePlaythrough.id))
    .orderBy(desc(calendarEvents.week))
    .limit(50);

  return {
    hasPlaythrough: true as const,
    messages: messages.map((m) => ({
      ...m,
      date: weekToDate(m.week),
    })),
    events: events.map((e) => ({
      ...e,
      date: weekToDate(e.week),
    })),
  };
};

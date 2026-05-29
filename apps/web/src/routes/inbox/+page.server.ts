/**
 * Inbox — full history of staff messages + calendar events.
 *
 * Story: Topbar envelope → inbox
 * Control Manifest: 2026-05-20
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  staffMessages,
  staff,
  calendarEvents,
  playthroughs,
  eq,
  and,
  lt,
  desc,
} from '@smt/db';
import { weekToDate } from '@smt/shared';

/**
 * Bug F fix (playtest 2026-05-21 Pablo): 'Los mensajes antiguos que pierdan
 * validez por nuevos deberían marcarse como leídos solos.' Since staff
 * messages have no metadata pointing to specific events, the heuristic is:
 * after N weeks the world has moved on. Auto-mark as read.
 */
const STAFF_MESSAGE_STALENESS_WEEKS = 3;

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };

  // Auto-mark stale unread messages as read (bug F fix).
  const staleCutoffWeek = activePlaythrough.currentWeek - STAFF_MESSAGE_STALENESS_WEEKS;
  if (staleCutoffWeek > 0) {
    await db
      .update(staffMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(staffMessages.playthroughId, activePlaythrough.id),
          eq(staffMessages.isRead, false),
          lt(staffMessages.week, staleCutoffWeek),
        ),
      );
  }

  const messages = await db
    .select({
      id: staffMessages.id,
      role: staff.role,
      name: staff.name,
      tier: staff.qualityTier,
      priority: staffMessages.priority,
      templateKey: staffMessages.templateKey,
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

export const actions: Actions = {
  markRead: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Falta id.' });

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db
      .update(staffMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(staffMessages.id, id),
          eq(staffMessages.playthroughId, active.id),
        ),
      );
    return { ok: true };
  },

  markAllRead: async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db
      .update(staffMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(staffMessages.playthroughId, active.id),
          eq(staffMessages.isRead, false),
        ),
      );
    return { ok: true };
  },
};

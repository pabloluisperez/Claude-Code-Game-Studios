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

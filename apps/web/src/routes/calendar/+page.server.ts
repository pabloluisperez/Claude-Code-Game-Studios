import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, calendarEvents, eq, asc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const events = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.playthroughId, activePlaythrough.id))
    .orderBy(asc(calendarEvents.week));

  return { hasPlaythrough: true as const, events };
};

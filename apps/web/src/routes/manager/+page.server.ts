import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, managerProfiles, skillXpEvents, eq, desc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const [profile] = await db
    .select()
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, activePlaythrough.id))
    .limit(1);

  const log = await db
    .select()
    .from(skillXpEvents)
    .where(eq(skillXpEvents.playthroughId, activePlaythrough.id))
    .orderBy(desc(skillXpEvents.createdAt))
    .limit(20);

  return {
    hasPlaythrough: true as const,
    profile: profile ?? null,
    log,
  };
};

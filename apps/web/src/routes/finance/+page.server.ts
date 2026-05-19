import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, worldSnapshots, sponsors, eq, desc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const snapshots = await db
    .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, activePlaythrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(4);

  const sponsorRows = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.playthroughId, activePlaythrough.id))
    .orderBy(desc(sponsors.tier));

  return {
    hasPlaythrough: true as const,
    snapshots: snapshots.map((s) => ({
      week: s.week,
      state: s.worldState as Record<string, number>,
    })),
    sponsors: sponsorRows,
  };
};

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, players, eq, asc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const, players: [], currentWeek: 0 };
  }

  const rows = await db
    .select()
    .from(players)
    .where(eq(players.clubId, activePlaythrough.clubId))
    .orderBy(asc(players.position), asc(players.lastName));

  return {
    hasPlaythrough: true as const,
    players: rows,
    currentWeek: activePlaythrough.currentWeek,
  };
};

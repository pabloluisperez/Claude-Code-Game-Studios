import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, standings, fixtures, eq, and, or, desc, asc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  // Find the user's club standing to determine their season/division.
  const [myStanding] = await db
    .select()
    .from(standings)
    .where(eq(standings.clubId, activePlaythrough.clubId))
    .orderBy(desc(standings.updatedAt))
    .limit(1);

  if (!myStanding) {
    return {
      hasPlaythrough: true as const,
      standings: [],
      fixtures: [],
      myClubId: activePlaythrough.clubId,
    };
  }

  const standingsRows = await db
    .select()
    .from(standings)
    .where(
      and(
        eq(standings.seasonId, myStanding.seasonId),
        eq(standings.divisionId, myStanding.divisionId),
      ),
    )
    .orderBy(desc(standings.points));

  const fixtureRows = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.seasonId, myStanding.seasonId),
        or(
          eq(fixtures.homeClubId, activePlaythrough.clubId),
          eq(fixtures.awayClubId, activePlaythrough.clubId),
        ),
      ),
    )
    .orderBy(asc(fixtures.week))
    .limit(10);

  return {
    hasPlaythrough: true as const,
    standings: standingsRows,
    fixtures: fixtureRows,
    myClubId: activePlaythrough.clubId,
  };
};

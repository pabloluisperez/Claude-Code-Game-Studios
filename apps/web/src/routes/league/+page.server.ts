import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  db,
  standings,
  fixtures,
  clubs,
  leagues,
  seasons,
  eq,
  and,
  desc,
  asc,
  alias,
} from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  // Find the league + active season for THIS playthrough (no reliance on
  // standings.updatedAt which doesn't get touched until a match is played).
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, activePlaythrough.id))
    .limit(1);

  if (!league) {
    return {
      hasPlaythrough: true as const,
      standings: [],
      pastFixtures: [],
      upcomingFixtures: [],
      currentWeek: activePlaythrough.currentWeek,
      myClubId: activePlaythrough.clubId,
    };
  }

  const [activeSeason] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  if (!activeSeason) {
    return {
      hasPlaythrough: true as const,
      standings: [],
      pastFixtures: [],
      upcomingFixtures: [],
      currentWeek: activePlaythrough.currentWeek,
      myClubId: activePlaythrough.clubId,
    };
  }

  // Standings JOIN clubs for human-readable names.
  const standingsRows = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
      city: clubs.city,
      played: standings.played,
      wins: standings.wins,
      draws: standings.draws,
      losses: standings.losses,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
      points: standings.points,
    })
    .from(standings)
    .innerJoin(clubs, eq(clubs.id, standings.clubId))
    .where(
      and(
        eq(standings.seasonId, activeSeason.id),
        eq(standings.divisionId, activeSeason.divisionId),
      ),
    )
    .orderBy(desc(standings.points), desc(standings.goalsFor));

  // Fixtures JOIN home + away clubs.
  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const allFixtures = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      matchday: fixtures.matchday,
      status: fixtures.status,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      matchOutcomeData: fixtures.matchOutcomeData,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(eq(fixtures.seasonId, activeSeason.id))
    .orderBy(asc(fixtures.week), asc(fixtures.matchday));

  const pastFixtures = allFixtures.filter((f) => f.status === 'played');
  const upcomingFixtures = allFixtures.filter((f) => f.status !== 'played');

  return {
    hasPlaythrough: true as const,
    standings: standingsRows,
    pastFixtures,
    upcomingFixtures,
    currentWeek: activePlaythrough.currentWeek,
    myClubId: activePlaythrough.clubId,
  };
};

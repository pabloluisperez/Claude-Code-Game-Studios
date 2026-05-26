import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  db,
  standings,
  fixtures,
  clubs,
  leagues,
  seasons,
  divisions,
  eq,
  and,
  desc,
  asc,
  alias,
} from '@smt/db';

export const load: PageServerLoad = async ({ parent, url }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  // Resolve user's club's tier + group_index for default view.
  const [myClub] = await db
    .select({ tier: clubs.tier, groupIndex: clubs.groupIndex })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  // Query params override the default; clamp to valid ranges.
  const qTier = Number(url.searchParams.get('tier') ?? '');
  const qGroup = Number(url.searchParams.get('group') ?? '');
  const viewingTier = Number.isInteger(qTier) && qTier >= 1 && qTier <= 5 ? qTier : (myClub?.tier ?? 5);
  const viewingGroup = Number.isInteger(qGroup) && qGroup >= 0 ? qGroup : (myClub?.groupIndex ?? 0);

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
      divisionName: 'Liga',
      seasonNumber: 1,
      viewingTier,
      viewingGroup,
      myTier: myClub?.tier ?? 5,
      myGroup: myClub?.groupIndex ?? 0,
      isMyDivision: true,
      availableDivisions: [],
    };
  }

  // Resolve the viewing division.
  const [viewingDivision] = await db
    .select({ id: divisions.id, name: divisions.name, tier: divisions.tier, groupIndex: divisions.groupIndex })
    .from(divisions)
    .where(
      and(
        eq(divisions.leagueId, league.id),
        eq(divisions.tier, viewingTier),
        eq(divisions.groupIndex, viewingGroup),
      ),
    )
    .limit(1);

  if (!viewingDivision) {
    return {
      hasPlaythrough: true as const,
      standings: [],
      pastFixtures: [],
      upcomingFixtures: [],
      currentWeek: activePlaythrough.currentWeek,
      myClubId: activePlaythrough.clubId,
      divisionName: 'Liga',
      seasonNumber: 1,
      viewingTier,
      viewingGroup,
      myTier: myClub?.tier ?? 5,
      myGroup: myClub?.groupIndex ?? 0,
      isMyDivision: false,
      availableDivisions: [],
    };
  }

  // Active season for viewing division.
  const [viewingSeason] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.divisionId, viewingDivision.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  // List all divisions in this league (for nav dropdowns).
  const allDivisions = await db
    .select({ id: divisions.id, tier: divisions.tier, groupIndex: divisions.groupIndex, name: divisions.name })
    .from(divisions)
    .where(eq(divisions.leagueId, league.id))
    .orderBy(asc(divisions.tier), asc(divisions.groupIndex));

  if (!viewingSeason) {
    return {
      hasPlaythrough: true as const,
      standings: [],
      pastFixtures: [],
      upcomingFixtures: [],
      currentWeek: activePlaythrough.currentWeek,
      myClubId: activePlaythrough.clubId,
      divisionName: viewingDivision.name,
      seasonNumber: 1,
      viewingTier,
      viewingGroup,
      myTier: myClub?.tier ?? 5,
      myGroup: myClub?.groupIndex ?? 0,
      isMyDivision: viewingTier === (myClub?.tier ?? 5) && viewingGroup === (myClub?.groupIndex ?? 0),
      availableDivisions: allDivisions,
    };
  }

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
        eq(standings.seasonId, viewingSeason.id),
        eq(standings.divisionId, viewingDivision.id),
      ),
    )
    .orderBy(desc(standings.points), desc(standings.goalsFor));

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
    .where(eq(fixtures.seasonId, viewingSeason.id))
    .orderBy(asc(fixtures.week), asc(fixtures.matchday));

  const pastFixtures = allFixtures.filter((f) => f.status === 'played');
  const upcomingFixtures = allFixtures.filter((f) => f.status !== 'played');

  const isMyDivision =
    viewingTier === (myClub?.tier ?? 5) && viewingGroup === (myClub?.groupIndex ?? 0);

  return {
    hasPlaythrough: true as const,
    standings: standingsRows,
    pastFixtures,
    upcomingFixtures,
    currentWeek: activePlaythrough.currentWeek,
    myClubId: activePlaythrough.clubId,
    divisionName: viewingDivision.name,
    seasonNumber: viewingSeason.seasonNumber,
    viewingTier,
    viewingGroup,
    myTier: myClub?.tier ?? 5,
    myGroup: myClub?.groupIndex ?? 0,
    isMyDivision,
    availableDivisions: allDivisions,
  };
};

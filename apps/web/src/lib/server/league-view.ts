/**
 * Shared league-view loader for /league (Clasificación) and /matches (Partidos).
 * Pablo 2026-05-26: split fixtures into their own route under Liga; both pages
 * read the same data (standings + fixtures + division nav), differing only in
 * presentation.
 */

import {
  db,
  standings,
  fixtures,
  clubs,
  leagues,
  seasons,
  divisions,
  players as playersTable,
  eq,
  and,
  desc,
  asc,
  alias,
  inArray,
} from '@smt/db';

export interface ActivePlaythroughLike {
  id: string;
  clubId: string;
  currentWeek: number;
}

export async function loadLeagueView(
  activePlaythrough: ActivePlaythroughLike,
  url: URL,
) {
  const [myClub] = await db
    .select({ tier: clubs.tier, groupIndex: clubs.groupIndex })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  const qTier = Number(url.searchParams.get('tier') ?? '');
  const qGroup = Number(url.searchParams.get('group') ?? '');
  const viewingTier = Number.isInteger(qTier) && qTier >= 1 && qTier <= 5 ? qTier : (myClub?.tier ?? 5);
  const viewingGroup = Number.isInteger(qGroup) && qGroup >= 0 ? qGroup : (myClub?.groupIndex ?? 0);

  const emptyBase = {
    hasPlaythrough: true as const,
    standings: [] as never[],
    pastFixtures: [] as never[],
    upcomingFixtures: [] as never[],
    currentWeek: activePlaythrough.currentWeek,
    myClubId: activePlaythrough.clubId,
    divisionName: 'Liga',
    seasonNumber: 1,
    viewingTier,
    viewingGroup,
    myTier: myClub?.tier ?? 5,
    myGroup: myClub?.groupIndex ?? 0,
    isMyDivision: true,
    availableDivisions: [] as Array<{ id: string; tier: number; groupIndex: number; name: string }>,
    playerNameMap: {} as Record<string, string>,
  };

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, activePlaythrough.id))
    .limit(1);
  if (!league) return emptyBase;

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
  if (!viewingDivision) return { ...emptyBase, isMyDivision: false };

  const [viewingSeason] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.divisionId, viewingDivision.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const allDivisions = await db
    .select({ id: divisions.id, tier: divisions.tier, groupIndex: divisions.groupIndex, name: divisions.name })
    .from(divisions)
    .where(eq(divisions.leagueId, league.id))
    .orderBy(asc(divisions.tier), asc(divisions.groupIndex));

  const isMyDivision =
    viewingTier === (myClub?.tier ?? 5) && viewingGroup === (myClub?.groupIndex ?? 0);

  if (!viewingSeason) {
    return {
      ...emptyBase,
      divisionName: viewingDivision.name,
      isMyDivision,
      availableDivisions: allDivisions,
    };
  }

  const standingsRows = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
      city: clubs.city,
      kitPrimaryColor: clubs.kitPrimaryColor,
      kitSecondaryColor: clubs.kitSecondaryColor,
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
    .where(and(eq(standings.seasonId, viewingSeason.id), eq(standings.divisionId, viewingDivision.id)))
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

  const playerIds = new Set<string>();
  for (const f of pastFixtures) {
    const evts = (f.matchOutcomeData as { events?: Array<{ playerId?: string }> } | null)?.events ?? [];
    for (const e of evts) if (e.playerId) playerIds.add(e.playerId);
  }
  const nameMap: Record<string, string> = {};
  if (playerIds.size > 0) {
    const nameRows = await db
      .select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName })
      .from(playersTable)
      .where(inArray(playersTable.id, [...playerIds]));
    for (const r of nameRows) nameMap[r.id] = `${r.firstName} ${r.lastName}`;
  }

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
    playerNameMap: nameMap,
  };
}

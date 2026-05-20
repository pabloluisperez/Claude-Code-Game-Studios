/**
 * Match recap / live page.
 *
 * Loads the user's fixture + the other fixtures from the same matchday +
 * a snapshot of the live standings (computed at the user's match start
 * time, i.e. NOT including this matchday's results yet — gives a
 * "going-into-the-game" feel) and "live" standings (including all the
 * matchday results).
 *
 * Story: HUD-UI-006 + sidebar with other matches + mini standings
 * Control Manifest: 2026-05-20
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  db,
  fixtures,
  clubs,
  standings,
  eq,
  and,
  ne,
  desc,
  alias,
} from '@smt/db';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const [fx] = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      matchday: fixtures.matchday,
      seasonId: fixtures.seasonId,
      divisionId: fixtures.divisionId,
      status: fixtures.status,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      matchOutcomeData: fixtures.matchOutcomeData,
      playedAt: fixtures.playedAt,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(eq(fixtures.id, params.matchSessionId))
    .limit(1);

  if (!fx) throw error(404, 'Match not found');

  // Other fixtures from the same matchday (everyone else playing today).
  const otherFixtures = await db
    .select({
      id: fixtures.id,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      status: fixtures.status,
      matchOutcomeData: fixtures.matchOutcomeData,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      and(
        eq(fixtures.seasonId, fx.seasonId),
        eq(fixtures.matchday, fx.matchday),
        ne(fixtures.id, fx.id),
      ),
    );

  // Mini live standings — current snapshot for the same season+division.
  const liveStandings = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
      played: standings.played,
      points: standings.points,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
    })
    .from(standings)
    .innerJoin(clubs, eq(clubs.id, standings.clubId))
    .where(
      and(
        eq(standings.seasonId, fx.seasonId),
        eq(standings.divisionId, fx.divisionId),
      ),
    )
    .orderBy(desc(standings.points), desc(standings.goalsFor));

  return {
    fixture: fx,
    otherFixtures,
    liveStandings,
    currentWeek: activePlaythrough?.currentWeek ?? 0,
  };
};

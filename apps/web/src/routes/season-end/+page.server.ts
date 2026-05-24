/**
 * End-of-season recap.
 *
 * Loads the most recently completed season for the user's playthrough and
 * computes the verdict against the season objective. The page renders the
 * final standings, our position, and either a confetti success state or a
 * neutral "objetivo no cumplido" state.
 *
 * Story: MVP UX fixes — end-of-season screen
 * Control Manifest: 2026-05-19
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  db,
  playthroughs,
  seasons,
  standings,
  calendarEvents,
  clubs,
  leagues,
  eq,
  and,
  desc,
} from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) throw redirect(303, '/game');

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, activePlaythrough.id))
    .limit(1);
  if (!league) throw redirect(303, '/dashboard');

  const [season] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'completed')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  if (!season) throw redirect(303, '/dashboard');

  // Final standings for that season, with club names.
  const finalStandings = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
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
    .where(eq(standings.seasonId, season.id))
    .orderBy(desc(standings.points), desc(standings.goalsFor));

  const myIdx = finalStandings.findIndex((s) => s.clubId === activePlaythrough.clubId);
  const myPosition = myIdx >= 0 ? myIdx + 1 : null;
  const myStanding = myIdx >= 0 ? finalStandings[myIdx]! : null;
  const totalClubs = finalStandings.length;

  // Look up the objective from the season_start event metadata.
  const [seasonStartEvent] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, activePlaythrough.id),
        eq(calendarEvents.type, 'season_start'),
        eq(calendarEvents.season, season.seasonNumber),
      ),
    )
    .limit(1);

  const objective = (seasonStartEvent?.metadata as { objective?: {
    targetLabel?: string;
    targetRule?: string;
  } })?.objective ?? null;

  // Evaluate objective.
  let objectiveMet: boolean | null = null;
  if (objective?.targetRule === 'top_9_of_12' && myPosition !== null) {
    objectiveMet = myPosition <= 9;
  } else if (objective?.targetRule === 'top_3' && myPosition !== null) {
    objectiveMet = myPosition <= 3;
  } else if (objective?.targetRule === 'champion' && myPosition !== null) {
    objectiveMet = myPosition === 1;
  }

  return {
    season,
    finalStandings,
    myStanding,
    myPosition,
    totalClubs,
    objective,
    objectiveMet,
  };
};

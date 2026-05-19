/**
 * Match recap / live page.
 *
 * The route param is `matchSessionId` for legacy reasons but is interpreted as
 * a fixture id (we don't yet create matchSessions for AI-vs-AI). If/when the
 * full live FSM path comes online, this loader can branch on table.
 *
 * Story: HUD-UI-006 / Match-live wiring
 * Control Manifest: 2026-05-19
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db, fixtures, clubs, eq, alias } from '@smt/db';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user } = await parent();
  if (!user) throw redirect(303, '/login');

  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const [fx] = await db
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
      playedAt: fixtures.playedAt,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(eq(fixtures.id, params.matchSessionId))
    .limit(1);

  if (!fx) throw error(404, 'Match not found');

  return { fixture: fx };
};

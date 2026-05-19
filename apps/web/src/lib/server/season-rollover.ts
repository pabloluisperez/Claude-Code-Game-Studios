/**
 * Season rollover — when `currentWeek` crosses the active season's `endWeek`,
 * mark it `completed` and seed a fresh season with new fixtures + zeroed
 * standings. Same division, same clubs (promotion/relegation is post-MVP).
 *
 * Idempotent: if no rollover is needed (current week still within active
 * season), this is a no-op that returns `{ rolledOver: false }`.
 *
 * Story: MVP UX fixes — season rollover
 * Control Manifest: 2026-05-19
 */

import {
  db,
  seasons,
  fixtures,
  standings,
  leagues,
  divisions,
  eq,
  and,
  desc,
} from '@smt/db';
import { generateDoubleRoundRobin } from '@smt/shared';

const MATCHDAYS_PER_SEASON = 22;
const PRESEASON_WEEKS = 5; // gap between seasons for pretemporada

export interface RolloverResult {
  rolledOver: boolean;
  fromSeason?: number;
  toSeason?: number;
  newSeasonId?: string;
  newSeasonStartWeek?: number;
}

export async function checkAndRolloverSeason(args: {
  playthroughId: string;
  currentWeek: number;
}): Promise<RolloverResult> {
  const { playthroughId, currentWeek } = args;

  return db.transaction(async (tx) => {
    const [league] = await tx
      .select()
      .from(leagues)
      .where(eq(leagues.playthroughId, playthroughId))
      .limit(1);
    if (!league) return { rolledOver: false };

    const [activeSeason] = await tx
      .select()
      .from(seasons)
      .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (!activeSeason) return { rolledOver: false };

    if (currentWeek <= activeSeason.endWeek) {
      return { rolledOver: false };
    }

    // Mark the current season completed.
    await tx
      .update(seasons)
      .set({ status: 'completed' })
      .where(eq(seasons.id, activeSeason.id));

    // Pull the clubs that competed (12). Promotion/relegation is post-MVP —
    // for now the same 12 clubs play another season together.
    const competingStandings = await tx
      .select({ clubId: standings.clubId })
      .from(standings)
      .where(eq(standings.seasonId, activeSeason.id));

    const clubIds = competingStandings.map((s) => s.clubId);
    if (clubIds.length < 2) return { rolledOver: false };

    const newStartWeek = activeSeason.endWeek + PRESEASON_WEEKS;
    const newEndWeek = newStartWeek + MATCHDAYS_PER_SEASON - 1;
    const newSeasonNumber = activeSeason.seasonNumber + 1;

    // Find the existing division to reuse it.
    const [division] = await tx
      .select()
      .from(divisions)
      .where(eq(divisions.id, activeSeason.divisionId))
      .limit(1);
    if (!division) return { rolledOver: false };

    const [newSeason] = await tx
      .insert(seasons)
      .values({
        leagueId: league.id,
        divisionId: division.id,
        seasonNumber: newSeasonNumber,
        status: 'active',
        startWeek: newStartWeek,
        endWeek: newEndWeek,
      })
      .returning({ id: seasons.id });

    // Fresh double round-robin starting at the new season's start week.
    const pairs = generateDoubleRoundRobin({
      clubIds,
      startWeek: newStartWeek,
    });

    await tx.insert(fixtures).values(
      pairs.map((p) => ({
        seasonId: newSeason.id,
        divisionId: division.id,
        homeClubId: p.homeClubId,
        awayClubId: p.awayClubId,
        week: p.week,
        matchday: p.matchday,
        status: 'scheduled' as const,
      })),
    );

    // Reset standings — same 12 clubs, zeroed counters.
    await tx.insert(standings).values(
      clubIds.map((id) => ({
        seasonId: newSeason.id,
        divisionId: division.id,
        clubId: id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      })),
    );

    return {
      rolledOver: true,
      fromSeason: activeSeason.seasonNumber,
      toSeason: newSeasonNumber,
      newSeasonId: newSeason.id,
      newSeasonStartWeek: newStartWeek,
    };
  });
}

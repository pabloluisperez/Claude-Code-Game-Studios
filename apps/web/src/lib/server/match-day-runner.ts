/**
 * Match-day runner — given a playthrough and a target week, find all
 * scheduled fixtures for that week, simulate them with the quick-match
 * simulator, persist scores + outcome JSON, and update standings.
 *
 * Used by /dashboard ?/advance.
 *
 * Single transaction per matchday so any error rolls everything back.
 *
 * Story: League follow-up — match-day batch sim wiring
 * Control Manifest: 2026-05-19
 */

import {
  db,
  fixtures,
  standings,
  players,
  eq,
  and,
  sql,
  type Db,
} from '@smt/db';
import {
  createSeededRng,
  quickSimulateMatch,
  type QuickMatchResult,
} from '@smt/shared';

export interface MatchDayResult {
  week: number;
  played: number;
  results: Array<{
    fixtureId: string;
    homeClubId: string;
    awayClubId: string;
    homeScore: number;
    awayScore: number;
  }>;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Pull both rosters from `players` and call `quickSimulateMatch`.
 * Uses a per-fixture seed so each result is reproducible.
 */
async function simulateFixture(
  tx: Tx,
  args: { fixtureId: string; homeClubId: string; awayClubId: string; seed: string },
): Promise<QuickMatchResult> {
  const homeRoster = await tx
    .select({
      skill: players.skill,
      form: players.form,
      velocidad: players.velocidad,
      resistencia: players.resistencia,
      agresividad: players.agresividad,
      calidad: players.calidad,
    })
    .from(players)
    .where(eq(players.clubId, args.homeClubId));
  const awayRoster = await tx
    .select({
      skill: players.skill,
      form: players.form,
      velocidad: players.velocidad,
      resistencia: players.resistencia,
      agresividad: players.agresividad,
      calidad: players.calidad,
    })
    .from(players)
    .where(eq(players.clubId, args.awayClubId));

  return quickSimulateMatch({
    homeRoster,
    awayRoster,
    rng: createSeededRng(args.seed),
  });
}

/**
 * Apply a single match result to the two clubs' standings rows. Uses
 * `sql` increments so concurrent matchdays don't trample each other.
 */
async function applyToStandings(
  tx: Tx,
  args: {
    seasonId: string;
    homeClubId: string;
    awayClubId: string;
    homeScore: number;
    awayScore: number;
    winner: QuickMatchResult['winner'];
  },
): Promise<void> {
  const { seasonId, homeClubId, awayClubId, homeScore, awayScore, winner } = args;

  // Home club
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: winner === 'home' ? sql`${standings.wins} + 1` : standings.wins,
      draws: winner === 'draw' ? sql`${standings.draws} + 1` : standings.draws,
      losses: winner === 'away' ? sql`${standings.losses} + 1` : standings.losses,
      goalsFor: sql`${standings.goalsFor} + ${homeScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${awayScore}`,
      points: sql`${standings.points} + ${winner === 'home' ? 3 : winner === 'draw' ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(and(eq(standings.seasonId, seasonId), eq(standings.clubId, homeClubId)));

  // Away club
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: winner === 'away' ? sql`${standings.wins} + 1` : standings.wins,
      draws: winner === 'draw' ? sql`${standings.draws} + 1` : standings.draws,
      losses: winner === 'home' ? sql`${standings.losses} + 1` : standings.losses,
      goalsFor: sql`${standings.goalsFor} + ${awayScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${homeScore}`,
      points: sql`${standings.points} + ${winner === 'away' ? 3 : winner === 'draw' ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(and(eq(standings.seasonId, seasonId), eq(standings.clubId, awayClubId)));
}

/**
 * Run all `status = 'scheduled'` fixtures in `week`, persisting scores and
 * updating standings. Returns the list of results for caller side effects
 * (e.g. an in-game notification feed).
 */
export async function runMatchDay(args: {
  playthroughId: string;
  week: number;
}): Promise<MatchDayResult> {
  const { playthroughId, week } = args;

  return db.transaction(async (tx) => {
    const scheduledRows = await tx
      .select({
        id: fixtures.id,
        seasonId: fixtures.seasonId,
        homeClubId: fixtures.homeClubId,
        awayClubId: fixtures.awayClubId,
      })
      .from(fixtures)
      .where(and(eq(fixtures.week, week), eq(fixtures.status, 'scheduled')));

    const results: MatchDayResult['results'] = [];
    const playedAt = new Date();

    for (const fx of scheduledRows) {
      const seed = `${playthroughId}:${fx.id}`;
      const result = await simulateFixture(tx, {
        fixtureId: fx.id,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        seed,
      });

      await tx
        .update(fixtures)
        .set({
          status: 'played',
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          matchOutcomeData: {
            winner: result.winner,
            homeStrength: result.homeStrength,
            awayStrength: result.awayStrength,
            events: result.events,
          },
          playedAt,
        })
        .where(eq(fixtures.id, fx.id));

      await applyToStandings(tx, {
        seasonId: fx.seasonId,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
      });

      results.push({
        fixtureId: fx.id,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      });
    }

    return { week, played: results.length, results };
  });
}

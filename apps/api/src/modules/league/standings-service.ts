/**
 * applyMatchToStandings — post-match transactional standings update.
 *
 * Per `design/gdd/league-system.md` AC-LGS-11..14 and ADR-011:
 *   - Win = +3 points; Draw = +1; Loss = 0.
 *   - Both teams' standings rows updated atomically.
 *   - Idempotent on fixture_id: if fixture.status === 'played', skip.
 *
 * Story: LEAGUE-SYSTEM-004 (TR-LGS-004)
 * Control Manifest: 2026-05-19
 */

import { and, eq, sql } from 'drizzle-orm';
import type { Fixture } from '@smt/db';
import { fixtures, standings } from '@smt/db';
import type { db as DBType } from '@smt/db';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export interface MatchOutcomeApplyArgs {
  readonly fixtureId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly outcomeData?: unknown;
}

export type StandingsUpdateResult =
  | { ok: true; applied: true }
  | { ok: true; applied: false; reason: 'already_played' }
  | { ok: false; reason: 'fixture_not_found' };

/**
 * Apply a match outcome to both teams' standings rows + mark fixture as played.
 *
 * Idempotent: if the fixture is already 'played', returns { applied: false }
 * without mutating standings.
 *
 * Caller MUST own the surrounding Drizzle transaction.
 */
export async function applyMatchToStandings(
  tx: Tx,
  args: Readonly<MatchOutcomeApplyArgs>,
): Promise<StandingsUpdateResult> {
  const fixtureRows = await tx
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, args.fixtureId))
    .limit(1);
  const fixture: Fixture | undefined = fixtureRows[0];
  if (!fixture) return { ok: false, reason: 'fixture_not_found' };
  if (fixture.status === 'played') {
    return { ok: true, applied: false, reason: 'already_played' };
  }

  // 1. Mark fixture played + persist scores + outcome blob
  await tx
    .update(fixtures)
    .set({
      status: 'played',
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      matchOutcomeData: args.outcomeData ?? null,
      playedAt: new Date(),
    })
    .where(eq(fixtures.id, args.fixtureId));

  // 2. Determine result-type
  const homePoints = args.homeScore > args.awayScore ? 3 : args.homeScore === args.awayScore ? 1 : 0;
  const awayPoints = args.awayScore > args.homeScore ? 3 : args.homeScore === args.awayScore ? 1 : 0;
  const isHomeWin = args.homeScore > args.awayScore;
  const isDraw = args.homeScore === args.awayScore;

  // 3. Increment standings — home
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: sql`${standings.wins} + ${isHomeWin ? 1 : 0}`,
      draws: sql`${standings.draws} + ${isDraw ? 1 : 0}`,
      losses: sql`${standings.losses} + ${!isHomeWin && !isDraw ? 1 : 0}`,
      goalsFor: sql`${standings.goalsFor} + ${args.homeScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${args.awayScore}`,
      points: sql`${standings.points} + ${homePoints}`,
    })
    .where(
      and(
        eq(standings.seasonId, fixture.seasonId),
        eq(standings.clubId, fixture.homeClubId),
      ),
    );

  // 4. Increment standings — away
  const isAwayWin = args.awayScore > args.homeScore;
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: sql`${standings.wins} + ${isAwayWin ? 1 : 0}`,
      draws: sql`${standings.draws} + ${isDraw ? 1 : 0}`,
      losses: sql`${standings.losses} + ${!isAwayWin && !isDraw ? 1 : 0}`,
      goalsFor: sql`${standings.goalsFor} + ${args.awayScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${args.homeScore}`,
      points: sql`${standings.points} + ${awayPoints}`,
    })
    .where(
      and(
        eq(standings.seasonId, fixture.seasonId),
        eq(standings.clubId, fixture.awayClubId),
      ),
    );

  return { ok: true, applied: true };
}

/**
 * Read all standings for a season (caller sorts via Story 003's
 * `computeStandingsSort`).
 */
export async function getStandingsForSeason(
  tx: Tx,
  seasonId: string,
): Promise<readonly typeof standings.$inferSelect[]> {
  return tx.select().from(standings).where(eq(standings.seasonId, seasonId));
}

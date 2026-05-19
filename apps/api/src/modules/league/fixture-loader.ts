/**
 * Fixture-loader — pre-match forfeit guard + MatchInput hydration.
 *
 * Per `design/gdd/league-system.md` AC-LGS-15..18 and ADR-016:
 *   - At fixture-load time, check `squad_available_pct ≤ 63` (canonical denom=25)
 *     for both clubs.
 *   - If forfeit detected: synthesize 0-3 outcome (home forfeits → away wins 0-3;
 *     away forfeits → home wins 3-0; both ≤63 → home forfeits, away-favor).
 *   - Forfeit applies `mpi_delta=-30` to the forfeiting club + emits
 *     `forfeit_recorded` calendar event (event-system).
 *
 * Story: LEAGUE-SYSTEM-006 (TR-LGS-006)
 * Control Manifest: 2026-05-19
 */

import { eq } from 'drizzle-orm';
import { fixtures } from '@smt/db';
import type { Fixture } from '@smt/db';
import type { db as DBType } from '@smt/db';
import { getSquadAvailabilityCount } from '../players/repo.js';
import { applyMatchToStandings } from './standings-service.js';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export const FORFEIT_HOME_SCORE_FOR_LOSER = 0;
export const FORFEIT_WINNER_SCORE = 3;

export interface ForfeitInfo {
  readonly fixtureId: string;
  readonly forfeitingTeam: 'home' | 'away';
  readonly homeScore: number;
  readonly awayScore: number;
  readonly forfeitingClubId: string;
}

export type LoadFixtureResult =
  | {
      readonly ok: true;
      readonly fixture: Fixture;
      readonly forfeit: ForfeitInfo | null;
    }
  | { readonly ok: false; readonly reason: 'fixture_not_found' };

/**
 * Load a fixture and detect forfeit. If detected, apply the synthetic
 * outcome to standings + return the forfeit info (caller emits the event).
 */
export async function loadFixtureForMatch(
  tx: Tx,
  args: { readonly fixtureId: string; readonly playthroughId: string },
): Promise<LoadFixtureResult> {
  const rows = await tx
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, args.fixtureId))
    .limit(1);
  const fixture = rows[0];
  if (!fixture) return { ok: false, reason: 'fixture_not_found' };

  // Check both teams' availability
  const homeAvail = await getSquadAvailabilityCount(
    tx,
    args.playthroughId,
    fixture.homeClubId,
  );
  const awayAvail = await getSquadAvailabilityCount(
    tx,
    args.playthroughId,
    fixture.awayClubId,
  );

  const homeForfeits = homeAvail.pct <= 63;
  const awayForfeits = awayAvail.pct <= 63;

  if (!homeForfeits && !awayForfeits) {
    return { ok: true, fixture, forfeit: null };
  }

  // Precedence: when both forfeit, home is the forfeiting team (away-favor)
  const forfeitingTeam: 'home' | 'away' = homeForfeits ? 'home' : 'away';
  const forfeitingClubId =
    forfeitingTeam === 'home' ? fixture.homeClubId : fixture.awayClubId;
  const homeScore = forfeitingTeam === 'home' ? FORFEIT_HOME_SCORE_FOR_LOSER : FORFEIT_WINNER_SCORE;
  const awayScore = forfeitingTeam === 'away' ? FORFEIT_HOME_SCORE_FOR_LOSER : FORFEIT_WINNER_SCORE;

  // Apply to standings + mark fixture played
  await applyMatchToStandings(tx, {
    fixtureId: fixture.id,
    homeScore,
    awayScore,
    outcomeData: { kind: 'forfeit', forfeitingClubId },
  });

  return {
    ok: true,
    fixture,
    forfeit: {
      fixtureId: fixture.id,
      forfeitingTeam,
      forfeitingClubId,
      homeScore,
      awayScore,
    },
  };
}

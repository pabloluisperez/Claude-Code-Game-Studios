/**
 * processSeasonEnd — 3 up / 3 down + new season construction.
 *
 * Per `design/gdd/league-system.md` AC-LGS-23..24 and ADR-011:
 *   1. Mark current season status='completed'.
 *   2. Top 3 of D2 → D1; bottom 3 of D1 → D2 (atomic swap).
 *   3. Player contracts on relegated clubs flagged for renegotiation (via PM-011).
 *   4. Create new season rows in both divisions; bump seasonNumber.
 *   5. Generate new round-robin fixtures (380 per division).
 *   6. Reset standings (one row per club at zero).
 *   7. All in a single Drizzle transaction.
 *
 * Story: LEAGUE-SYSTEM-005 (TR-LGS-005)
 * Control Manifest: 2026-05-19
 */

import { and, eq } from 'drizzle-orm';
import { divisions, fixtures, players, seasons, standings } from '@smt/db';
import type { db as DBType } from '@smt/db';
import {
  generateRoundRobin,
  type FixtureDraft,
} from '@smt/shared';
import { computeStandingsSort } from '@smt/shared';
import { getStandingsForSeason } from '../league/standings-service.js';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export const PROMOTION_COUNT = 3;
export const RELEGATION_COUNT = 3;
export const WEEKS_PER_SEASON = 52;

export interface SeasonEndResult {
  readonly promoted: readonly string[];
  readonly relegated: readonly string[];
  readonly newSeasonIds: { readonly d1: string; readonly d2: string };
  readonly contractRenewalCandidates: readonly string[];
}

/**
 * Atomic season transition.
 *
 * Caller MUST own the surrounding Drizzle transaction. The function performs
 * all reads + writes inside that transaction so the league either fully
 * advances to the new season OR rolls back to the prior state.
 */
export async function processSeasonEnd(
  tx: Tx,
  args: {
    readonly leagueId: string;
    readonly currentSeasonD1Id: string;
    readonly currentSeasonD2Id: string;
    readonly currentWeek: number;
  },
): Promise<SeasonEndResult> {
  // 1. Read final standings for both divisions
  const d1Rows = await getStandingsForSeason(tx, args.currentSeasonD1Id);
  const d2Rows = await getStandingsForSeason(tx, args.currentSeasonD2Id);
  const d1Sorted = computeStandingsSort({
    rows: d1Rows.map((r) => ({
      clubId: r.clubId,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      points: r.points,
    })),
  });
  const d2Sorted = computeStandingsSort({
    rows: d2Rows.map((r) => ({
      clubId: r.clubId,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      points: r.points,
    })),
  });

  const relegatedIds = d1Sorted.slice(-RELEGATION_COUNT).map((r) => r.clubId);
  const promotedIds = d2Sorted.slice(0, PROMOTION_COUNT).map((r) => r.clubId);

  // 2. Mark both seasons completed
  await tx
    .update(seasons)
    .set({ status: 'completed' })
    .where(eq(seasons.id, args.currentSeasonD1Id));
  await tx
    .update(seasons)
    .set({ status: 'completed' })
    .where(eq(seasons.id, args.currentSeasonD2Id));

  // 3. Fetch division ids (FK targets for the new seasons + fixtures)
  const divRows = await tx
    .select()
    .from(divisions)
    .where(eq(divisions.leagueId, args.leagueId));
  const d1Div = divRows.find((d) => d.tier === 1);
  const d2Div = divRows.find((d) => d.tier === 2);
  if (!d1Div || !d2Div) {
    throw new Error('Cannot find both D1 and D2 divisions for league');
  }

  // 4. Read current seasons to bump seasonNumber
  const currentSeasonRows = await tx
    .select()
    .from(seasons)
    .where(eq(seasons.id, args.currentSeasonD1Id))
    .limit(1);
  const currentSeasonNumber = currentSeasonRows[0]?.seasonNumber ?? 1;

  // 5. Create new seasons
  const newSeasonD1 = await tx
    .insert(seasons)
    .values({
      leagueId: args.leagueId,
      divisionId: d1Div.id,
      seasonNumber: currentSeasonNumber + 1,
      status: 'upcoming',
      startWeek: args.currentWeek + 1,
      endWeek: args.currentWeek + WEEKS_PER_SEASON,
    })
    .returning({ id: seasons.id });
  const newSeasonD2 = await tx
    .insert(seasons)
    .values({
      leagueId: args.leagueId,
      divisionId: d2Div.id,
      seasonNumber: currentSeasonNumber + 1,
      status: 'upcoming',
      startWeek: args.currentWeek + 1,
      endWeek: args.currentWeek + WEEKS_PER_SEASON,
    })
    .returning({ id: seasons.id });
  const newD1Id = newSeasonD1[0]!.id;
  const newD2Id = newSeasonD2[0]!.id;

  // 6. Compute new D1 and D2 club rosters after swap
  const d1Stayers = d1Sorted.slice(0, -RELEGATION_COUNT).map((r) => r.clubId);
  const d2Stayers = d2Sorted.slice(PROMOTION_COUNT).map((r) => r.clubId);
  const newD1Clubs = [...d1Stayers, ...promotedIds];
  const newD2Clubs = [...d2Stayers, ...relegatedIds];

  // 7. Insert standings rows (one per club at zero) for both new seasons
  for (const clubId of newD1Clubs) {
    await tx.insert(standings).values({
      seasonId: newD1Id,
      divisionId: d1Div.id,
      clubId,
    });
  }
  for (const clubId of newD2Clubs) {
    await tx.insert(standings).values({
      seasonId: newD2Id,
      divisionId: d2Div.id,
      clubId,
    });
  }

  // 8. Generate new fixtures and insert
  const d1Drafts = generateRoundRobin({
    clubIds: newD1Clubs,
    startWeek: args.currentWeek + 1,
  });
  const d2Drafts = generateRoundRobin({
    clubIds: newD2Clubs,
    startWeek: args.currentWeek + 1,
  });
  await insertFixtures(tx, d1Drafts, newD1Id, d1Div.id);
  await insertFixtures(tx, d2Drafts, newD2Id, d2Div.id);

  // 9. Flag contract renewal candidates on relegated clubs (consumed by PM-011)
  const renewalCandidates: string[] = [];
  for (const clubId of relegatedIds) {
    const clubPlayers = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.clubId, clubId));
    for (const p of clubPlayers) renewalCandidates.push(p.id);
  }

  return {
    promoted: promotedIds,
    relegated: relegatedIds,
    newSeasonIds: { d1: newD1Id, d2: newD2Id },
    contractRenewalCandidates: renewalCandidates,
  };
}

async function insertFixtures(
  tx: Tx,
  drafts: readonly FixtureDraft[],
  seasonId: string,
  divisionId: string,
): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({
    seasonId,
    divisionId,
    homeClubId: d.homeClubId,
    awayClubId: d.awayClubId,
    week: d.week,
    matchday: d.matchday,
  }));
  await tx.insert(fixtures).values(rows);
}

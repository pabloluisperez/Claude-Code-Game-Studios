/**
 * Museum repo — strictly READ-ONLY queries.
 *
 * Story TROPHIES-HISTORY-001. Per ADR-030 §D3: this module must NEVER
 * insert/update/delete any rows. The read-only invariant is enforced
 * in code review + by the schema choices below (Drizzle `.select(...)` only).
 *
 * Some categories source from tables that don't yet exist in v1.1
 * (trophies, transfers, TOP_5 history) — those return empty arrays.
 * Story 23-1 docs note this; v1.2+ stories will wire those sources.
 */

import { and, desc, eq } from 'drizzle-orm';
import {
  db as dbClient,
  clubs,
  fixtures,
  stadiumUpgradeItems,
  worldSnapshots,
  playthroughs,
} from '@smt/db';
import { legendaryMatchQualifies } from '@smt/shared';

export type TrophyEntry = {
  id: string;
  kind: 'cup' | 'league' | 'promotion';
  seasonNumber: number;
  name: string;
};

export type BannerEntry = {
  id: string;
  kind: 'legendary_match' | 'promotion' | 'survival';
  week: number;
  description: string;
  homeScore: number;
  awayScore: number;
  fixtureId: string;
};

export type LegendTransferEntry = {
  id: string;
  playerName: string;
  direction: 'in' | 'out';
  valueEurK: number;
  seasonNumber: number;
};

export type FinancialMilestoneEntry = {
  id: string;
  kind: 'first_profit' | 'first_100k' | 'survived_bankruptcy';
  week: number;
  description: string;
};

export type StadiumHistoryEntry = {
  id: string;
  itemSlug: string;
  track: string;
  tier: number;
  completedAt: string;
};

export async function getTrophies(_clubId: string): Promise<TrophyEntry[]> {
  // v1.1: trophy schema not yet implemented. Returns empty.
  // v1.2+ will source from league-system cup results.
  return [];
}

export async function getBanners(clubId: string): Promise<BannerEntry[]> {
  // Pull every PLAYED fixture for this club, apply F1 legendaryMatchQualifies.
  const rows = await dbClient
    .select()
    .from(fixtures)
    .where(eq(fixtures.status, 'played'));

  const banners: BannerEntry[] = [];
  for (const f of rows) {
    if (f.homeClubId !== clubId && f.awayClubId !== clubId) continue;
    if (f.homeScore === null || f.awayScore === null) continue;
    const isHome = f.homeClubId === clubId;
    const goalsFor = isHome ? f.homeScore : f.awayScore;
    const goalsAgainst = isHome ? f.awayScore : f.homeScore;
    const result: 'win' | 'draw' | 'loss' =
      goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';

    if (
      legendaryMatchQualifies({
        goalsFor,
        goalsAgainst,
        fan_momentum_delta: 0, // not tracked per-match yet — defer to v1.2+
        is_derby: false,
        is_cup_final: false,
        result,
      })
    ) {
      banners.push({
        id: f.id,
        kind: 'legendary_match',
        week: f.week,
        description: `Jornada ${f.matchday}: ${goalsFor}-${goalsAgainst}`,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        fixtureId: f.id,
      });
    }
  }
  return banners;
}

export async function getLegendTransfers(_clubId: string): Promise<LegendTransferEntry[]> {
  // v1.1: transfer schema not yet implemented. Returns empty.
  return [];
}

export async function getFinancialMilestones(clubId: string): Promise<FinancialMilestoneEntry[]> {
  // Find the latest playthrough for this club + scan its weekly snapshots for
  // milestone crossings (first profit week, first €100K balance, etc.).
  const playthroughRow = await dbClient
    .select({ id: playthroughs.id })
    .from(playthroughs)
    .where(eq(playthroughs.clubId, clubId))
    .orderBy(desc(playthroughs.createdAt))
    .limit(1);
  if (!playthroughRow[0]) return [];

  const snaps = await dbClient
    .select({
      week: worldSnapshots.week,
      worldState: worldSnapshots.worldState,
    })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthroughRow[0].id));

  const milestones: FinancialMilestoneEntry[] = [];
  const sorted = [...snaps].sort((a, b) => a.week - b.week);

  let firstProfitFlagged = false;
  let first100kFlagged = false;
  for (const s of sorted) {
    const state = s.worldState as Record<string, number>;
    const balance = Number(state['financial_balance'] ?? 0);
    const cashflow = Number(state['weekly_cashflow'] ?? 0);
    if (!firstProfitFlagged && cashflow > 0) {
      milestones.push({
        id: `firstProfit:${s.week}`,
        kind: 'first_profit',
        week: s.week,
        description: `Primera semana con beneficio: +${Math.round(cashflow)} €K`,
      });
      firstProfitFlagged = true;
    }
    if (!first100kFlagged && balance >= 100) {
      milestones.push({
        id: `first100k:${s.week}`,
        kind: 'first_100k',
        week: s.week,
        description: `Cruzaste los 100€K de caja por primera vez`,
      });
      first100kFlagged = true;
    }
  }
  return milestones;
}

export async function getStadiumHistory(clubId: string): Promise<StadiumHistoryEntry[]> {
  const rows = await dbClient
    .select()
    .from(stadiumUpgradeItems)
    .where(
      and(eq(stadiumUpgradeItems.clubId, clubId), eq(stadiumUpgradeItems.status, 'complete')),
    );
  return rows
    .filter((r) => r.completedAt !== null)
    .sort((a, b) => (a.completedAt!.getTime() - b.completedAt!.getTime()))
    .map((r) => ({
      id: r.id,
      itemSlug: r.itemSlug,
      track: r.track,
      tier: r.tier,
      completedAt: r.completedAt!.toISOString(),
    }));
}

/** Verify a club exists and is owned by the given user. Used by routes. */
export async function clubBelongsToUser(userId: string, clubId: string): Promise<boolean> {
  const rows = await dbClient
    .select({ managerId: clubs.managerId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return rows[0]?.managerId === userId;
}

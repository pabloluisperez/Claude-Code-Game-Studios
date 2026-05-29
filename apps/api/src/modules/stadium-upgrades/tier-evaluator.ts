/**
 * Tier-up doble-gate evaluator. Story STADIUM-UPGRADES-007.
 *
 * Per `design/gdd/stadium-upgrades.md §3.1.5`: the city-progression module
 * must evaluate BOTH gates before transitioning a club to the next tier:
 *
 *   1. **Métricas** gate (city-progression §3.2 — exposed here as injected fn).
 *   2. **Reformas** gate (F6 — at least 70% of items at level N are Complete).
 *
 * This module provides a self-contained `evaluateTierUp(clubId, deps)` that
 * encapsulates the dual-gate evaluation. It is consumed by the stadium service
 * (on Complete) and intended to be wired into the city-progression metric flow
 * once that module is fully implemented.
 *
 * NOTE: As of v1.1 there is no city-progression module yet; the métrics gate
 * is therefore injected (optional) and defaults to `true` when omitted. This
 * does not loosen v1.1 spec — story 22-7 deliverable is the gate function +
 * the integration hook in the orchestrator (deferred per active.md).
 */

import { eq, sql } from 'drizzle-orm';
import { db as dbClient, clubs } from '@smt/db';
import { itemsRequiredForLevel, tierUpReformasGateSatisfied, type StadiumItemTier } from '@smt/shared';
import { getCatalog } from './catalog.js';
import { getCompletedItemsCountByLevel } from './service.js';

type Tx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0] | typeof dbClient;

export type TierUpVerdict =
  | { tierUp: true; newTier: number }
  | { tierUp: false; reason: 'METRICS_NOT_MET' | 'REFORMAS_NOT_MET' | 'AT_MAX'; required?: number; completed?: number };

export type EvaluateTierUpDeps = {
  /** Returns true when the city-progression metrics gate would pass for `nextTier`.
   *  Defaults to `() => true` when omitted (allows reformas-only evaluation while
   *  city-progression module is implemented). */
  metricsGateForTier?: (clubId: string, nextTier: number, tx: Tx) => Promise<boolean>;
  /** Apply the city-tier promotion atomically. Defaults to a Drizzle UPDATE on clubs.city_tier. */
  promoteTier?: (clubId: string, newTier: number, tx: Tx) => Promise<void>;
};

async function readCityTier(tx: Tx, clubId: string): Promise<number> {
  const rows = await tx.select({ cityTier: clubs.cityTier }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!rows[0]) throw new Error(`Club not found: ${clubId}`);
  return rows[0].cityTier;
}

async function defaultPromoteTier(clubId: string, newTier: number, tx: Tx): Promise<void> {
  await tx.update(clubs).set({ cityTier: newTier }).where(eq(clubs.id, clubId));
}

/**
 * Evaluate the doble-gate. Runs inside the caller's transaction (or autocommit
 * if `tx === db`). Promotes the club's city_tier atomically when both gates pass.
 *
 * Returns a structured verdict so the caller can log / surface to the user.
 */
export async function evaluateTierUp(
  clubId: string,
  tx: Tx = dbClient,
  deps: EvaluateTierUpDeps = {},
): Promise<TierUpVerdict> {
  const currentTier = await readCityTier(tx, clubId);
  const nextTier = currentTier + 1;
  if (nextTier > 4) return { tierUp: false, reason: 'AT_MAX' };

  // Métricas gate — defaults to true when no city-progression module wired yet.
  const metricsGate = deps.metricsGateForTier ?? (async () => true);
  const metricsOk = await metricsGate(clubId, nextTier, tx);

  // Reformas gate (F6): completed items at this level vs 70% of total catalog at that level.
  // The "level" in F6 refers to the tier of the items, not the city tier — they happen
  // to align in v1.1 by design. So we ask: how many tier-N items has this club completed?
  const tierItems = getCatalog().filter((i) => i.tier === nextTier);
  const totalInLevel = tierItems.length;
  const required = itemsRequiredForLevel(totalInLevel);
  const completed = await getCompletedItemsCountByLevel(tx, clubId, nextTier as StadiumItemTier);
  const reformasOk = tierUpReformasGateSatisfied(nextTier as StadiumItemTier, completed, totalInLevel);

  if (!metricsOk) return { tierUp: false, reason: 'METRICS_NOT_MET', required, completed };
  if (!reformasOk) return { tierUp: false, reason: 'REFORMAS_NOT_MET', required, completed };

  // Both gates passed — promote.
  const promote = deps.promoteTier ?? defaultPromoteTier;
  await promote(clubId, nextTier, tx);
  return { tierUp: true, newTier: nextTier };
}

/**
 * Run stadium tick for every club with an active upgrade. Intended to be called
 * once per week-tick by the advance pipeline.
 *
 * @param opts.excludeClubId - Optional club ID to skip. Used by the advance
 *   orchestrator to avoid double-ticking the player's club (which is already
 *   ticked in Phase 3b via `tickStadiumForClubInTx`). The skipped club is NOT
 *   counted in the `ticked` return value.
 */
export async function tickAllClubsWithActiveUpgrades(
  opts: { excludeClubId?: string } = {},
): Promise<{ ticked: number }> {
  const { excludeClubId } = opts;

  // Query distinct club_ids that currently have an in_progress item.
  const result = await dbClient.execute(
    sql`SELECT DISTINCT club_id FROM stadium_upgrade_items WHERE status = 'in_progress'`,
  );
  const rows = (result as unknown as { rows?: Array<{ club_id: string }> }).rows
    ?? (result as unknown as Array<{ club_id: string }>);
  const allClubIds = rows.map((r) => r.club_id);

  // Exclude the player's club if requested (it is already ticked by Phase 3b
  // in the advance orchestrator — we must not double-tick it).
  const clubIds = excludeClubId
    ? allClubIds.filter((id) => id !== excludeClubId)
    : allClubIds;

  // Tick each AI club. Wire evaluateTierUp so that completing an obra
  // immediately triggers the doble-gate check, just like the player path
  // does via the orchestrator. Dynamic import avoids a circular dep with
  // service.ts (tier-evaluator already imports from service for
  // getCompletedItemsCountByLevel).
  const { tickClub } = await import('./service.js');
  for (const clubId of clubIds) {
    await tickClub(clubId, {
      evaluateTierUp: async (cId, tx) => evaluateTierUp(cId, tx),
    });
  }
  return { ticked: clubIds.length };
}

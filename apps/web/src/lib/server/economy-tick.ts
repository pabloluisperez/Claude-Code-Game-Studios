/**
 * Weekly economy tick.
 *
 * Applies the deterministic economy flow on top of a worldState that the
 * cascade engine has already computed:
 *
 *   revenue   = Σ active sponsors.weeklyEurK
 *   costs     = Σ active staff.weeklyEurK + Σ players.salaryEurK
 *   cashflow  = revenue − costs
 *   balance' = balance + cashflow
 *
 * Returns the patched worldState (immutable input). Pure DB reads, no writes.
 *
 * Story: MVP UX fixes — economy flow
 * Control Manifest: 2026-05-19
 */

import {
  db,
  sponsors,
  staff,
  players,
  eq,
  and,
  sql,
  type Db,
} from '@smt/db';
import type { WorldState } from '@smt/shared';

export interface EconomyTickResult {
  readonly patchedState: WorldState;
  readonly sponsorRevenue: number;
  readonly staffCost: number;
  readonly playerWages: number;
  readonly cashflow: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function readEconomyTotals(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<{ sponsorRevenue: number; staffCost: number; playerWages: number }> {
  const sponsorAgg = await tx
    .select({ total: sql<number>`COALESCE(SUM(${sponsors.weeklyEurK}), 0)` })
    .from(sponsors)
    .where(
      and(
        eq(sponsors.playthroughId, playthroughId),
        eq(sponsors.status, 'active'),
      ),
    );

  const staffAgg = await tx
    .select({ total: sql<number>`COALESCE(SUM(${staff.weeklyEurK}), 0)` })
    .from(staff)
    .where(and(eq(staff.playthroughId, playthroughId), eq(staff.status, 'active')));

  const playerAgg = await tx
    .select({ total: sql<number>`COALESCE(SUM(${players.salaryEurK}), 0)` })
    .from(players)
    .where(eq(players.clubId, clubId));

  return {
    sponsorRevenue: Number(sponsorAgg[0]?.total ?? 0),
    staffCost: Number(staffAgg[0]?.total ?? 0),
    playerWages: Number(playerAgg[0]?.total ?? 0),
  };
}

/**
 * Apply the economy tick on top of a baseline worldState. Reads aggregates
 * from the DB and patches `financial_balance`, `weekly_cashflow`,
 * `sponsor_revenue_weekly`, `staff_cost_weekly`, `player_wages_weekly`.
 *
 * Idempotent for the same (state, db) — call per advance.
 */
export async function applyEconomyTick(args: {
  playthroughId: string;
  clubId: string;
  baseState: Readonly<WorldState>;
}): Promise<EconomyTickResult> {
  const { playthroughId, clubId, baseState } = args;

  const totals = await db.transaction(async (tx) =>
    readEconomyTotals(tx, playthroughId, clubId),
  );

  const balanceBefore = baseState['financial_balance' as keyof WorldState] ?? 0;
  const cashflow = totals.sponsorRevenue - totals.staffCost - totals.playerWages;
  const balanceAfter = balanceBefore + cashflow;

  const patchedState = {
    ...(baseState as Record<string, number>),
    financial_balance: balanceAfter,
    weekly_cashflow: cashflow,
    sponsor_revenue_weekly: totals.sponsorRevenue,
    staff_cost_weekly: totals.staffCost,
    player_wages_weekly: totals.playerWages,
  } as unknown as WorldState;

  return {
    patchedState,
    sponsorRevenue: totals.sponsorRevenue,
    staffCost: totals.staffCost,
    playerWages: totals.playerWages,
    cashflow,
    balanceBefore,
    balanceAfter,
  };
}

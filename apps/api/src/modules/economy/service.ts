/**
 * Economy service — orchestrates the weekly flow inside advance().
 *
 * Per ADR-014 §Execution Order:
 *   1. Compute revenue (match-day if home match, sponsors, TV rights).
 *   2. Compute costs (player wages, staff, catering, scouting, groundskeeper, maintenance).
 *   3. Compute net cashflow + new balance.
 *   4. Compute new financial_status (FSM).
 *   5. Return Partial<WorldState> delta for cascade Step 3 injection.
 *   6. Insert ledger? — per ADR-014 ledger lives in WorldState; no separate insert.
 *
 * Story: ECONOMY-007 (TR-ECO-007)
 * Control Manifest: 2026-05-19
 */

import { eq } from 'drizzle-orm';
import { players, sponsors } from '@smt/db';
import type { db as DBType } from '@smt/db';
import type { WorldState } from '@smt/shared';
import {
  bankruptcyTransition,
  computeFinancialStatus,
  computeMatchDayRevenue,
  computeWeeklyCosts,
  computeWeeklyRevenue,
  marketTicketEur,
  maxTicketEur,
  type BankruptcyTransition,
} from '@smt/shared';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export interface ApplyWeeklyFlowArgs {
  readonly playthroughId: string;
  readonly clubId: string;
  readonly currentWeek: number;
  readonly prevWorldState: Readonly<WorldState>;
  readonly divisionTier: 1 | 2;
  /** Home match attendance this week (0 when no home match). */
  readonly homeAttendanceThisWeek: number;
  /** Effective ticket price in € (driven by cascade ticket_price_index + per-club MAX). */
  readonly effectiveTicketPriceEur: number;
  /** Player wages multiplier (1.0 normally; 0.75 during freeze). */
  readonly payrollMultiplier?: number;
}

export interface WeeklyFlowResult {
  readonly revenue: number;
  readonly costs: number;
  readonly newBalance: number;
  readonly newCashflow: number;
  readonly newFinancialStatus: 0 | 1 | 2 | 3;
  readonly transition: BankruptcyTransition | null;
  /** Partial WorldState patch — injected into cascade tick Step 3. */
  readonly worldStateDelta: Partial<WorldState>;
}

/**
 * Compute the weekly flow + return the WorldState delta for cascade injection.
 *
 * Does NOT mutate WorldState directly. The cascade engine clamps + applies the
 * delta via Step 3 PlayerDecisions (or the advance-worker injects it).
 */
export async function applyWeeklyFlow(
  tx: Tx,
  args: Readonly<ApplyWeeklyFlowArgs>,
): Promise<WeeklyFlowResult> {
  // 1. Load players + active sponsors for the club
  const playerRows = await tx
    .select({
      salaryEurK: players.salaryEurK,
      availability: players.availability,
    })
    .from(players)
    .where(eq(players.clubId, args.clubId));

  const sponsorRows = await tx
    .select({
      status: sponsors.status,
      weeklyEurK: sponsors.weeklyEurK,
    })
    .from(sponsors)
    .where(eq(sponsors.clubId, args.clubId));

  // 2. Compute revenue
  const matchDayRevenue = computeMatchDayRevenue({
    attendance: args.homeAttendanceThisWeek,
    ticketPriceEur: args.effectiveTicketPriceEur,
  });
  const revenue = computeWeeklyRevenue({
    matchDayRevenue,
    sponsors: sponsorRows,
    divisionTier: args.divisionTier,
  });

  // 3. Compute costs (staff payroll handled by staff-system; not loaded here)
  const costs = computeWeeklyCosts({
    players: playerRows,
    staff: [], // staff-system epic will inject these once its module exists
    cateringBudget: args.prevWorldState['catering_budget'] ?? 0,
    scoutingBudget: args.prevWorldState['scouting_budget'] ?? 0,
    groundskeeperBudget: args.prevWorldState['groundskeeper_budget'] ?? 0,
    payrollMultiplier: args.payrollMultiplier ?? 1.0,
  });

  // 4. Net result
  const netCashflow = revenue.total - costs.total;
  const prevBalance = args.prevWorldState['financial_balance'] ?? 0;
  const newBalance = prevBalance + netCashflow;

  // 5. Financial status FSM
  const prevStatus = (args.prevWorldState['financial_status'] ?? 0) as 0 | 1 | 2 | 3;
  const newStatus = computeFinancialStatus(newBalance, netCashflow);
  const transition = bankruptcyTransition(prevStatus, newStatus);

  return {
    revenue: revenue.total,
    costs: costs.total,
    newBalance,
    newCashflow: netCashflow,
    newFinancialStatus: newStatus,
    transition,
    worldStateDelta: {
      financial_balance: newBalance,
      weekly_cashflow: netCashflow,
      financial_status: newStatus,
    },
  };
}

/**
 * Compute the effective ticket price for a club given its WorldState +
 * ticket_price_index slider value (0..100).
 */
export function computeEffectiveTicketPrice(args: {
  readonly stadiumCapacity: number;
  readonly divisionTier: 1 | 2;
  readonly fanCultureIndex: number;
  readonly ticketPriceIndex: number; // 0..100 cascade node
}): { effectivePriceEur: number; maxEur: number; marketEur: number } {
  const maxEur = maxTicketEur({
    stadiumCapacity: args.stadiumCapacity,
    divisionTier: args.divisionTier,
    fanCultureIndex: args.fanCultureIndex,
  });
  const marketEur = marketTicketEur(maxEur);
  // Linear interpolation: index=0 → market×0.5; index=50 → market; index=100 → max
  let priceEur: number;
  if (args.ticketPriceIndex <= 50) {
    priceEur = marketEur * 0.5 + (marketEur * 0.5 * args.ticketPriceIndex) / 50;
  } else {
    priceEur = marketEur + ((maxEur - marketEur) * (args.ticketPriceIndex - 50)) / 50;
  }
  return {
    effectivePriceEur: Math.round(priceEur),
    maxEur,
    marketEur,
  };
}

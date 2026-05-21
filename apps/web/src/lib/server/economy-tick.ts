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
import {
  computeEffectiveTicketPrice,
  computeMatchDayRevenue,
  type WorldState,
} from '@smt/shared';
import { computeFinancialStatus } from '@smt/shared/sim/economy/bankruptcy';

export interface EconomyTickResult {
  readonly patchedState: WorldState;
  readonly sponsorRevenue: number;
  readonly merchRevenue: number;
  readonly matchDayRevenue: number;
  readonly matchDayAttendance: number;
  readonly matchDayTicketPriceEur: number;
  /** Per ADR-019 / TR-TVR-009: TV weekly revenue from the active contract. 0 if none. */
  readonly tvRevenue: number;
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
 * When `homeFixtureThisWeek` is true the club hosted a league match this
 * week — match-day ticket revenue is added to the cashflow using
 * `attendance = round(stadium_capacity × fan_attendance / 100)` and the
 * effective ticket price derived from the cascade `ticket_price_index`.
 *
 * Idempotent for the same (state, db) — call per advance.
 */
export async function applyEconomyTick(args: {
  playthroughId: string;
  clubId: string;
  baseState: Readonly<WorldState>;
  /** True when the user's club plays at home this week. */
  homeFixtureThisWeek: boolean;
  /** Division tier for ticket-price math (1=Primera, 2=Segunda-and-below). */
  divisionTier: 1 | 2;
  /**
   * Per ADR-019 / TR-TVR-009: TV weekly revenue from the active contract
   * (0 if NONE/CANCELLED/EXPIRED). Caller reads this via runTVPrePhase().
   * When undefined, falls back to 0 (legacy behaviour).
   */
  tvWeeklyEurK?: number;
  /**
   * Per F-TV4 (tv-rights GDD): manager fan_loyalty value [0,50] for the
   * matchday attendance boost. When undefined, treated as 0 (no boost).
   */
  fanLoyalty?: number;
}): Promise<EconomyTickResult> {
  const { playthroughId, clubId, baseState, homeFixtureThisWeek, divisionTier } = args;
  const tvWeeklyEurK = args.tvWeeklyEurK ?? 0;
  const fanLoyalty = args.fanLoyalty ?? 0;

  const totals = await db.transaction(async (tx) =>
    readEconomyTotals(tx, playthroughId, clubId),
  );

  // Merch revenue stub — auto-calculated from fan_momentum, fanBase, and
  // squad availability. Range: ~0.5..6 €K/week for a D5 club.
  //   base = fanBase/100 (so 500 fans → 5 base units)
  //   momentum_multiplier = fan_momentum / 50 (50 = neutral = 1×)
  //   availability_multiplier = squad_available_pct / 100
  // No UI to influence this in MVP — it's a derived background income.
  const stateRead = baseState as Record<string, number>;
  const fanMomentum = stateRead['fan_momentum'] ?? 50;
  const squadAvail = stateRead['squad_available_pct'] ?? 80;
  const merchRevenue = Math.round(
    (5) * (fanMomentum / 50) * (squadAvail / 100) * 10,
  ) / 10;

  // Match-day revenue — gate-receipts. Only applied when the club hosts.
  let matchDayRevenue = 0;
  let matchDayAttendance = 0;
  let matchDayTicketPriceEur = 0;
  if (homeFixtureThisWeek) {
    const stadiumCapacity = stateRead['stadium_capacity'] ?? 3000;
    const fanAttendance = stateRead['fan_attendance'] ?? 40;
    const fanCultureIndex = stateRead['fan_culture_index'] ?? 35;
    const ticketPriceIndex = stateRead['ticket_price_index'] ?? 50;
    matchDayAttendance = Math.round(stadiumCapacity * (fanAttendance / 100));
    const pricing = computeEffectiveTicketPrice({
      stadiumCapacity,
      divisionTier,
      fanCultureIndex,
      ticketPriceIndex,
    });
    matchDayTicketPriceEur = pricing.effectivePriceEur;
    matchDayRevenue = computeMatchDayRevenue({
      attendance: matchDayAttendance,
      ticketPriceEur: matchDayTicketPriceEur,
      fanLoyalty,
      stadiumCapacity,
    });
  }

  const balanceBefore = baseState['financial_balance' as keyof WorldState] ?? 0;
  const cashflow =
    totals.sponsorRevenue +
    merchRevenue +
    matchDayRevenue +
    tvWeeklyEurK -
    totals.staffCost -
    totals.playerWages;
  const balanceAfter = balanceBefore + cashflow;

  // Bug BUG-FIN-1 fix (Pablo playtest Sprint 12 2026-05-21):
  // financial_status must be recomputed AFTER the economy tick updates
  // financial_balance. The cascade engine computes it from the PREVIOUS
  // week's balance (before economy runs), so a player sitting on −1M€
  // balance + −64k€/week cashflow would still read "Sano" (last week's
  // status). Patch financial_status with the post-economy values here.
  const financialStatusAfter = computeFinancialStatus(balanceAfter, cashflow);

  const patchedState = {
    ...stateRead,
    financial_balance: balanceAfter,
    weekly_cashflow: cashflow,
    financial_status: financialStatusAfter,
    sponsor_revenue_weekly: totals.sponsorRevenue,
    merch_revenue_weekly: merchRevenue,
    matchday_revenue_weekly: matchDayRevenue,
    tv_revenue_weekly: tvWeeklyEurK,
    staff_cost_weekly: totals.staffCost,
    player_wages_weekly: totals.playerWages,
  } as unknown as WorldState;

  return {
    patchedState,
    sponsorRevenue: totals.sponsorRevenue,
    merchRevenue,
    matchDayRevenue,
    matchDayAttendance,
    matchDayTicketPriceEur,
    tvRevenue: tvWeeklyEurK,
    staffCost: totals.staffCost,
    playerWages: totals.playerWages,
    cashflow,
    balanceBefore,
    balanceAfter,
  };
}

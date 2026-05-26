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
  clubs,
  eq,
  and,
  sql,
  type Db,
} from '@smt/db';
import {
  computeEffectiveTicketPrice,
  computeMatchDayRevenue,
  computeMerchSales,
  computeConcessionRevenue,
  type WorldState,
} from '@smt/shared';
import { computeFinancialStatus } from '@smt/shared/sim/economy/bankruptcy';

export interface EconomyTickResult {
  readonly patchedState: WorldState;
  readonly sponsorRevenue: number;
  readonly merchRevenue: number;
  /** Tienda (#39): merch + concession sales on home matches. 0 otherwise. */
  readonly commercialRevenue: number;
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
  /** Seed for per-match attendance variance (Pablo 2026-05-26). */
  attendanceSeed?: string;
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
  let commercialRevenue = 0;
  let merchSoldUnits = 0;
  let merchRevenueEur = 0;
  let concessionRevenueEur = 0;
  if (homeFixtureThisWeek) {
    const stadiumCapacity = stateRead['stadium_capacity'] ?? 3000;
    const fanAttendance = stateRead['fan_attendance'] ?? 40;
    const fanCultureIndex = stateRead['fan_culture_index'] ?? 35;
    const ticketPriceIndex = stateRead['ticket_price_index'] ?? 50;
    // Pablo 2026-05-26: attendance now varies with form (fan_momentum) + a
    // deterministic random jitter, instead of always the same number.
    //   momentumFactor: fan_momentum 50 = neutral; ±0.3 at extremes (0/100)
    //   jitter: ±12% deterministic per (playthrough, week)
    const momentumFactor = 1 + ((fanMomentum - 50) / 50) * 0.3;
    let jitter = 1;
    if (args.attendanceSeed) {
      const h = [...args.attendanceSeed].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) >>> 0;
      jitter = 0.88 + ((h % 1000) / 1000) * 0.24; // [0.88, 1.12]
    }
    const baseAtt = stadiumCapacity * (fanAttendance / 100) * momentumFactor * jitter;
    matchDayAttendance = Math.max(0, Math.min(stadiumCapacity, Math.round(baseAtt)));
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

    // Tienda (#39, Pablo 2026-05-27): merch + concession sales. ADDITIVE +
    // isolated — reads the club's commercial columns, sells against attendance,
    // decrements merch stock. Wrapped so any failure can't corrupt the core tick.
    try {
      const [cc] = await db
        .select({
          merchScarfPrice: clubs.merchScarfPrice,
          merchScarfStock: clubs.merchScarfStock,
          merchCapPrice: clubs.merchCapPrice,
          merchCapStock: clubs.merchCapStock,
          merchShirtPrice: clubs.merchShirtPrice,
          merchShirtStock: clubs.merchShirtStock,
          concessionFoodPrice: clubs.concessionFoodPrice,
          concessionSodaPrice: clubs.concessionSodaPrice,
          concessionBeerPrice: clubs.concessionBeerPrice,
          concessionWaterPrice: clubs.concessionWaterPrice,
        })
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);
      if (cc) {
        // Deterministic jitter per match (±15%) — seeded by attendance value.
        const jitter = 0.85 + ((matchDayAttendance * 7919) % 300) / 1000; // [0.85, 1.15)
        const scarf = computeMerchSales({ kind: 'scarf', price: cc.merchScarfPrice, stock: cc.merchScarfStock }, matchDayAttendance, jitter);
        const cap = computeMerchSales({ kind: 'cap', price: cc.merchCapPrice, stock: cc.merchCapStock }, matchDayAttendance, jitter);
        const shirt = computeMerchSales({ kind: 'shirt', price: cc.merchShirtPrice, stock: cc.merchShirtStock }, matchDayAttendance, jitter);
        // Merch revenue is in € (price is €) → convert to €K for cashflow consistency.
        const merchEur = scarf.revenue + cap.revenue + shirt.revenue;
        const concEur = computeConcessionRevenue(
          { food: cc.concessionFoodPrice, soda: cc.concessionSodaPrice, beer: cc.concessionBeerPrice, water: cc.concessionWaterPrice },
          matchDayAttendance,
          jitter,
        );
        commercialRevenue = Math.round((merchEur + concEur) / 1000); // €K
        merchRevenueEur = merchEur;
        concessionRevenueEur = concEur;
        merchSoldUnits = scarf.sold + cap.sold + shirt.sold;
        // Persist stock decrements.
        if (scarf.sold + cap.sold + shirt.sold > 0) {
          await db
            .update(clubs)
            .set({
              merchScarfStock: scarf.remainingStock,
              merchCapStock: cap.remainingStock,
              merchShirtStock: shirt.remainingStock,
            })
            .where(eq(clubs.id, clubId));
        }
      }
    } catch {
      // Commercial sales must never break the core economy tick.
    }
  }

  const balanceBefore = baseState['financial_balance' as keyof WorldState] ?? 0;
  const cashflow =
    totals.sponsorRevenue +
    merchRevenue +
    commercialRevenue +
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
    // Tienda (#39): last home-match economics for the live-match display.
    last_home_attendance: matchDayAttendance,
    last_home_gate_eur: Math.round(matchDayRevenue * 1000),
    last_home_merch_eur: Math.round(merchRevenueEur),
    last_home_merch_units: merchSoldUnits,
    last_home_concession_eur: Math.round(concessionRevenueEur),
  } as unknown as WorldState;

  return {
    patchedState,
    sponsorRevenue: totals.sponsorRevenue,
    merchRevenue,
    commercialRevenue,
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

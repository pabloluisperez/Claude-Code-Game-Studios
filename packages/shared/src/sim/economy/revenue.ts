/**
 * F8 — Weekly revenue calculator.
 *
 * Per ADR-014 §Execution Order + GDD economy.md §F2 + §F4:
 *   revenue = ticketRevenue + sponsorRevenue + tvRights
 *
 * Pure function. No DB. No rng.
 *
 * Story: ECONOMY-002 (TR-ECO-002)
 * Control Manifest: 2026-05-19
 */

import {
  MARKET_TICKET_RATIO,
  MAX_TICKET_FLOOR_PRIMERA,
  MAX_TICKET_FLOOR_SEGUNDA,
  PRIMERA_REFERENCE_MAX,
  STADIUM_CAPACITY_SATURATION,
  TICKET_SNAP_STEP,
  TV_RIGHTS_PRIMERA,
  TV_RIGHTS_SEGUNDA,
} from './constants.js';

// ── MAX_TICKET_EUR + market reference (ADR-014 OQ-ECO-06) ─────────────────────

export interface MaxTicketArgs {
  readonly stadiumCapacity: number;
  readonly divisionTier: 1 | 2;
  readonly fanCultureIndex: number;
}

/**
 * Maximum ticket price per ADR-014 formula:
 *
 *   computed = PRIMERA_REFERENCE_MAX × capacityFactor × divisionFactor × cultureFactor
 *   capacityFactor = min(1.0, stadiumCapacity / 30000)
 *   divisionFactor = 1.0 for D1, 0.55 for D2
 *   cultureFactor = 0.6 + (fanCultureIndex / 100) × 0.4   → [0.6, 1.0]
 *   result = max(FLOOR, snap(computed, 5))                → 5 EUR granularity
 *
 * Per-division floor: ensures small clubs have playable choice (Real Pueblo case
 * gets math=2.44 → floor to MAX_TICKET_FLOOR_SEGUNDA=25 per ADR-014 slice override).
 */
export function maxTicketEur(args: Readonly<MaxTicketArgs>): number {
  const capacityFactor = Math.min(1.0, args.stadiumCapacity / STADIUM_CAPACITY_SATURATION);
  const divisionFactor = args.divisionTier === 1 ? 1.0 : 0.55;
  const cultureFactor = 0.6 + (args.fanCultureIndex / 100) * 0.4;
  const computed =
    PRIMERA_REFERENCE_MAX * capacityFactor * divisionFactor * cultureFactor;
  const snapped = Math.round(computed / TICKET_SNAP_STEP) * TICKET_SNAP_STEP;
  const floor = args.divisionTier === 1 ? MAX_TICKET_FLOOR_PRIMERA : MAX_TICKET_FLOOR_SEGUNDA;
  return Math.max(floor, snapped);
}

/** Market reference = ~40% of max, snapped to 5 €. */
export function marketTicketEur(maxEur: number): number {
  const market = maxEur * MARKET_TICKET_RATIO;
  const snapped = Math.round(market / TICKET_SNAP_STEP) * TICKET_SNAP_STEP;
  return Math.max(TICKET_SNAP_STEP, snapped);
}

// ── Match-day revenue ────────────────────────────────────────────────────────

export interface MatchDayRevenueArgs {
  readonly attendance: number;
  /** Effective ticket price in €. */
  readonly ticketPriceEur: number;
}

/**
 * Match-day ticket revenue in €K.
 * AC-ECO-13: revenue = round(attendance × ticketPrice / 1000) — euros to €K.
 */
export function computeMatchDayRevenue(args: Readonly<MatchDayRevenueArgs>): number {
  const grossEur = args.attendance * args.ticketPriceEur;
  return Math.round(grossEur / 1000);
}

// ── Effective ticket price (ADR-014 §Ticket Price Index) ─────────────────────

export interface EffectiveTicketPriceArgs {
  readonly stadiumCapacity: number;
  readonly divisionTier: 1 | 2;
  readonly fanCultureIndex: number;
  /** Manager-controlled ticket_price_index 0..100. */
  readonly ticketPriceIndex: number;
}

export interface EffectiveTicketPriceResult {
  readonly effectivePriceEur: number;
  readonly maxEur: number;
  readonly marketEur: number;
}

/**
 * Linear interpolation of effective ticket price from `ticket_price_index`:
 *   index=0   → market × 0.5
 *   index=50  → market
 *   index=100 → max
 */
export function computeEffectiveTicketPrice(
  args: Readonly<EffectiveTicketPriceArgs>,
): EffectiveTicketPriceResult {
  const maxEur = maxTicketEur({
    stadiumCapacity: args.stadiumCapacity,
    divisionTier: args.divisionTier,
    fanCultureIndex: args.fanCultureIndex,
  });
  const marketEur = marketTicketEur(maxEur);
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

// ── Sponsor income ───────────────────────────────────────────────────────────

export interface ActiveSponsorRow {
  readonly status: string;
  readonly weeklyEurK: number;
}

/** Sum of weekly_eur_k for sponsors with status === 'active'. */
export function computeSponsorIncome(sponsors: readonly ActiveSponsorRow[]): number {
  let total = 0;
  for (const s of sponsors) {
    if (s.status === 'active') total += s.weeklyEurK;
  }
  return total;
}

// ── TV rights ────────────────────────────────────────────────────────────────

/**
 * @deprecated Per ADR-019 + tv-rights GDD F-TV1: TV revenue is now contract-driven,
 *   not a flat constant per division. Callers should use the tv-rights service's
 *   `readTVWeeklyRevenue(tx, playthroughId)` and pass the result to
 *   `computeWeeklyRevenue` via the `tvWeeklyEurKOverride` parameter.
 *
 * Kept temporarily to preserve compatibility with callers that haven't migrated.
 * Will be removed when all callers pass `tvWeeklyEurKOverride`.
 */
export function computeTvRights(divisionTier: 1 | 2): number {
  return divisionTier === 1 ? TV_RIGHTS_PRIMERA : TV_RIGHTS_SEGUNDA;
}

// ── Aggregate weekly revenue ─────────────────────────────────────────────────

export interface WeeklyRevenueArgs {
  readonly matchDayRevenue: number;        // 0 when no home match this week
  readonly sponsors: readonly ActiveSponsorRow[];
  readonly divisionTier: 1 | 2;
  /**
   * Per ADR-019 / TR-TVR-009: override TV revenue with the actual contract rate
   * from the tv-rights module (0 if no ACTIVE contract). When provided, this
   * value replaces the flat `computeTvRights(divisionTier)` lookup.
   *
   * Callers without a tv-rights integration may omit this and fall back to the
   * deprecated flat constants — to be removed once all callers migrate.
   */
  readonly tvWeeklyEurKOverride?: number;
}

export interface WeeklyRevenueBreakdown {
  readonly matchDay: number;
  readonly sponsors: number;
  readonly tvRights: number;
  readonly total: number;
}

export function computeWeeklyRevenue(
  args: Readonly<WeeklyRevenueArgs>,
): WeeklyRevenueBreakdown {
  const sponsorIncome = computeSponsorIncome(args.sponsors);
  // Per TR-TVR-009: prefer the contract-driven override when provided.
  // Falls back to the legacy flat constant if not (during migration window).
  const tvRights =
    args.tvWeeklyEurKOverride !== undefined
      ? args.tvWeeklyEurKOverride
      : computeTvRights(args.divisionTier);
  const total = args.matchDayRevenue + sponsorIncome + tvRights;
  return {
    matchDay: args.matchDayRevenue,
    sponsors: sponsorIncome,
    tvRights,
    total,
  };
}

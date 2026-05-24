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
  /**
   * Per F-TV4 (tv-rights GDD): if provided, attendance is boosted by
   * (1 + fan_loyalty × 0.005) and clamped at the stadium capacity.
   * Callers without a fan_loyalty integration may omit this — the value is
   * treated as 0 (no boost).
   */
  readonly fanLoyalty?: number;
  /**
   * Stadium capacity in seats (the upper bound for boosted attendance).
   * Required when `fanLoyalty > 0` to enforce the F-TV4 clamp; otherwise
   * the function uses `attendance` as-is and the clamp is moot.
   */
  readonly stadiumCapacity?: number;
}

/** F-TV4 attendance multiplier — 0.5% per loyalty point. */
const F_TV4_FAN_LOYALTY_ATTENDANCE_FACTOR = 0.005;

/**
 * Match-day ticket revenue in €K.
 * AC-ECO-13: revenue = round(effectiveAttendance × ticketPrice / 1000) — euros to €K.
 *
 * Per OQ-TV-03 resolution: F-TV4 is applied here in the matchday revenue path
 * (not in cascade-engine C8). When `fanLoyalty` is provided, the multiplier
 * `(1 + fanLoyalty × 0.005)` is applied to attendance, clamped to
 * `stadiumCapacity` so total tickets sold never exceeds physical capacity.
 */
export function computeMatchDayRevenue(args: Readonly<MatchDayRevenueArgs>): number {
  const loyalty = args.fanLoyalty ?? 0;
  let effectiveAttendance = args.attendance;
  if (loyalty > 0) {
    const boosted = args.attendance * (1 + loyalty * F_TV4_FAN_LOYALTY_ATTENDANCE_FACTOR);
    effectiveAttendance =
      args.stadiumCapacity !== undefined
        ? Math.min(args.stadiumCapacity, boosted)
        : boosted;
  }
  const grossEur = effectiveAttendance * args.ticketPriceEur;
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

// ── Aggregate weekly revenue ─────────────────────────────────────────────────
//
// Per ADR-019 + TR-TVR-009: TV revenue is contract-driven. The caller MUST
// pass `tvWeeklyEurK` (read from the active tv_contracts row, 0 if none).
// The legacy `computeTvRights(divisionTier)` and flat constants are removed.

export interface WeeklyRevenueArgs {
  readonly matchDayRevenue: number;        // 0 when no home match this week
  readonly sponsors: readonly ActiveSponsorRow[];
  /**
   * Per ADR-019 / TR-TVR-009: TV revenue from the active contract (0 if
   * NONE/CANCELLED/EXPIRED). Callers read this via TVRightsService
   * `readTVWeeklyRevenue` or the dashboard's `runTVPrePhase`.
   */
  readonly tvWeeklyEurK: number;
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
  const tvRights = args.tvWeeklyEurK;
  const total = args.matchDayRevenue + sponsorIncome + tvRights;
  return {
    matchDay: args.matchDayRevenue,
    sponsors: sponsorIncome,
    tvRights,
    total,
  };
}

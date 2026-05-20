/**
 * TV Rights tuning constants — per GDD `design/gdd/tv-rights.md` Tuning Knobs section.
 *
 * All economic + safety thresholds in one place. Changing values here is a
 * balance change; algorithmic changes require code edits in the corresponding
 * function file.
 */

import type { TVTier, TVDurationSeasons, TVDivision } from './types.js';

/**
 * Base weekly rate (in centavos = 0.01 €K) per tier. Integer arithmetic preserved
 * through F-TV1 to avoid IEEE 754 drift (ADR-019 §1).
 *
 *   LOCAL 0.53, REGIONAL 1.75, NACIONAL 5.30 €K/sem (in D2 1yr).
 */
export const TV_BASE_CENTS: Record<TVTier, number> = {
  LOCAL: 53,
  REGIONAL: 175,
  NACIONAL: 530,
};

export const DIVISION_MULTIPLIER_CENTS: Record<TVDivision, number> = {
  D2: 100,
  D1: 135,
};

export const DURATION_MULTIPLIER_CENTS: Record<TVDurationSeasons, number> = {
  1: 100,
  2: 105,
  3: 110,
};

/** Per-week corruption_exposure delta while contract is ACTIVE. */
export const CORRUPTION_DELTA_PER_WEEK: Record<TVTier, number> = {
  LOCAL: -0.5,
  REGIONAL: 0.5,
  NACIONAL: 1.5,
};

/** Channel cancels the contract when corruption_exposure crosses this threshold (upward). */
export const TV_SCANDAL_THRESHOLD = 60;

/** Ceiling for corruption_exposure — aligned with cascade_node_default_range [0, 100]. */
export const CORRUPTION_MAX = 100;

/** Midseason penalty: replacement contract pays 70% of base for the cancelled tier's TIER_BELOW. */
export const MID_SEASON_PENALTY_FACTOR_CENTS = 70;

/**
 * Cancellation triggers midseason offer only if at least 3 weeks remain (i.e., week ≤ 35).
 * AC-TV-20: week=35 → offer generated; week=36 → no offer.
 */
export const MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF = 35;

/** REGIONAL unlock: D2 prev_season_final_position ≤ this value (in addition to rep≥2 or D1 actual). */
export const REGIONAL_MIN_POSITION = 10;

/** Reputation threshold for unlocking REGIONAL (in addition to D2 pos≤10 or D1). */
export const REGIONAL_MIN_REPUTATION = 2;

/** Reputation threshold for unlocking NACIONAL (in addition to D1 actual). */
export const NACIONAL_MIN_REPUTATION = 4;

/** Fan loyalty awarded per rejection (capped at FAN_LOYALTY_CAP). */
export const FAN_LOYALTY_PER_REJECTION = 10;

/** Maximum cumulative fan_loyalty (5 rejections × 10). */
export const FAN_LOYALTY_CAP = 50;

/** F-TV4 multiplier — 0.5% additional fan_attendance per loyalty point. */
export const FAN_LOYALTY_ATTENDANCE_FACTOR = 0.005;

/** XP grants to financial_acumen on signing (no XP for LOCAL or rejection). */
export const XP_REGIONAL_SIGN = 10;
export const XP_NACIONAL_SIGN = 25;

/**
 * Risk flag thresholds for UI ⚠️ indicators (per GDD Rule 5b + UI Requirements).
 *   - NACIONAL 3yr: any corruption > 0 at signing → cliff in T2.
 *   - REGIONAL 2yr: corruption ≥ 22 at signing → T2 ends at 60.0+ (silent cancel).
 */
export const NACIONAL_3YR_RISK_CORRUPTION_THRESHOLD = 0;
export const REGIONAL_2YR_RISK_CORRUPTION_THRESHOLD = 22;

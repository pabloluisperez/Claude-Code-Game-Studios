/**
 * F-TV2 midseason offer construction — TIER_BELOW + 70% penalty rate.
 *
 * Generated only if a contract is cancelled at week ≤ 35 (≥ 3 weeks remaining).
 * TIER_BELOW[LOCAL] = LOCAL is the "theoretical" case — materialises only when
 * cascade-engine injects external corruption above LOCAL's negative delta
 * (AC-TV-47). For F-TV3-driven cancellations, LOCAL cannot self-cancel.
 *
 * Story: TVR-007
 * Control Manifest: 2026-05-19
 */

import type { TVDivision, TVMidseasonOfferPayload, TVTier } from './types.js';
import { MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF } from './constants.js';
import { calculateMidseasonRate } from './rate-calculation.js';

export const TIER_BELOW: Record<TVTier, TVTier> = {
  NACIONAL: 'REGIONAL',
  REGIONAL: 'LOCAL',
  LOCAL: 'LOCAL',
};

/**
 * Returns null if currentWeek > 35 (less than 3 weeks remaining → no offer per AC-TV-11).
 * Otherwise constructs the typed payload for a tv_midseason_offer STOP event.
 */
export function buildMidseasonOffer(
  cancelledTier: TVTier,
  currentWeek: number,
  currentDivision: TVDivision,
  season: number,
): TVMidseasonOfferPayload | null {
  if (currentWeek > MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF) return null;
  const midseasonTier = TIER_BELOW[cancelledTier];
  return {
    type: 'tv_midseason_offer',
    season,
    cancelledTier,
    offer: {
      tier: midseasonTier,
      weeklyRateEurK: calculateMidseasonRate(midseasonTier, currentDivision),
      weeksRemaining: 38 - currentWeek,
      currentDivision,
    },
    defaultOption: 'reject',
  };
}

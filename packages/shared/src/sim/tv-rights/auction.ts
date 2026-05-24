/**
 * TV auction generator — unlock rules + offer payload construction.
 *
 * Per ADR-019 §8 + GDD Core Rule 2:
 *   - LOCAL always available.
 *   - REGIONAL: D2 prev_pos ≤ 10 OR rep ≥ 2 OR D1 actual.
 *   - NACIONAL: D1 actual OR rep ≥ 4.
 *   - Corruption ≥ TV_SCANDAL_THRESHOLD (60) blocks REGIONAL + NACIONAL.
 *   - T1 (prev_season_final_position === null): only LOCAL.
 *
 * Risk flags (⚠️ for UI):
 *   - REGIONAL_2YR: corruption ≥ 22 → T2 ends at 60+ (silent cancel).
 *   - NACIONAL_3YR: corruption > 0 → T2 starts at corruption + 57 (likely cancel in T2).
 *
 * Story: TVR-003
 * Control Manifest: 2026-05-19
 */

import type {
  TVAuctionOffer,
  TVAuctionPayload,
  TVDivision,
  TVDurationOption,
  TVDurationSeasons,
  TVTier,
} from './types.js';
import {
  CORRUPTION_DELTA_PER_WEEK,
  NACIONAL_3YR_RISK_CORRUPTION_THRESHOLD,
  NACIONAL_MIN_REPUTATION,
  REGIONAL_2YR_RISK_CORRUPTION_THRESHOLD,
  REGIONAL_MIN_POSITION,
  REGIONAL_MIN_REPUTATION,
  TV_SCANDAL_THRESHOLD,
} from './constants.js';
import { calculateTVRate, getLegalDurations } from './rate-calculation.js';

export interface AuctionContext {
  readonly prevSeasonFinalPosition: number | null;
  readonly currentDivision: TVDivision;
  readonly managerReputation: number;
  readonly corruptionExposure: number;
  readonly season: number;
}

/**
 * Returns the tiers available to the manager this season — ordered LOCAL, REGIONAL, NACIONAL.
 *
 * Pure deterministic function — same inputs always produce same output.
 */
export function generateTVAuctionOffers(ctx: AuctionContext): readonly TVTier[] {
  const offers: TVTier[] = ['LOCAL'];

  // T1: only LOCAL — no proxy, no reputation path (GDD AC-TV-12).
  if (ctx.prevSeasonFinalPosition === null) return offers;

  // Corruption block: regional + nacional withdrawn while exposure ≥ threshold.
  if (ctx.corruptionExposure >= TV_SCANDAL_THRESHOLD) return offers;

  // REGIONAL: D2 pos ≤ 10 OR rep ≥ 2 OR D1 actual.
  const regionalUnlocked =
    (ctx.currentDivision === 'D2' && ctx.prevSeasonFinalPosition <= REGIONAL_MIN_POSITION) ||
    ctx.managerReputation >= REGIONAL_MIN_REPUTATION ||
    ctx.currentDivision === 'D1';
  if (regionalUnlocked) offers.push('REGIONAL');

  // NACIONAL: D1 actual OR rep ≥ 4.
  const nacionalUnlocked =
    ctx.currentDivision === 'D1' || ctx.managerReputation >= NACIONAL_MIN_REPUTATION;
  if (nacionalUnlocked) offers.push('NACIONAL');

  return offers;
}

/** Build per-tier duration options with computed rates + risk flags. */
function buildDurationOption(
  tier: TVTier,
  duration: TVDurationSeasons,
  ctx: AuctionContext,
): TVDurationOption {
  const corruptionDeltaPerWeek = CORRUPTION_DELTA_PER_WEEK[tier]!;
  const riskFlag = deriveRiskFlag(tier, duration, ctx.corruptionExposure);
  const option: TVDurationOption = {
    durationSeasons: duration,
    weeklyRateEurK: calculateTVRate(tier, ctx.currentDivision, duration),
    corruptionDeltaPerWeek,
    corruptionAccumSeason: Math.round(corruptionDeltaPerWeek * 38 * 100) / 100,
    ...(riskFlag !== undefined && { riskFlag }),
  };
  return option;
}

type TVRiskFlagValue = NonNullable<TVDurationOption['riskFlag']>;
function deriveRiskFlag(
  tier: TVTier,
  duration: TVDurationSeasons,
  corruptionExposure: number,
): TVRiskFlagValue | undefined {
  if (
    tier === 'NACIONAL' &&
    duration === 3 &&
    corruptionExposure > NACIONAL_3YR_RISK_CORRUPTION_THRESHOLD
  ) {
    return 'NACIONAL_3YR';
  }
  if (
    tier === 'REGIONAL' &&
    duration === 2 &&
    corruptionExposure >= REGIONAL_2YR_RISK_CORRUPTION_THRESHOLD
  ) {
    return 'REGIONAL_2YR';
  }
  return undefined;
}

/** Construct the full TVAuctionPayload for an `tv_auction` STOP event. */
export function buildTVAuctionPayload(ctx: AuctionContext): TVAuctionPayload {
  const availableTiers = generateTVAuctionOffers(ctx);
  const offers: TVAuctionOffer[] = availableTiers.map((tier) => ({
    tier,
    durationOptions: getLegalDurations(tier).map((d) => buildDurationOption(tier, d, ctx)),
  }));
  return {
    type: 'tv_auction',
    season: ctx.season,
    offers,
    defaultOption: { tier: 'LOCAL', durationSeasons: 1 },
  };
}

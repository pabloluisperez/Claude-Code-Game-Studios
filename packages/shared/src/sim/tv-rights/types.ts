/**
 * TV Rights shared types — used by both server-side modules and frontend
 * (typed event payloads, formula inputs, etc.).
 *
 * Per ADR-019 §8 + ADR-015 union extension.
 */

export type TVTier = 'LOCAL' | 'REGIONAL' | 'NACIONAL';
export type TVStatus = 'NONE' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
export type TVDivision = 'D1' | 'D2';
export type TVDurationSeasons = 1 | 2 | 3;
export type TVCancelReason = 'scrutiny_tv' | 'scrutiny_cascade';
export type TVRiskFlag = 'REGIONAL_2YR' | 'NACIONAL_3YR';

export interface TVDurationOption {
  readonly durationSeasons: TVDurationSeasons;
  /** Computed via F-TV1; stored in DB at signing. */
  readonly weeklyRateEurK: number;
  /** Per-tick corruption delta (LOCAL: -0.5, REGIONAL: +0.5, NACIONAL: +1.5). */
  readonly corruptionDeltaPerWeek: number;
  /** Per-season accumulated (delta × 38) — for UI display. */
  readonly corruptionAccumSeason: number;
  /** ⚠️ Set when the duration carries known risk given current corruption_exposure. */
  readonly riskFlag?: TVRiskFlag;
}

export interface TVAuctionOffer {
  readonly tier: TVTier;
  readonly durationOptions: ReadonlyArray<TVDurationOption>;
}

/** Extension of ADR-015 EventDecisionPayload union — `type: 'tv_auction'` variant. */
export interface TVAuctionPayload {
  readonly type: 'tv_auction';
  readonly season: number;
  readonly offers: ReadonlyArray<TVAuctionOffer>;
  /** Default applied on STOP event timeout — always LOCAL 1yr. */
  readonly defaultOption: { readonly tier: 'LOCAL'; readonly durationSeasons: 1 };
}

/** Extension of ADR-015 EventDecisionPayload union — `type: 'tv_midseason_offer'` variant. */
export interface TVMidseasonOfferPayload {
  readonly type: 'tv_midseason_offer';
  readonly season: number;
  /** Tier that was cancelled; midseason offer is one tier below (TIER_BELOW). */
  readonly cancelledTier: TVTier;
  readonly offer: {
    readonly tier: TVTier;
    readonly weeklyRateEurK: number;
    /** 38 - currentWeek — coverage of the rest of this season. */
    readonly weeksRemaining: number;
    /** Division at the moment of cancellation (not original division_at_signing). */
    readonly currentDivision: TVDivision;
  };
  /** Default applied on STOP event timeout — always 'reject'. */
  readonly defaultOption: 'reject';
}

/** Result of paso 1-5 of the 8-step TV Tick Order — pure function output. */
export interface TVPrePhaseResult {
  /** TV revenue for this week (0 if NONE/CANCELLED, or rate if ACTIVE — 0 if cancelled in paso 4). */
  readonly revenue: number;
  /** Updated FSM state (may transition ACTIVE→CANCELLED in paso 4). */
  readonly newStatus: TVStatus;
  /** corruption_exposure after F-TV3 delta (paso 2 result). */
  readonly corruptionAfterTV: number;
  /** Midseason offer payload to insert as STOP event, if cancelled in paso 4 with week ≤ 35. */
  readonly midseasonOffer?: TVMidseasonOfferPayload;
}

/** Result of paso 6-8 of the 8-step TV Tick Order — pure function output. */
export interface TVPostPhaseResult {
  /** corruption_exposure after cascade injection (paso 6 result). */
  readonly corruptionFinal: number;
  /** True if threshold was crossed by cascade injection (paso 8). */
  readonly cancelledByCascade: boolean;
  /** Midseason offer payload if cancelled by cascade with week ≤ 35. */
  readonly midseasonOffer?: TVMidseasonOfferPayload;
}

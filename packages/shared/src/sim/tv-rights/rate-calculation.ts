/**
 * F-TV1: TV contract weekly rate calculation.
 *
 * `tv_weekly_rate_eur_k = Math.round(TV_BASE_CENTS[tier] × DIVISION_MULTIPLIER_CENTS[div] × DURATION_MULTIPLIER_CENTS[dur] / 10000) / 100`
 *
 * Integer centavo arithmetic — single Math.round at the end. No IEEE 754 drift.
 * Guards reject illegal inputs and tier+duration combinations (LOCAL 2yr/3yr, etc.).
 *
 * Story: TVR-002
 * Control Manifest: 2026-05-19
 */

import type { TVTier, TVDivision, TVDurationSeasons } from './types.js';
import {
  TV_BASE_CENTS,
  DIVISION_MULTIPLIER_CENTS,
  DURATION_MULTIPLIER_CENTS,
} from './constants.js';

/** Thrown when calculateTVRate receives an illegal tier/division/duration combination. */
export class TVRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TVRangeError';
  }
}

/**
 * Legal duration_seasons per tier (per GDD Rule 5b + F-TV1 guards):
 *   LOCAL: 1yr only.
 *   REGIONAL: 1yr or 2yr.
 *   NACIONAL: 1yr or 3yr (no 2yr).
 */
const LEGAL_DURATIONS: Record<TVTier, readonly TVDurationSeasons[]> = {
  LOCAL: [1],
  REGIONAL: [1, 2],
  NACIONAL: [1, 3],
};

function isLegalDivision(value: unknown): value is TVDivision {
  return value === 'D1' || value === 'D2';
}

function isLegalDuration(value: unknown): value is TVDurationSeasons {
  return value === 1 || value === 2 || value === 3;
}

function isLegalTier(value: unknown): value is TVTier {
  return value === 'LOCAL' || value === 'REGIONAL' || value === 'NACIONAL';
}

/**
 * Compute the weekly rate for a tv contract. Pure deterministic function.
 *
 * Throws TVRangeError for: unknown division, invalid duration, illegal tier+duration combo.
 * Caller is expected to map TVRangeError → HTTP 400 in API routes.
 */
export function calculateTVRate(
  tier: TVTier,
  division: TVDivision,
  durationSeasons: TVDurationSeasons,
): number {
  if (!isLegalTier(tier)) throw new TVRangeError(`Unknown tier: ${String(tier)}`);
  if (!isLegalDivision(division)) throw new TVRangeError(`Unknown division: ${String(division)}`);
  if (!isLegalDuration(durationSeasons))
    throw new TVRangeError(`Invalid duration: ${String(durationSeasons)}`);
  if (!LEGAL_DURATIONS[tier].includes(durationSeasons))
    throw new TVRangeError(`Illegal tier+duration: ${tier}/${durationSeasons}`);

  const baseCents = TV_BASE_CENTS[tier]!;
  const divCents = DIVISION_MULTIPLIER_CENTS[division]!;
  const durCents = DURATION_MULTIPLIER_CENTS[durationSeasons]!;

  return Math.round((baseCents * divCents * durCents) / 10000) / 100;
}

/** Returns the list of legal durations for a given tier — used by UI offer generation. */
export function getLegalDurations(tier: TVTier): readonly TVDurationSeasons[] {
  return LEGAL_DURATIONS[tier]!;
}

/** Mid-season replacement rate — per F-TV2. Always at 70% penalty factor. */
export function calculateMidseasonRate(
  midseasonTier: TVTier,
  currentDivision: TVDivision,
): number {
  if (!isLegalTier(midseasonTier))
    throw new TVRangeError(`Unknown tier: ${String(midseasonTier)}`);
  if (!isLegalDivision(currentDivision))
    throw new TVRangeError(`Unknown division: ${String(currentDivision)}`);

  const baseCents = TV_BASE_CENTS[midseasonTier];
  const divCents = DIVISION_MULTIPLIER_CENTS[currentDivision];
  // Hard-coded 70 — see MID_SEASON_PENALTY_FACTOR_CENTS in constants.ts.
  return Math.round((baseCents * divCents * 70) / 10000) / 100;
}

/**
 * TV Rights tick — the 8-step Tick Order from GDD `tv-rights.md`.
 *
 * Per ADR-019 §4:
 *   - applyTVPrePhase = pasos 1-5 (BEFORE cascade injection)
 *   - applyTVPostPhase = pasos 6-8 (AFTER cascade injection)
 *
 * Both are PURE — they consume the contract + corruption + external delta,
 * return the next state. The caller (advance() in apps/api) persists changes
 * inside the open Drizzle transaction.
 *
 * Revenue asymmetry (intentional):
 *   - F-TV3 cancellation (paso 4) → revenue = 0 (cancelled BEFORE paso 5).
 *   - cascade cancellation (paso 8) → revenue preserved from paso 5.
 *
 * Story: TVR-006
 * Control Manifest: 2026-05-19
 */

import type {
  TVDivision,
  TVMidseasonOfferPayload,
  TVPostPhaseResult,
  TVPrePhaseResult,
  TVStatus,
  TVTier,
} from './types.js';
import { CORRUPTION_MAX, TV_SCANDAL_THRESHOLD } from './constants.js';
import {
  applyTVCorruptionDelta,
  crossedTVScandalThreshold,
  roundCorruption,
} from './corruption-delta.js';
import { buildMidseasonOffer } from './midseason-offer.js';

/** Minimal contract view consumed by the tick functions (no DB types here). */
export interface TVTickContract {
  readonly tier: TVTier;
  readonly status: TVStatus;
  /** Numeric — caller parses from Drizzle's string format before passing. */
  readonly weeklyRateEurK: number;
}

/**
 * Pasos 1-5 of the TV Tick Order — runs BEFORE the cascade-engine tick.
 *
 *   1. capture prevCorruption (param `prevCorruption`)
 *   2. F-TV3 delta applied (LOCAL -0.5, REGIONAL +0.5, NACIONAL +1.5)
 *   3. evaluate threshold_crossed_upward_tv
 *   4. if crossed → CANCELLED; emit midseason offer if currentWeek ≤ 35
 *   5. revenue = rate if ACTIVE (post-paso-4), 0 otherwise
 *
 * Cancellation in paso 4 ensures revenue=0 for the cancellation tick (AC-TV-22b).
 */
export function applyTVPrePhase(
  contract: TVTickContract | null,
  prevCorruption: number,
  currentWeek: number,
  currentDivision: TVDivision,
  season: number,
): TVPrePhaseResult {
  // No contract or non-ACTIVE: no delta, no revenue.
  if (!contract || contract.status !== 'ACTIVE') {
    return {
      revenue: 0,
      newStatus: contract?.status ?? 'NONE',
      corruptionAfterTV: prevCorruption,
    };
  }

  // paso 2: F-TV3 delta with clamp + round to 2 decimals.
  const newCorruption = applyTVCorruptionDelta(contract.tier, prevCorruption, 'ACTIVE');

  // paso 3: threshold check.
  const crossed = crossedTVScandalThreshold(prevCorruption, newCorruption);

  if (crossed) {
    // paso 4: CANCELLED + emit midseason offer if week ≤ 35.
    const midseasonOffer = buildMidseasonOffer(contract.tier, currentWeek, currentDivision, season);
    const result: TVPrePhaseResult = {
      revenue: 0,
      newStatus: 'CANCELLED',
      corruptionAfterTV: newCorruption,
      ...(midseasonOffer !== null && { midseasonOffer }),
    };
    return result;
  }

  // paso 5: revenue = rate (status still ACTIVE).
  return {
    revenue: contract.weeklyRateEurK,
    newStatus: 'ACTIVE',
    corruptionAfterTV: newCorruption,
  };
}

/**
 * Pasos 6-8 of the TV Tick Order — runs AFTER the cascade-engine tick.
 *
 *   6. cascade injects externalDelta into corruption_exposure (rounded to 2 decimals)
 *   7. evaluate threshold_crossed_upward_cascade (only if status still ACTIVE)
 *   8. if crossed → CANCELLED; emit midseason offer if currentWeek ≤ 35
 *
 * Revenue is NOT recomputed here — paso 5 already produced the value before
 * cascade injection. This means cascade cancellation preserves the revenue
 * of the cancellation tick (AC-TV-40 asymmetry).
 */
export function applyTVPostPhase(
  contractStatus: TVStatus,
  cancelledTierForOffer: TVTier | null,
  corruptionAfterTV: number,
  externalDelta: number,
  currentWeek: number,
  currentDivision: TVDivision,
  season: number,
): TVPostPhaseResult {
  // Always apply the cascade injection regardless of TV contract state —
  // corruption_exposure is a global node that cascade owns the writes to.
  const safeExternal = roundCorruption(externalDelta);
  const postCascade = roundCorruption(
    Math.min(CORRUPTION_MAX, Math.max(0, corruptionAfterTV + safeExternal)),
  );

  // Only evaluate threshold if contract is still ACTIVE (not already cancelled in paso 4).
  if (contractStatus !== 'ACTIVE') {
    return { corruptionFinal: postCascade, cancelledByCascade: false };
  }

  const crossed = crossedTVScandalThreshold(corruptionAfterTV, postCascade);
  if (!crossed) {
    return { corruptionFinal: postCascade, cancelledByCascade: false };
  }

  // paso 8: CANCELLED by cascade. Emit midseason offer if week ≤ 35.
  const midseasonOffer = cancelledTierForOffer !== null
    ? buildMidseasonOffer(cancelledTierForOffer, currentWeek, currentDivision, season)
    : null;
  const result: TVPostPhaseResult = {
    corruptionFinal: postCascade,
    cancelledByCascade: true,
    ...(midseasonOffer !== null && { midseasonOffer }),
  };
  return result;
}

/** Re-export for the threshold constant — for symmetry of imports. */
export { TV_SCANDAL_THRESHOLD };

/**
 * "Congelación de nómina de emergencia" — catch-up event for Crisis state.
 *
 * Per ADR-014 §Catch-up Mechanic:
 *   - Triggered automatically when financial_status crosses 1→2 (Crisis BLOCKING).
 *   - One-time use per playthrough (tracked here in a JSONB metadata slot on
 *     playthroughs — for MVP we use an in-memory return value; production
 *     should add a metadata field to playthroughs).
 *   - Effect: player wages reduced by PAYROLL_FREEZE_REDUCTION (0.25 = 25%
 *     reduction) for PAYROLL_FREEZE_WEEKS (8 weeks).
 *   - Side effect: player_happiness immediately -15 (one-time delta).
 *
 * Story: ECONOMY-006 (TR-ECO-006)
 * Control Manifest: 2026-05-19
 */

import {
  PAYROLL_FREEZE_HAPPINESS_PENALTY,
  PAYROLL_FREEZE_REDUCTION,
  PAYROLL_FREEZE_WEEKS,
} from '@smt/shared';

export interface PayrollFreezeState {
  /** True when the freeze was already used this playthrough. */
  readonly used: boolean;
  /** Weeks remaining in the active freeze (0 when inactive). */
  readonly weeksRemaining: number;
  /** Week the freeze started (for telemetry). */
  readonly activatedAtWeek: number | null;
}

export const INITIAL_PAYROLL_FREEZE_STATE: PayrollFreezeState = Object.freeze({
  used: false,
  weeksRemaining: 0,
  activatedAtWeek: null,
});

export type FreezeAction =
  | { kind: 'accept'; currentWeek: number }
  | { kind: 'decline' };

export interface FreezeApplicationResult {
  readonly nextState: PayrollFreezeState;
  /** Side-effect: player_happiness delta to apply via cascade Step 3. */
  readonly happinessDelta: number;
  /** Side-effect: payroll multiplier the cost calculator should use this week. */
  readonly payrollMultiplier: number;
  readonly applied: boolean;
  readonly reason?: 'already_used' | 'declined';
}

/**
 * Apply the player's response to a Crisis freeze offer.
 *
 *   Accept: weeksRemaining = 8, used = true, happinessDelta = -15
 *   Decline: state unchanged, no effects
 */
export function applyFreezeDecision(
  current: Readonly<PayrollFreezeState>,
  action: Readonly<FreezeAction>,
): FreezeApplicationResult {
  if (action.kind === 'decline') {
    return {
      nextState: current,
      happinessDelta: 0,
      payrollMultiplier: 1.0,
      applied: false,
      reason: 'declined',
    };
  }
  if (current.used) {
    return {
      nextState: current,
      happinessDelta: 0,
      payrollMultiplier: 1.0,
      applied: false,
      reason: 'already_used',
    };
  }
  return {
    nextState: {
      used: true,
      weeksRemaining: PAYROLL_FREEZE_WEEKS,
      activatedAtWeek: action.currentWeek,
    },
    happinessDelta: PAYROLL_FREEZE_HAPPINESS_PENALTY,
    payrollMultiplier: 1.0 - PAYROLL_FREEZE_REDUCTION,
    applied: true,
  };
}

/**
 * Tick the freeze state forward one week. Returns the current week's payroll
 * multiplier + the next-week state.
 */
export function tickFreezeWeek(
  state: Readonly<PayrollFreezeState>,
): { multiplier: number; next: PayrollFreezeState } {
  if (state.weeksRemaining <= 0) {
    return { multiplier: 1.0, next: state };
  }
  return {
    multiplier: 1.0 - PAYROLL_FREEZE_REDUCTION,
    next: {
      used: state.used,
      weeksRemaining: state.weeksRemaining - 1,
      activatedAtWeek: state.activatedAtWeek,
    },
  };
}

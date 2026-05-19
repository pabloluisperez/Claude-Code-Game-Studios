/**
 * Bankruptcy FSM — deterministic financial_status from (balance, cashflow).
 *
 * Per ADR-014 §Bankruptcy FSM:
 *   Quiebra (3): balance < -200 AND cashflow < -20
 *   Crisis  (2): balance < CRISIS_BALANCE (-50) AND cashflow < -10
 *   En Riesgo (1): balance < EN_RIESGO_BALANCE (50) OR cashflow < -15
 *   Sano (0): otherwise
 *
 * The crossings are emitted by ADR-008's threshold detector against the
 * `financial_status` cascade node. ADVISORY at 0→1; BLOCKING at 1→2 and 2→3.
 *
 * Pure function. No DB. No rng.
 *
 * Story: ECONOMY-004 (TR-ECO-004)
 * Control Manifest: 2026-05-19
 */

import {
  CRISIS_BALANCE_THRESHOLD,
  CRISIS_CASHFLOW_THRESHOLD,
  EN_RIESGO_BALANCE_THRESHOLD,
  EN_RIESGO_CASHFLOW_THRESHOLD,
  QUIEBRA_BALANCE_THRESHOLD,
  QUIEBRA_CASHFLOW_THRESHOLD,
} from './constants.js';

export type FinancialStatus = 0 | 1 | 2 | 3;

export const FINANCIAL_STATUS_NAMES: Readonly<Record<FinancialStatus, string>> = Object.freeze({
  0: 'Sano',
  1: 'En Riesgo',
  2: 'Crisis',
  3: 'Quiebra',
});

/**
 * Compute the financial_status node value from current balance + cashflow.
 *
 * Note: per ADR-014 §Risks — there's NO hysteresis in this base formula.
 * Hysteresis is handled at the threshold-detector layer (require sustained
 * 2-week negative cashflow before downgrading Sano → En Riesgo). This
 * function returns the instantaneous state; the cascade engine's threshold
 * detector decides whether to emit a crossing event.
 */
export function computeFinancialStatus(
  balance: number,
  cashflow: number,
): FinancialStatus {
  // Quiebra — terminal
  if (balance < QUIEBRA_BALANCE_THRESHOLD && cashflow < QUIEBRA_CASHFLOW_THRESHOLD) {
    return 3;
  }
  // Crisis
  if (balance < CRISIS_BALANCE_THRESHOLD && cashflow < CRISIS_CASHFLOW_THRESHOLD) {
    return 2;
  }
  // En Riesgo (balance below threshold OR cashflow sustained negative)
  if (balance < EN_RIESGO_BALANCE_THRESHOLD || cashflow < EN_RIESGO_CASHFLOW_THRESHOLD) {
    return 1;
  }
  return 0;
}

export interface BankruptcyTransition {
  readonly from: FinancialStatus;
  readonly to: FinancialStatus;
  readonly priority: 'ADVISORY' | 'BLOCKING';
  readonly reason: string;
}

/**
 * Compute the transition (if any) between prev and next financial status.
 * Returns null when no transition occurred.
 *
 * ADR-008/014 mapping:
 *   0 → 1  ADVISORY  `economy:en_riesgo`
 *   1 → 2  BLOCKING  `economy:crisis`
 *   2 → 3  BLOCKING  `economy:quiebra`
 *   downgrades (recovery) are tracked but priority='ADVISORY'.
 */
export function bankruptcyTransition(
  prev: FinancialStatus,
  next: FinancialStatus,
): BankruptcyTransition | null {
  if (prev === next) return null;
  // Worsening transitions
  if (next > prev) {
    if (next === 1) {
      return { from: prev, to: next, priority: 'ADVISORY', reason: 'economy:en_riesgo' };
    }
    if (next === 2) {
      return { from: prev, to: next, priority: 'BLOCKING', reason: 'economy:crisis' };
    }
    if (next === 3) {
      return { from: prev, to: next, priority: 'BLOCKING', reason: 'economy:quiebra' };
    }
  }
  // Recovery — emit an ADVISORY informational
  return { from: prev, to: next, priority: 'ADVISORY', reason: 'economy:recovery' };
}

/**
 * Unit tests for bankruptcy FSM.
 * Story: ECONOMY-004
 */

import { describe, it, expect } from 'vitest';
import {
  bankruptcyTransition,
  computeFinancialStatus,
  FINANCIAL_STATUS_NAMES,
} from '../../src/sim/economy/bankruptcy.js';

describe('computeFinancialStatus', () => {
  it('test_sano_default', () => {
    expect(computeFinancialStatus(500, 5)).toBe(0);
  });

  it('test_en_riesgo_balance_low', () => {
    // balance below EN_RIESGO_BALANCE_THRESHOLD=50
    expect(computeFinancialStatus(30, 0)).toBe(1);
  });

  it('test_en_riesgo_cashflow_sustained_negative', () => {
    // balance OK but cashflow ≤ -15
    expect(computeFinancialStatus(500, -16)).toBe(1);
  });

  it('test_crisis_both_negative', () => {
    // balance < CRISIS_BALANCE_THRESHOLD=-50 AND cashflow < -10
    expect(computeFinancialStatus(-60, -11)).toBe(2);
  });

  it('test_crisis_requires_both_conditions', () => {
    // balance < -50 but cashflow ≥ -10 → only En Riesgo
    expect(computeFinancialStatus(-60, 0)).toBe(1);
  });

  it('test_quiebra_terminal_deep_negative', () => {
    expect(computeFinancialStatus(-300, -25)).toBe(3);
  });

  it('test_quiebra_requires_both', () => {
    // balance < -200 but cashflow ≥ -20 → still Crisis (or En Riesgo depending on cashflow)
    expect(computeFinancialStatus(-300, -15)).toBe(2);
  });
});

describe('bankruptcyTransition', () => {
  it('test_sano_to_en_riesgo_advisory', () => {
    const t = bankruptcyTransition(0, 1);
    expect(t).not.toBeNull();
    expect(t!.priority).toBe('ADVISORY');
    expect(t!.reason).toBe('economy:en_riesgo');
  });

  it('test_en_riesgo_to_crisis_blocking', () => {
    const t = bankruptcyTransition(1, 2);
    expect(t!.priority).toBe('BLOCKING');
    expect(t!.reason).toBe('economy:crisis');
  });

  it('test_crisis_to_quiebra_blocking', () => {
    const t = bankruptcyTransition(2, 3);
    expect(t!.priority).toBe('BLOCKING');
    expect(t!.reason).toBe('economy:quiebra');
  });

  it('test_recovery_is_advisory', () => {
    const t = bankruptcyTransition(2, 0);
    expect(t!.priority).toBe('ADVISORY');
    expect(t!.reason).toBe('economy:recovery');
  });

  it('test_no_change_returns_null', () => {
    expect(bankruptcyTransition(0, 0)).toBeNull();
    expect(bankruptcyTransition(2, 2)).toBeNull();
  });
});

describe('FINANCIAL_STATUS_NAMES', () => {
  it('test_all_states_named', () => {
    expect(FINANCIAL_STATUS_NAMES[0]).toBe('Sano');
    expect(FINANCIAL_STATUS_NAMES[1]).toBe('En Riesgo');
    expect(FINANCIAL_STATUS_NAMES[2]).toBe('Crisis');
    expect(FINANCIAL_STATUS_NAMES[3]).toBe('Quiebra');
  });
});

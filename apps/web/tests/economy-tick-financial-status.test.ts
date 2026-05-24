/**
 * BUG-FIN-1 regression test — Sprint 13 task 13-2.
 *
 * Pablo's playtest 2026-05-21 surfaced: financial_status read as "Sano"
 * even with balance=−1M€ + cashflow=−64k€/wk. Root cause was that the
 * cascade engine computed financial_status from the PREVIOUS week's
 * balance, and the economy tick (which updates balance) never patched
 * the status. Fix in commit 16b42bc adds a `computeFinancialStatus`
 * call to economy-tick.ts so the status reflects POST-economy values.
 *
 * This test file guards the fix:
 *   1. Source grep — `computeFinancialStatus` must appear in economy-tick.ts
 *   2. Formula correctness — independently validate the thresholds via
 *      computeFinancialStatus from @smt/shared
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFinancialStatus } from '@smt/shared/sim/economy/bankruptcy';

const here = dirname(fileURLToPath(import.meta.url));
const economyTickPath = resolve(
  here,
  '..',
  'src',
  'lib',
  'server',
  'economy-tick.ts',
);

describe('Sprint 13 task 13-2 — BUG-FIN-1 regression', () => {
  describe('Source guards — economy-tick.ts wires computeFinancialStatus', () => {
    const source = readFileSync(economyTickPath, 'utf8');

    it('test_economy_tick_imports_computeFinancialStatus', () => {
      expect(source).toMatch(/computeFinancialStatus/);
    });

    it('test_economy_tick_patches_financial_status_in_state', () => {
      // The patch line is the one that sets financial_status on the
      // patchedState object.
      expect(source).toMatch(/financial_status:\s*financialStatusAfter/);
    });

    it('test_economy_tick_passes_balance_after_to_status_calc', () => {
      // computeFinancialStatus(balanceAfter, cashflow) — both arguments
      // must be the POST-economy values, not the prevState's.
      expect(source).toMatch(
        /computeFinancialStatus\(balanceAfter,\s*cashflow\)/,
      );
    });
  });

  describe('Pablo case — balance=−1M€ + cashflow=−64k€/wk → Quiebra (3)', () => {
    it('test_pablo_case_returns_quiebra', () => {
      // Balance stored in €K → −1M€ = −1000 €K.
      // Cashflow stored in €K/wk → −64k€/wk = −64 €K/wk.
      // QUIEBRA: balance < -200 AND cashflow < -20.
      //   -1000 < -200 ✓
      //   -64 < -20 ✓
      expect(computeFinancialStatus(-1000, -64)).toBe(3);
    });
  });

  describe('Threshold matrix', () => {
    it('test_sano_baseline', () => {
      expect(computeFinancialStatus(100, 5)).toBe(0);
    });

    it('test_en_riesgo_low_balance', () => {
      // balance < 50 → En Riesgo independientemente del cashflow.
      expect(computeFinancialStatus(40, 5)).toBe(1);
    });

    it('test_en_riesgo_high_negative_cashflow', () => {
      // cashflow < -15 → En Riesgo aunque balance sea > 50.
      expect(computeFinancialStatus(100, -20)).toBe(1);
    });

    it('test_crisis_threshold', () => {
      // CRISIS: balance < -50 AND cashflow < -10.
      expect(computeFinancialStatus(-60, -12)).toBe(2);
    });

    it('test_quiebra_threshold', () => {
      // QUIEBRA: balance < -200 AND cashflow < -20.
      expect(computeFinancialStatus(-300, -50)).toBe(3);
    });

    it('test_negative_balance_but_positive_cashflow_is_en_riesgo', () => {
      // El bug original era que cashflow positivo + balance negativo daba
      // "Sano". Ahora: balance < 50 OR cashflow < -15 → En Riesgo.
      // balance = -1000, cashflow = +50 → balance < 50 → En Riesgo (1).
      // NO debe ser "Sano" (0).
      const result = computeFinancialStatus(-1000, 50);
      expect(result).toBeGreaterThan(0);
      expect(result).toBe(1);
    });
  });
});

/**
 * Unit tests for cost calculator.
 * Story: ECONOMY-003
 */

import { describe, it, expect } from 'vitest';
import {
  budgetNodeToEurK,
  computePlayerPayroll,
  computeStaffPayroll,
  computeWeeklyCosts,
} from '../../src/sim/economy/costs.js';
import { MAINTENANCE_BASELINE } from '../../src/sim/economy/constants.js';

describe('computePlayerPayroll', () => {
  it('test_sums_active_player_salaries', () => {
    const players = [
      { salaryEurK: 5, availability: 'available' },
      { salaryEurK: 3, availability: 'injured' },
      { salaryEurK: 2, availability: 'available' },
    ];
    expect(computePlayerPayroll(players)).toBe(10);
  });

  it('test_excludes_leaving_players', () => {
    const players = [
      { salaryEurK: 5, availability: 'available' },
      { salaryEurK: 10, availability: 'leaving' },
    ];
    expect(computePlayerPayroll(players)).toBe(5);
  });

  it('test_payroll_multiplier_applied', () => {
    const players = [
      { salaryEurK: 10, availability: 'available' },
      { salaryEurK: 6, availability: 'available' },
    ];
    expect(computePlayerPayroll(players, 0.75)).toBe(Math.round(16 * 0.75));
  });

  it('test_empty_returns_zero', () => {
    expect(computePlayerPayroll([])).toBe(0);
  });
});

describe('computeStaffPayroll', () => {
  it('test_sums_weekly_eur_k', () => {
    expect(computeStaffPayroll([{ weeklyEurK: 3 }, { weeklyEurK: 1 }])).toBe(4);
  });
});

describe('budgetNodeToEurK', () => {
  it('test_zero_returns_zero', () => {
    expect(budgetNodeToEurK(0)).toBe(0);
  });

  it('test_full_budget_returns_4_eurK', () => {
    expect(budgetNodeToEurK(100)).toBe(4);
  });

  it('test_half_budget', () => {
    expect(budgetNodeToEurK(50)).toBe(2);
  });
});

describe('computeWeeklyCosts — full breakdown', () => {
  it('test_all_categories_summed', () => {
    const b = computeWeeklyCosts({
      players: [
        { salaryEurK: 5, availability: 'available' },
        { salaryEurK: 5, availability: 'available' },
      ],
      staff: [{ weeklyEurK: 3 }],
      cateringBudget: 50,
      scoutingBudget: 30,
      groundskeeperBudget: 50,
    });
    expect(b.playerWages).toBe(10);
    expect(b.staffWages).toBe(3);
    expect(b.catering).toBe(2);
    expect(b.scouting).toBeCloseTo(1.2, 1);
    expect(b.groundskeeper).toBe(2);
    expect(b.maintenance).toBe(MAINTENANCE_BASELINE);
    expect(b.total).toBeCloseTo(10 + 3 + 2 + 1.2 + 2 + MAINTENANCE_BASELINE, 1);
  });

  it('test_payroll_freeze_multiplier_reduces_costs', () => {
    const players = [{ salaryEurK: 20, availability: 'available' }];
    const baseline = computeWeeklyCosts({
      players,
      staff: [],
      cateringBudget: 0,
      scoutingBudget: 0,
      groundskeeperBudget: 0,
    });
    const frozen = computeWeeklyCosts({
      players,
      staff: [],
      cateringBudget: 0,
      scoutingBudget: 0,
      groundskeeperBudget: 0,
      payrollMultiplier: 0.75,
    });
    expect(frozen.playerWages).toBe(15);
    expect(baseline.playerWages).toBe(20);
  });
});

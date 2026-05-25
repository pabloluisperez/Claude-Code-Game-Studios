import { describe, it, expect } from 'vitest';
import {
  generateBargainFactor,
  shouldMarkForSale,
  aiTransferBudget,
  computeSquadGaps,
  AI_BARGAIN_FACTOR_MIN,
  AI_BARGAIN_FACTOR_MAX,
} from '../../src/sim/scouting/ai-rotation-logic.js';

describe('F6 ai-rotation-logic', () => {
  it('test_generateBargainFactor_midpoint_at_rng_0_5', () => {
    expect(generateBargainFactor(() => 0.5)).toBeCloseTo(1.025);
  });

  it('test_generateBargainFactor_extremes_match_constants', () => {
    expect(generateBargainFactor(() => 0)).toBe(AI_BARGAIN_FACTOR_MIN);
    expect(generateBargainFactor(() => 1)).toBeCloseTo(AI_BARGAIN_FACTOR_MAX);
  });

  it('test_generateBargainFactor_deterministic_with_same_seed', () => {
    const rng = () => 0.42;
    const ref = generateBargainFactor(rng);
    for (let i = 0; i < 100; i++) {
      expect(generateBargainFactor(() => 0.42)).toBe(ref);
    }
  });

  it('test_shouldMarkForSale_age_decline_triggers_at_40pct_rng', () => {
    const r = shouldMarkForSale({ age: 31, morale: 70 }, { rosterSize: 20 }, () => 0.4);
    expect(r.mark).toBe(true);
    if (r.mark === true) expect(r.reason).toBe('age_decline');
  });

  it('test_shouldMarkForSale_blocked_at_min_roster', () => {
    const r = shouldMarkForSale({ age: 31, morale: 70 }, { rosterSize: 18 }, () => 0.0);
    expect(r.mark).toBe(false);
  });

  it('test_shouldMarkForSale_transfer_request_on_low_morale', () => {
    // Low morale player, rng below transfer-request prob (0.15)
    const r = shouldMarkForSale({ age: 24, morale: 20 }, { rosterSize: 20 }, () => 0.10);
    expect(r.mark).toBe(true);
    if (r.mark === true) expect(r.reason).toBe('transfer_request');
  });

  it('test_shouldMarkForSale_high_rng_no_mark', () => {
    const r = shouldMarkForSale({ age: 31, morale: 50 }, { rosterSize: 20 }, () => 0.99);
    expect(r.mark).toBe(false);
  });

  it('test_aiTransferBudget_10_percent_of_balance', () => {
    expect(aiTransferBudget({ financialBalanceEurK: 1000 })).toBe(100);
    expect(aiTransferBudget({ financialBalanceEurK: 500 })).toBe(50);
  });

  it('test_aiTransferBudget_floor_zero_when_negative', () => {
    expect(aiTransferBudget({ financialBalanceEurK: -500 })).toBe(0);
  });

  it('test_computeSquadGaps_returns_largest_gap_first', () => {
    const gaps = computeSquadGaps({
      roster: [
        { position: 'DEF' },
        { position: 'DEF' },
        { position: 'MID' },
        { position: 'MID' },
        { position: 'MID' },
      ],
    });
    // GK needs 3 (gap 3), DEF needs 8 (gap 6), MID needs 7 (gap 4), FWD needs 4 (gap 4)
    expect(gaps[0]).toBe('DEF'); // largest gap
  });

  it('test_computeSquadGaps_full_roster_returns_empty', () => {
    const roster = [
      ...Array(3).fill({ position: 'GK' }),
      ...Array(8).fill({ position: 'DEF' }),
      ...Array(7).fill({ position: 'MID' }),
      ...Array(4).fill({ position: 'FWD' }),
    ];
    expect(computeSquadGaps({ roster })).toEqual([]);
  });
});

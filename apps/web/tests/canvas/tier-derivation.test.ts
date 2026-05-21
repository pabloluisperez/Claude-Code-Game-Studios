/**
 * Tests for tier derivation pure functions.
 *
 * Covers design/gdd/city-progression.md ACs:
 *   AC-CITY-01..07 (tier triggers + edge cases)
 *   AC-CITY-10..11 (crowd density)
 *   AC-CITY-16 (determinism — property test)
 *
 * Pure-function tests; no DB, no PIXI, no browser.
 */

import { describe, it, expect } from 'vitest';
import {
  meetsTierConditions,
  deriveTier,
  pitchSurface,
  crowdSpriteLevel,
  tierTransition,
  TIER_THRESHOLDS,
  ANTI_YOYO_WEEKS,
} from '../../src/lib/canvas/tier-derivation';
import { EMPTY_TIER_HISTORY, type TierHistory } from '../../src/lib/canvas/types';

const T2_OK = {
  prestige: 15,
  financialBalanceK: 50,
  fanBase: 1500,
  currentSeason: 1,
  division: 'fifth',
};
const T3_OK = {
  prestige: 35,
  financialBalanceK: 200,
  fanBase: 5000,
  currentSeason: 3,
  division: 'fourth',
};
const T4_OK = {
  prestige: 60,
  financialBalanceK: 500,
  fanBase: 15000,
  currentSeason: 6,
  division: 'first',
};

describe('meetsTierConditions', () => {
  it('AC-CITY-02: T2 passes at exact threshold values', () => {
    expect(meetsTierConditions(2, T2_OK)).toBe(true);
  });

  it('T2 fails below prestige threshold', () => {
    expect(meetsTierConditions(2, { ...T2_OK, prestige: 14 })).toBe(false);
  });

  it('T2 fails below balance threshold', () => {
    expect(meetsTierConditions(2, { ...T2_OK, financialBalanceK: 49 })).toBe(false);
  });

  it('T2 fails below fan_base threshold', () => {
    expect(meetsTierConditions(2, { ...T2_OK, fanBase: 1499 })).toBe(false);
  });

  it('AC-CITY-03: T3 requires season >= 3 even if rest is green', () => {
    const T3_youngSeason = { ...T3_OK, currentSeason: 2 };
    expect(meetsTierConditions(3, T3_youngSeason)).toBe(false);
  });

  it('AC-CITY-04: T4 requires division IN (first, second)', () => {
    const T4_thirdDivision = { ...T4_OK, division: 'third' };
    expect(meetsTierConditions(4, T4_thirdDivision)).toBe(false);
  });

  it('T4 passes for first division', () => {
    expect(meetsTierConditions(4, { ...T4_OK, division: 'first' })).toBe(true);
  });

  it('T4 passes for second division', () => {
    expect(meetsTierConditions(4, { ...T4_OK, division: 'second' })).toBe(true);
  });
});

describe('deriveTier — fresh history', () => {
  it('AC-CITY-01: returns T1 by default when no conditions met', () => {
    const { tier } = deriveTier({
      prestige: 0,
      financialBalanceK: 0,
      fanBase: 0,
      currentSeason: 1,
      division: 'fifth',
    });
    expect(tier).toBe(1);
  });

  it('returns T2 when only T2 conditions met', () => {
    const { tier } = deriveTier(T2_OK);
    expect(tier).toBe(2);
  });

  it('returns T3 when T2 + T3 met', () => {
    const { tier } = deriveTier(T3_OK);
    expect(tier).toBe(3);
  });

  it('returns T4 when all met', () => {
    const { tier } = deriveTier(T4_OK);
    expect(tier).toBe(4);
  });

  it('records everReachedTier in next history', () => {
    const { nextHistory } = deriveTier(T3_OK);
    expect(nextHistory.everReachedTier).toBe(3);
  });
});

describe('deriveTier — anti-yo-yo (AC-CITY-05)', () => {
  it('drops to T1 + resets weeksBelow after ANTI_YOYO_WEEKS consecutive weeks below T2 threshold', () => {
    // Start at T2, fall below, advance ANTI_YOYO_WEEKS
    let history: TierHistory = {
      everReachedTier: 2,
      weeksBelow: { 2: 0, 3: 0, 4: 0 },
    };
    const fallen = { ...T2_OK, prestige: 0 };

    let lastTier = 2;
    for (let week = 0; week < ANTI_YOYO_WEEKS; week++) {
      const result = deriveTier(fallen, history);
      history = result.nextHistory;
      lastTier = result.tier;
    }

    // After ANTI_YOYO_WEEKS, tier should have dropped to T1
    expect(lastTier).toBe(1);
  });

  it('keeps T2 during weeks 1..ANTI_YOYO_WEEKS-1 below threshold', () => {
    const history: TierHistory = {
      everReachedTier: 2,
      weeksBelow: { 2: 0, 3: 0, 4: 0 },
    };
    const fallen = { ...T2_OK, prestige: 0 };

    const result = deriveTier(fallen, history);
    expect(result.tier).toBe(2);
    expect(result.nextHistory.weeksBelow[2]).toBe(1);
  });

  it('recovers immediately if conditions met again before ANTI_YOYO_WEEKS', () => {
    let history: TierHistory = {
      everReachedTier: 2,
      weeksBelow: { 2: 2, 3: 0, 4: 0 },  // already 2 weeks below
    };

    // Recovery — conditions met again
    const result = deriveTier(T2_OK, history);
    expect(result.tier).toBe(2);
    expect(result.nextHistory.weeksBelow[2]).toBe(0);  // counter reset
  });
});

describe('deriveTier — bankruptcy (AC-CITY-06, AC-CITY-07)', () => {
  it('AC-CITY-06: bankruptcy floor → T1 instant', () => {
    const result = deriveTier({
      ...T4_OK,
      financialBalanceK: -600,  // below BANKRUPTCY_BALANCE_FLOOR_K
    }, {
      everReachedTier: 4,
      weeksBelow: { 2: 0, 3: 0, 4: 0 },
    });
    expect(result.tier).toBe(1);
  });

  it('bankruptcy preserves everReachedTier for §5.2 recovery', () => {
    const result = deriveTier({
      ...T4_OK,
      financialBalanceK: -600,
    }, {
      everReachedTier: 4,
      weeksBelow: { 2: 0, 3: 0, 4: 0 },
    });
    expect(result.nextHistory.everReachedTier).toBe(4);
  });

  it('AC-CITY-07: after bankruptcy, returning to good state recovers tier', () => {
    // Step 1: bankruptcy
    let history: TierHistory = {
      everReachedTier: 4,
      weeksBelow: { 2: 0, 3: 0, 4: 0 },
    };
    const bankrupt = deriveTier({ ...T4_OK, financialBalanceK: -600 }, history);
    expect(bankrupt.tier).toBe(1);
    history = bankrupt.nextHistory;
    expect(history.everReachedTier).toBe(4);

    // Step 2: recover with T4 conditions still met (financial-balance back > 0)
    const recovered = deriveTier(T4_OK, history);
    // Without anti-yo-yo decay, T4 conditions met → returns T4
    expect(recovered.tier).toBe(4);
  });
});

describe('deriveTier — determinism (AC-CITY-16)', () => {
  it('same input always produces same output', () => {
    const input = T3_OK;
    const history = EMPTY_TIER_HISTORY;
    const a = deriveTier(input, history);
    const b = deriveTier(input, history);
    expect(a.tier).toBe(b.tier);
    expect(a.nextHistory).toEqual(b.nextHistory);
  });
});

describe('pitchSurface', () => {
  it('dry at infrastructure < 20', () => {
    expect(pitchSurface(0)).toBe('dry');
    expect(pitchSurface(19)).toBe('dry');
  });

  it('patchy at infrastructure 20-50', () => {
    expect(pitchSurface(20)).toBe('patchy');
    expect(pitchSurface(49)).toBe('patchy');
  });

  it('healthy at 50-80', () => {
    expect(pitchSurface(50)).toBe('healthy');
    expect(pitchSurface(79)).toBe('healthy');
  });

  it('pristine at 80+', () => {
    expect(pitchSurface(80)).toBe('pristine');
    expect(pitchSurface(100)).toBe('pristine');
  });
});

describe('crowdSpriteLevel (AC-CITY-10, AC-CITY-11)', () => {
  it('empty at density < 0.15', () => {
    expect(crowdSpriteLevel(0)).toBe('empty');
    expect(crowdSpriteLevel(0.14)).toBe('empty');
  });

  it('sparse at 0.15-0.50', () => {
    expect(crowdSpriteLevel(0.15)).toBe('sparse');
    expect(crowdSpriteLevel(0.49)).toBe('sparse');
  });

  it('packed at 0.50-0.90', () => {
    expect(crowdSpriteLevel(0.5)).toBe('packed');
    expect(crowdSpriteLevel(0.89)).toBe('packed');
  });

  it('overflowing at 0.90+', () => {
    expect(crowdSpriteLevel(0.9)).toBe('overflowing');
    expect(crowdSpriteLevel(1.0)).toBe('overflowing');
  });

  it('clamps invalid input (>1)', () => {
    expect(crowdSpriteLevel(1.5)).toBe('overflowing');
  });

  it('clamps invalid input (<0)', () => {
    expect(crowdSpriteLevel(-0.5)).toBe('empty');
  });
});

describe('tierTransition', () => {
  it('returns "none" when tier did not change', () => {
    expect(tierTransition(2, 2)).toEqual({ type: 'none' });
  });

  it('returns "upgrade" when tier went up', () => {
    expect(tierTransition(2, 3)).toEqual({ type: 'upgrade', from: 2, to: 3 });
  });

  it('returns "downgrade" when tier went down', () => {
    expect(tierTransition(3, 2)).toEqual({ type: 'downgrade', from: 3, to: 2 });
  });

  it('returns "bankruptcy" when isBankruptcy flag is true', () => {
    expect(tierTransition(4, 1, true)).toEqual({ type: 'bankruptcy', from: 4, to: 1 });
  });
});

describe('Threshold constants integrity', () => {
  it('thresholds are monotonically non-decreasing across tiers', () => {
    expect(TIER_THRESHOLDS[3].prestige).toBeGreaterThanOrEqual(TIER_THRESHOLDS[2].prestige);
    expect(TIER_THRESHOLDS[4].prestige).toBeGreaterThanOrEqual(TIER_THRESHOLDS[3].prestige);
    expect(TIER_THRESHOLDS[3].balanceK).toBeGreaterThanOrEqual(TIER_THRESHOLDS[2].balanceK);
    expect(TIER_THRESHOLDS[3].fanBase).toBeGreaterThanOrEqual(TIER_THRESHOLDS[2].fanBase);
  });
});

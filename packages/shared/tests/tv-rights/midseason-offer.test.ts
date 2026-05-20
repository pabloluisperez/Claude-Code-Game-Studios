/**
 * Unit tests for buildMidseasonOffer + TIER_BELOW.
 *
 * Story: TVR-007
 * GDD ACs: AC-TV-11, AC-TV-14, AC-TV-20, AC-TV-23, AC-TV-47 (LOCAL→LOCAL).
 */

import { describe, it, expect } from 'vitest';
import {
  buildMidseasonOffer,
  TIER_BELOW,
} from '../../src/sim/tv-rights/midseason-offer.js';

describe('TIER_BELOW — F-TV2 mapping', () => {
  it('test_tier_below_NACIONAL_is_REGIONAL', () => {
    expect(TIER_BELOW.NACIONAL).toBe('REGIONAL');
  });

  it('test_tier_below_REGIONAL_is_LOCAL', () => {
    expect(TIER_BELOW.REGIONAL).toBe('LOCAL');
  });

  it('test_tier_below_LOCAL_is_LOCAL_theoretical_case', () => {
    // LOCAL→LOCAL materialises only via cascade-engine injection (AC-TV-47).
    expect(TIER_BELOW.LOCAL).toBe('LOCAL');
  });
});

describe('AC-TV-23 — REGIONAL cancelled week 25 → LOCAL mid at 70%', () => {
  it('test_REGIONAL_cancelled_week_25_d2_mid_LOCAL_0_37', () => {
    const offer = buildMidseasonOffer('REGIONAL', 25, 'D2', 2);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe('tv_midseason_offer');
    expect(offer!.cancelledTier).toBe('REGIONAL');
    expect(offer!.offer.tier).toBe('LOCAL');
    expect(offer!.offer.weeklyRateEurK).toBe(0.37);
    expect(offer!.offer.weeksRemaining).toBe(13); // 38 - 25
    expect(offer!.offer.currentDivision).toBe('D2');
    expect(offer!.defaultOption).toBe('reject');
  });

  it('test_REGIONAL_cancelled_week_25_d1_mid_LOCAL_0_50', () => {
    const offer = buildMidseasonOffer('REGIONAL', 25, 'D1', 2);
    expect(offer!.offer.weeklyRateEurK).toBe(0.50);
  });
});

describe('AC-TV-10 — NACIONAL cancelled → REGIONAL mid at 70%', () => {
  it('test_NACIONAL_cancelled_week_10_d2_mid_REGIONAL_1_23', () => {
    const offer = buildMidseasonOffer('NACIONAL', 10, 'D2', 2);
    expect(offer!.cancelledTier).toBe('NACIONAL');
    expect(offer!.offer.tier).toBe('REGIONAL');
    expect(offer!.offer.weeklyRateEurK).toBe(1.23);
    expect(offer!.offer.weeksRemaining).toBe(28);
  });

  it('test_NACIONAL_cancelled_week_10_d1_mid_REGIONAL_1_65', () => {
    const offer = buildMidseasonOffer('NACIONAL', 10, 'D1', 2);
    expect(offer!.offer.weeklyRateEurK).toBe(1.65);
  });
});

describe('AC-TV-20 — week 35 boundary (offer generated)', () => {
  it('test_cancellation_week_35_emits_offer_with_3_weeks_remaining', () => {
    const offer = buildMidseasonOffer('NACIONAL', 35, 'D2', 2);
    expect(offer).not.toBeNull();
    expect(offer!.offer.weeksRemaining).toBe(3);
  });
});

describe('AC-TV-11 / AC-TV-20 — week > 35 no offer', () => {
  it('test_cancellation_week_36_returns_null', () => {
    expect(buildMidseasonOffer('NACIONAL', 36, 'D2', 2)).toBeNull();
  });

  it('test_cancellation_week_38_returns_null', () => {
    expect(buildMidseasonOffer('NACIONAL', 38, 'D2', 2)).toBeNull();
  });
});

describe('AC-TV-47 — LOCAL→LOCAL midseason via cascade', () => {
  it('test_LOCAL_cancelled_week_20_d2_mid_LOCAL_0_37', () => {
    const offer = buildMidseasonOffer('LOCAL', 20, 'D2', 2);
    expect(offer!.cancelledTier).toBe('LOCAL');
    expect(offer!.offer.tier).toBe('LOCAL');
    expect(offer!.offer.weeklyRateEurK).toBe(0.37);
    expect(offer!.offer.weeksRemaining).toBe(18);
  });
});

describe('AC-TV-14 — duration weeks from cancellation week', () => {
  it('test_NACIONAL_cancelled_week_20_offer_covers_18_weeks', () => {
    const offer = buildMidseasonOffer('NACIONAL', 20, 'D2', 2);
    expect(offer!.offer.weeksRemaining).toBe(18);
    // Total revenue check: 1.23 × 18 = 22.14 €K
    expect(offer!.offer.weeklyRateEurK * offer!.offer.weeksRemaining).toBeCloseTo(22.14, 2);
  });
});

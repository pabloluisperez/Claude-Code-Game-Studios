/**
 * Unit tests for TV auction generator + payload builder.
 *
 * Story: TVR-003
 * GDD ACs: AC-TV-01/02/03/04/05/06/12/31/49 + risk flag logic for AC-TV-50 prep.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTVAuctionOffers,
  buildTVAuctionPayload,
  type AuctionContext,
} from '../../src/sim/tv-rights/auction.js';

function ctx(overrides: Partial<AuctionContext>): AuctionContext {
  return {
    prevSeasonFinalPosition: 10,
    currentDivision: 'D2',
    managerReputation: 1,
    corruptionExposure: 0,
    season: 2,
    ...overrides,
  };
}

describe('generateTVAuctionOffers — unlock rules (GDD Core Rule 2)', () => {
  it('test_AC_TV_06_d2_low_rep_high_pos_only_LOCAL', () => {
    // rep=1, prev_pos=15, D2 → only LOCAL
    const offers = generateTVAuctionOffers(ctx({ prevSeasonFinalPosition: 15 }));
    expect(offers).toEqual(['LOCAL']);
  });

  it('test_AC_TV_02_d2_prev_pos_10_unlocks_REGIONAL_via_position', () => {
    const offers = generateTVAuctionOffers(ctx({ prevSeasonFinalPosition: 10 }));
    expect(offers).toContain('REGIONAL');
    expect(offers).not.toContain('NACIONAL');
  });

  it('test_AC_TV_03_rep_2_unlocks_REGIONAL_via_reputation', () => {
    const offers = generateTVAuctionOffers(ctx({ prevSeasonFinalPosition: 15, managerReputation: 2 }));
    expect(offers).toContain('REGIONAL');
    expect(offers).not.toContain('NACIONAL');
  });

  it('test_AC_TV_04_d1_unlocks_NACIONAL_via_D1_actual', () => {
    const offers = generateTVAuctionOffers(ctx({ currentDivision: 'D1' }));
    expect(offers).toContain('NACIONAL');
  });

  it('test_AC_TV_05_rep_4_unlocks_NACIONAL_via_reputation_in_D2', () => {
    const offers = generateTVAuctionOffers(
      ctx({ currentDivision: 'D2', managerReputation: 4, prevSeasonFinalPosition: 20 }),
    );
    expect(offers).toContain('NACIONAL');
  });

  it('test_AC_TV_49_d1_low_rep_unlocks_all_three_tiers', () => {
    // D1, rep=1, corruption=0 (T2+) → 3 tiers via D1 actual condition
    const offers = generateTVAuctionOffers(
      ctx({ currentDivision: 'D1', managerReputation: 1, prevSeasonFinalPosition: 5 }),
    );
    expect(offers).toEqual(['LOCAL', 'REGIONAL', 'NACIONAL']);
    expect(offers.length).toBe(3);
  });
});

describe('AC-TV-12 — T1 forces only LOCAL regardless of division', () => {
  it('test_T1_d2_only_LOCAL', () => {
    const offers = generateTVAuctionOffers(
      ctx({ prevSeasonFinalPosition: null, currentDivision: 'D2', managerReputation: 5 }),
    );
    expect(offers).toEqual(['LOCAL']);
  });

  it('test_T1_d1_only_LOCAL', () => {
    const offers = generateTVAuctionOffers(
      ctx({ prevSeasonFinalPosition: null, currentDivision: 'D1', managerReputation: 5 }),
    );
    expect(offers).toEqual(['LOCAL']);
  });
});

describe('AC-TV-31 — corruption ≥ 60 blocks REGIONAL + NACIONAL', () => {
  it('test_corruption_60_d1_high_rep_only_LOCAL', () => {
    const offers = generateTVAuctionOffers(
      ctx({
        currentDivision: 'D1',
        managerReputation: 5,
        prevSeasonFinalPosition: 1,
        corruptionExposure: 60,
      }),
    );
    expect(offers).toEqual(['LOCAL']);
  });

  it('test_corruption_60_d2_rep_4_only_LOCAL', () => {
    const offers = generateTVAuctionOffers(
      ctx({ managerReputation: 4, corruptionExposure: 60 }),
    );
    expect(offers).toEqual(['LOCAL']);
  });

  it('test_corruption_59_9_still_unlocks_REGIONAL', () => {
    const offers = generateTVAuctionOffers(
      ctx({ prevSeasonFinalPosition: 10, corruptionExposure: 59.9 }),
    );
    expect(offers).toContain('REGIONAL');
  });
});

describe('buildTVAuctionPayload — full event payload', () => {
  it('test_payload_T1_has_only_LOCAL_with_1yr_only', () => {
    const payload = buildTVAuctionPayload(
      ctx({ prevSeasonFinalPosition: null, season: 1 }),
    );
    expect(payload.type).toBe('tv_auction');
    expect(payload.season).toBe(1);
    expect(payload.offers).toHaveLength(1);
    expect(payload.offers[0]!.tier).toBe('LOCAL');
    expect(payload.offers[0]!.durationOptions).toHaveLength(1);
    expect(payload.offers[0]!.durationOptions[0]!.durationSeasons).toBe(1);
    expect(payload.offers[0]!.durationOptions[0]!.weeklyRateEurK).toBe(0.53);
  });

  it('test_payload_d1_includes_NACIONAL_3yr_option', () => {
    const payload = buildTVAuctionPayload(ctx({ currentDivision: 'D1', prevSeasonFinalPosition: 5 }));
    const nacionalOffer = payload.offers.find((o) => o.tier === 'NACIONAL');
    expect(nacionalOffer).toBeDefined();
    expect(nacionalOffer!.durationOptions).toHaveLength(2);
    const threeYr = nacionalOffer!.durationOptions.find((d) => d.durationSeasons === 3);
    expect(threeYr).toBeDefined();
    expect(threeYr!.weeklyRateEurK).toBe(7.87);
  });

  it('test_payload_NACIONAL_3yr_with_corruption_above_0_shows_risk_flag', () => {
    const payload = buildTVAuctionPayload(
      ctx({ currentDivision: 'D1', prevSeasonFinalPosition: 1, corruptionExposure: 1.0 }),
    );
    const threeYr = payload.offers
      .find((o) => o.tier === 'NACIONAL')!
      .durationOptions.find((d) => d.durationSeasons === 3)!;
    expect(threeYr.riskFlag).toBe('NACIONAL_3YR');
  });

  it('test_payload_NACIONAL_3yr_with_corruption_0_has_no_risk_flag', () => {
    const payload = buildTVAuctionPayload(
      ctx({ currentDivision: 'D1', prevSeasonFinalPosition: 1, corruptionExposure: 0 }),
    );
    const threeYr = payload.offers
      .find((o) => o.tier === 'NACIONAL')!
      .durationOptions.find((d) => d.durationSeasons === 3)!;
    expect(threeYr.riskFlag).toBeUndefined();
  });

  it('test_payload_REGIONAL_2yr_with_corruption_22_shows_risk_flag', () => {
    const payload = buildTVAuctionPayload(
      ctx({ prevSeasonFinalPosition: 10, corruptionExposure: 22 }),
    );
    const twoYr = payload.offers
      .find((o) => o.tier === 'REGIONAL')!
      .durationOptions.find((d) => d.durationSeasons === 2)!;
    expect(twoYr.riskFlag).toBe('REGIONAL_2YR');
  });

  it('test_payload_REGIONAL_2yr_with_corruption_21_has_no_risk_flag', () => {
    const payload = buildTVAuctionPayload(
      ctx({ prevSeasonFinalPosition: 10, corruptionExposure: 21 }),
    );
    const twoYr = payload.offers
      .find((o) => o.tier === 'REGIONAL')!
      .durationOptions.find((d) => d.durationSeasons === 2)!;
    expect(twoYr.riskFlag).toBeUndefined();
  });

  it('test_payload_default_option_always_LOCAL_1yr', () => {
    const payload = buildTVAuctionPayload(
      ctx({ currentDivision: 'D1', prevSeasonFinalPosition: 1, managerReputation: 5 }),
    );
    expect(payload.defaultOption).toEqual({ tier: 'LOCAL', durationSeasons: 1 });
  });

  it('test_payload_corruption_accum_season_for_regional', () => {
    const payload = buildTVAuctionPayload(ctx({ prevSeasonFinalPosition: 10 }));
    const regOffer = payload.offers.find((o) => o.tier === 'REGIONAL')!;
    const oneYr = regOffer.durationOptions[0]!;
    // REGIONAL +0.5/week × 38 = +19.0
    expect(oneYr.corruptionAccumSeason).toBe(19);
    expect(oneYr.corruptionDeltaPerWeek).toBe(0.5);
  });
});

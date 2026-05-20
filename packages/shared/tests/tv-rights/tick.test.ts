/**
 * Unit tests for applyTVPrePhase + applyTVPostPhase — pure functions.
 *
 * Story: TVR-006
 * GDD ACs: AC-TV-22b, AC-TV-29, AC-TV-39, AC-TV-40, AC-TV-47.
 */

import { describe, it, expect } from 'vitest';
import {
  applyTVPrePhase,
  applyTVPostPhase,
  type TVTickContract,
} from '../../src/sim/tv-rights/tick.js';

function contract(overrides: Partial<TVTickContract>): TVTickContract {
  return {
    tier: 'REGIONAL',
    status: 'ACTIVE',
    weeklyRateEurK: 1.75,
    ...overrides,
  };
}

describe('applyTVPrePhase — paso 5 revenue when no cancellation', () => {
  it('test_prePhase_active_below_threshold_returns_full_revenue', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL', weeklyRateEurK: 7.16 }),
      57.0,
      10,
      'D1',
      2,
    );
    // 57.0 + 1.5 = 58.5 → no threshold crossing.
    expect(result.corruptionAfterTV).toBe(58.5);
    expect(result.newStatus).toBe('ACTIVE');
    expect(result.revenue).toBe(7.16);
    expect(result.midseasonOffer).toBeUndefined();
  });

  it('test_prePhase_no_contract_returns_zero_revenue', () => {
    const result = applyTVPrePhase(null, 30, 10, 'D2', 2);
    expect(result.revenue).toBe(0);
    expect(result.newStatus).toBe('NONE');
    expect(result.corruptionAfterTV).toBe(30);
  });

  it('test_prePhase_non_active_contract_returns_zero_revenue', () => {
    const result = applyTVPrePhase(contract({ status: 'CANCELLED' }), 30, 10, 'D2', 2);
    expect(result.revenue).toBe(0);
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.corruptionAfterTV).toBe(30);
  });
});

describe('AC-TV-22b — F-TV3 cancellation revenue=0 (paso 4 before paso 5)', () => {
  it('test_NACIONAL_corruption_59_0_cancels_revenue_0', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL', weeklyRateEurK: 7.16 }),
      59.0,
      10,
      'D1',
      2,
    );
    // 59.0 + 1.5 = 60.5 → threshold crossed.
    expect(result.corruptionAfterTV).toBe(60.5);
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.revenue).toBe(0);
    expect(result.midseasonOffer).toBeDefined();
    expect(result.midseasonOffer!.cancelledTier).toBe('NACIONAL');
    expect(result.midseasonOffer!.offer.tier).toBe('REGIONAL');
  });

  it('test_NACIONAL_corruption_58_0_stays_active_revenue_full', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL', weeklyRateEurK: 7.16 }),
      58.0,
      10,
      'D1',
      2,
    );
    // 58.0 + 1.5 = 59.5 → still under threshold.
    expect(result.corruptionAfterTV).toBe(59.5);
    expect(result.newStatus).toBe('ACTIVE');
    expect(result.revenue).toBe(7.16);
  });
});

describe('AC-TV-29 — REGIONAL ACTIVE at 59.5 crosses to 60.0', () => {
  it('test_REGIONAL_at_59_5_cancels_revenue_0', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'REGIONAL', weeklyRateEurK: 1.75 }),
      59.5,
      10,
      'D2',
      2,
    );
    expect(result.corruptionAfterTV).toBe(60.0);
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.revenue).toBe(0);
  });
});

describe('AC-TV-39 — week 38 race condition', () => {
  it('test_NACIONAL_week_38_at_59_5_cancels_no_midseason_offer', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL', weeklyRateEurK: 7.16 }),
      59.5,
      38,
      'D1',
      2,
    );
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.revenue).toBe(0);
    // Week 38 > 35 → no midseason offer
    expect(result.midseasonOffer).toBeUndefined();
  });
});

describe('AC-TV-40 — cascade cancellation preserves revenue (asymmetry)', () => {
  it('test_NACIONAL_57_with_cascade_4_preserves_paso5_revenue', () => {
    // Pre-phase: 57 + 1.5 = 58.5, no TV threshold, revenue=7.16
    const preResult = applyTVPrePhase(
      contract({ tier: 'NACIONAL', weeklyRateEurK: 7.16 }),
      57.0,
      10,
      'D1',
      2,
    );
    expect(preResult.revenue).toBe(7.16);
    expect(preResult.newStatus).toBe('ACTIVE');

    // Post-phase: cascade injects +4 → 58.5+4=62.5 ≥ 60 → CANCELLED
    const postResult = applyTVPostPhase(
      preResult.newStatus,
      'NACIONAL', // cancelledTierForOffer (the tier that's being cancelled)
      preResult.corruptionAfterTV,
      4,
      10,
      'D1',
      2,
    );
    expect(postResult.corruptionFinal).toBe(62.5);
    expect(postResult.cancelledByCascade).toBe(true);
    expect(postResult.midseasonOffer).toBeDefined();
    expect(postResult.midseasonOffer!.cancelledTier).toBe('NACIONAL');
    expect(postResult.midseasonOffer!.offer.tier).toBe('REGIONAL');
    // Revenue from paso 5 is preserved (caller doesn't recompute revenue post-cascade).
    // The asymmetry is verified at the apps/api integration layer.
  });
});

describe('AC-TV-47 — LOCAL cancelled by cascade injection (TIER_BELOW[LOCAL]=LOCAL)', () => {
  it('test_LOCAL_active_at_58_with_cascade_4_cancels_yields_LOCAL_midseason', () => {
    // Pre-phase: 58 - 0.5 = 57.5, no TV threshold crossing.
    const preResult = applyTVPrePhase(
      contract({ tier: 'LOCAL', weeklyRateEurK: 0.53 }),
      58.0,
      20,
      'D2',
      2,
    );
    expect(preResult.corruptionAfterTV).toBe(57.5);
    expect(preResult.newStatus).toBe('ACTIVE');
    expect(preResult.revenue).toBe(0.53);

    // Post-phase: cascade +4 → 57.5+4=61.5 ≥ 60 → CANCELLED
    const postResult = applyTVPostPhase(
      preResult.newStatus,
      'LOCAL',
      preResult.corruptionAfterTV,
      4,
      20,
      'D2',
      2,
    );
    expect(postResult.corruptionFinal).toBe(61.5);
    expect(postResult.cancelledByCascade).toBe(true);
    expect(postResult.midseasonOffer).toBeDefined();
    // TIER_BELOW[LOCAL] = LOCAL → midseason offer is another LOCAL at 70%.
    expect(postResult.midseasonOffer!.cancelledTier).toBe('LOCAL');
    expect(postResult.midseasonOffer!.offer.tier).toBe('LOCAL');
    expect(postResult.midseasonOffer!.offer.weeklyRateEurK).toBe(0.37); // 53×100×70/10000/100 round = 0.37
  });
});

describe('applyTVPostPhase — non-active contract still applies cascade injection', () => {
  it('test_postPhase_cancelled_status_applies_cascade_but_does_not_recancel', () => {
    const result = applyTVPostPhase('CANCELLED', null, 50, 5, 10, 'D2', 2);
    expect(result.corruptionFinal).toBe(55);
    expect(result.cancelledByCascade).toBe(false);
  });

  it('test_postPhase_none_status_applies_cascade', () => {
    const result = applyTVPostPhase('NONE', null, 50, 5, 10, 'D2', 2);
    expect(result.corruptionFinal).toBe(55);
    expect(result.cancelledByCascade).toBe(false);
  });
});

describe('applyTVPostPhase — cascade injection precision discipline', () => {
  it('test_postPhase_drifty_external_delta_rounds_correctly', () => {
    // ExternalDelta with float drift gets rounded to 2 decimals
    const result = applyTVPostPhase('ACTIVE', 'NACIONAL', 50.0, 5.555, 10, 'D1', 2);
    // 50 + roundCorruption(5.555) = 50 + 5.56 = 55.56
    expect(result.corruptionFinal).toBe(55.56);
  });

  it('test_postPhase_cascade_clamps_at_ceiling_no_recancel_when_already_above', () => {
    // prev=99 is already ≥ 60 → threshold predicate returns false (no upward crossing).
    // Contract was somehow ACTIVE with corruption=99 (theoretical edge case).
    // The clamp at 100 prevents overflow; cancelledByCascade stays false.
    const result = applyTVPostPhase('ACTIVE', 'NACIONAL', 99, 50, 10, 'D1', 2);
    expect(result.corruptionFinal).toBe(100);
    expect(result.cancelledByCascade).toBe(false);
  });

  it('test_postPhase_cascade_clamps_at_floor', () => {
    const result = applyTVPostPhase('ACTIVE', 'NACIONAL', 5, -10, 10, 'D1', 2);
    expect(result.corruptionFinal).toBe(0);
  });
});

describe('Midseason offer week boundary (AC-TV-10 / AC-TV-11)', () => {
  it('test_cancellation_week_35_emits_midseason_offer', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL' }),
      59.0,
      35,
      'D2',
      2,
    );
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.midseasonOffer).toBeDefined();
    expect(result.midseasonOffer!.offer.weeksRemaining).toBe(3);
  });

  it('test_cancellation_week_36_no_midseason_offer', () => {
    const result = applyTVPrePhase(
      contract({ tier: 'NACIONAL' }),
      59.0,
      36,
      'D2',
      2,
    );
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.midseasonOffer).toBeUndefined();
  });
});

/**
 * Unit tests for revenue calculator + ticket pricing.
 * Story: ECONOMY-002
 */

import { describe, it, expect } from 'vitest';
import {
  computeMatchDayRevenue,
  computeSponsorIncome,
  computeTvRights,
  computeWeeklyRevenue,
  marketTicketEur,
  maxTicketEur,
} from '../../src/sim/economy/revenue.js';
import {
  MAX_TICKET_FLOOR_PRIMERA,
  MAX_TICKET_FLOOR_SEGUNDA,
  TV_RIGHTS_PRIMERA,
  TV_RIGHTS_SEGUNDA,
} from '../../src/sim/economy/constants.js';

describe('maxTicketEur — ADR-014 formula', () => {
  it('test_real_pueblo_floors_to_25', () => {
    // Real Pueblo: cap=3000, tier=2, culture=35 → math gives ~2.44 → floor 25
    const max = maxTicketEur({ stadiumCapacity: 3000, divisionTier: 2, fanCultureIndex: 35 });
    expect(max).toBe(MAX_TICKET_FLOOR_SEGUNDA);
  });

  it('test_large_primera_club_high_max', () => {
    // 80k stadium D1 + high culture → near reference max (60)
    const max = maxTicketEur({ stadiumCapacity: 80000, divisionTier: 1, fanCultureIndex: 100 });
    expect(max).toBe(60); // 60 × 1.0 × 1.0 × 1.0 = 60
  });

  it('test_snap_to_5_increments', () => {
    const max = maxTicketEur({ stadiumCapacity: 15000, divisionTier: 1, fanCultureIndex: 50 });
    expect(max % 5).toBe(0);
  });

  it('test_floor_primera_30', () => {
    // tiny D1 club still gets PRIMERA floor
    const max = maxTicketEur({ stadiumCapacity: 1000, divisionTier: 1, fanCultureIndex: 0 });
    expect(max).toBeGreaterThanOrEqual(MAX_TICKET_FLOOR_PRIMERA);
  });
});

describe('marketTicketEur — 40% of max', () => {
  it('test_market_is_40_pct_snapped', () => {
    expect(marketTicketEur(60)).toBe(25); // 60×0.4=24 → snap 25
    expect(marketTicketEur(25)).toBe(10); // 25×0.4=10
  });

  it('test_minimum_5', () => {
    expect(marketTicketEur(5)).toBeGreaterThanOrEqual(5);
  });
});

describe('computeMatchDayRevenue', () => {
  it('test_attendance_2500_price_10_eur', () => {
    // 2500 × 10 = 25000 € = 25 €K
    expect(computeMatchDayRevenue({ attendance: 2500, ticketPriceEur: 10 })).toBe(25);
  });

  it('test_rounds_to_nearest_eurK', () => {
    // 2530 × 10 = 25300 → 25 €K
    expect(computeMatchDayRevenue({ attendance: 2530, ticketPriceEur: 10 })).toBe(25);
  });

  it('test_zero_attendance', () => {
    expect(computeMatchDayRevenue({ attendance: 0, ticketPriceEur: 50 })).toBe(0);
  });
});

describe('computeSponsorIncome', () => {
  it('test_sums_only_active', () => {
    const s = [
      { status: 'active', weeklyEurK: 3 },
      { status: 'cancelled', weeklyEurK: 5 },
      { status: 'active', weeklyEurK: 2 },
      { status: 'expired', weeklyEurK: 10 },
    ];
    expect(computeSponsorIncome(s)).toBe(5);
  });

  it('test_empty_returns_zero', () => {
    expect(computeSponsorIncome([])).toBe(0);
  });
});

describe('computeTvRights', () => {
  it('test_primera', () => {
    expect(computeTvRights(1)).toBe(TV_RIGHTS_PRIMERA);
  });
  it('test_segunda', () => {
    expect(computeTvRights(2)).toBe(TV_RIGHTS_SEGUNDA);
  });
});

describe('computeWeeklyRevenue — breakdown', () => {
  it('test_full_breakdown', () => {
    const breakdown = computeWeeklyRevenue({
      matchDayRevenue: 25,
      sponsors: [
        { status: 'active', weeklyEurK: 3 },
        { status: 'cancelled', weeklyEurK: 5 },
      ],
      divisionTier: 2,
    });
    expect(breakdown.matchDay).toBe(25);
    expect(breakdown.sponsors).toBe(3);
    expect(breakdown.tvRights).toBe(TV_RIGHTS_SEGUNDA);
    expect(breakdown.total).toBe(25 + 3 + TV_RIGHTS_SEGUNDA);
  });

  it('test_no_match_week_revenue_only_sponsors_tv', () => {
    const breakdown = computeWeeklyRevenue({
      matchDayRevenue: 0,
      sponsors: [{ status: 'active', weeklyEurK: 5 }],
      divisionTier: 1,
    });
    expect(breakdown.total).toBe(0 + 5 + TV_RIGHTS_PRIMERA);
  });
});

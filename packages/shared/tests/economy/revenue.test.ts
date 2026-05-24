/**
 * Unit tests for revenue calculator + ticket pricing.
 * Story: ECONOMY-002
 */

import { describe, it, expect } from 'vitest';
import {
  computeMatchDayRevenue,
  computeSponsorIncome,
  computeWeeklyRevenue,
  marketTicketEur,
  maxTicketEur,
} from '../../src/sim/economy/revenue.js';
import {
  MAX_TICKET_FLOOR_PRIMERA,
  MAX_TICKET_FLOOR_SEGUNDA,
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

  // ── F-TV4 path (OQ-TV-03 resolution) ───────────────────────────────────────

  it('test_ftv4_no_fan_loyalty_behaves_as_before', () => {
    expect(
      computeMatchDayRevenue({ attendance: 2500, ticketPriceEur: 10, fanLoyalty: 0 }),
    ).toBe(25);
  });

  it('test_ftv4_loyalty_10_boosts_attendance_5pct', () => {
    // 2500 × 1.05 = 2625; × 10 = 26250 → 26 €K
    expect(
      computeMatchDayRevenue({
        attendance: 2500,
        ticketPriceEur: 10,
        fanLoyalty: 10,
        stadiumCapacity: 6000,
      }),
    ).toBe(26);
  });

  it('test_ftv4_loyalty_50_boosts_attendance_25pct', () => {
    // 2500 × 1.25 = 3125; × 10 = 31250 → 31 €K
    expect(
      computeMatchDayRevenue({
        attendance: 2500,
        ticketPriceEur: 10,
        fanLoyalty: 50,
        stadiumCapacity: 6000,
      }),
    ).toBe(31);
  });

  it('test_ftv4_attendance_clamps_at_stadium_capacity', () => {
    // 5000 × 1.25 = 6250, clamped to 6000; × 10 = 60000 → 60 €K
    expect(
      computeMatchDayRevenue({
        attendance: 5000,
        ticketPriceEur: 10,
        fanLoyalty: 50,
        stadiumCapacity: 6000,
      }),
    ).toBe(60);
  });

  it('test_ftv4_without_stadium_capacity_does_not_clamp', () => {
    // 5000 × 1.25 = 6250 (no clamp), × 10 = 62500 → 63 €K
    expect(
      computeMatchDayRevenue({
        attendance: 5000,
        ticketPriceEur: 10,
        fanLoyalty: 50,
      }),
    ).toBe(63);
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

describe('computeWeeklyRevenue — breakdown (post-ADR-019 contract-driven TV)', () => {
  it('test_full_breakdown_with_tv_contract', () => {
    const breakdown = computeWeeklyRevenue({
      matchDayRevenue: 25,
      sponsors: [
        { status: 'active', weeklyEurK: 3 },
        { status: 'cancelled', weeklyEurK: 5 },
      ],
      tvWeeklyEurK: 1.75, // REGIONAL D2 1yr
    });
    expect(breakdown.matchDay).toBe(25);
    expect(breakdown.sponsors).toBe(3);
    expect(breakdown.tvRights).toBe(1.75);
    expect(breakdown.total).toBe(25 + 3 + 1.75);
  });

  it('test_no_tv_contract_treats_revenue_as_zero', () => {
    const breakdown = computeWeeklyRevenue({
      matchDayRevenue: 0,
      sponsors: [{ status: 'active', weeklyEurK: 5 }],
      tvWeeklyEurK: 0,
    });
    expect(breakdown.tvRights).toBe(0);
    expect(breakdown.total).toBe(0 + 5 + 0);
  });

  it('test_nacional_d1_contract_full_revenue', () => {
    const breakdown = computeWeeklyRevenue({
      matchDayRevenue: 30,
      sponsors: [],
      tvWeeklyEurK: 7.16, // NACIONAL D1 1yr
    });
    expect(breakdown.tvRights).toBe(7.16);
    expect(breakdown.total).toBe(30 + 0 + 7.16);
  });
});

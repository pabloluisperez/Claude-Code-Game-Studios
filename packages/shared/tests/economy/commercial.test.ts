import { describe, it, expect } from 'vitest';
import {
  merchUnitCost,
  merchBatchCost,
  computeMerchSales,
  computeConcessionRevenue,
} from '../../src/sim/economy/commercial.js';

describe('merch manufacturing — economies of scale', () => {
  it('test_unit_cost_decreases_with_volume', () => {
    const c100 = merchUnitCost('scarf', 100);
    const c1000 = merchUnitCost('scarf', 1000);
    const c5000 = merchUnitCost('scarf', 5000);
    expect(c1000).toBeLessThan(c100);
    expect(c5000).toBeLessThanOrEqual(c1000);
  });

  it('test_unit_cost_floored', () => {
    // Huge batch never goes below the floor (scarf floor = 3).
    expect(merchUnitCost('scarf', 1_000_000)).toBeGreaterThanOrEqual(3);
  });

  it('test_batch_cost_is_unit_times_qty', () => {
    const qty = 500;
    expect(merchBatchCost('cap', qty)).toBe(Math.round(merchUnitCost('cap', qty) * qty));
  });
});

describe('merch sales', () => {
  it('test_sold_capped_by_stock', () => {
    const r = computeMerchSales({ kind: 'scarf', price: 15, stock: 5 }, 10000, 1);
    expect(r.sold).toBeLessThanOrEqual(5);
    expect(r.remainingStock).toBe(5 - r.sold);
  });

  it('test_zero_stock_zero_revenue', () => {
    const r = computeMerchSales({ kind: 'shirt', price: 40, stock: 0 }, 5000, 1);
    expect(r.sold).toBe(0);
    expect(r.revenue).toBe(0);
  });

  it('test_higher_price_fewer_sales', () => {
    const cheap = computeMerchSales({ kind: 'scarf', price: 8, stock: 100000 }, 10000, 1);
    const dear = computeMerchSales({ kind: 'scarf', price: 30, stock: 100000 }, 10000, 1);
    expect(cheap.sold).toBeGreaterThan(dear.sold);
  });
});

describe('concession revenue', () => {
  it('test_scales_with_attendance', () => {
    const prices = { food: 4, soda: 3, beer: 5, water: 2 };
    const small = computeConcessionRevenue(prices, 1000, 1);
    const big = computeConcessionRevenue(prices, 10000, 1);
    expect(big).toBeGreaterThan(small);
  });

  it('test_zero_attendance_zero_revenue', () => {
    expect(computeConcessionRevenue({ food: 4, soda: 3, beer: 5, water: 2 }, 0, 1)).toBe(0);
  });
});

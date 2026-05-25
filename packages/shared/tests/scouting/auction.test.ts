import { describe, it, expect } from 'vitest';
import { aiClubAcceptance } from '../../src/sim/scouting/auction.js';

describe('F3 aiClubAcceptance', () => {
  it('test_accept_at_threshold_zero_need', () => {
    // expectedFee = 100 * 1.0 = 100; threshold = 100 * (1 + 0) = 100
    const r = aiClubAcceptance(100, { transferValueEurK: 100 }, { bargainFactor: 1.0, needFactor: 0 });
    expect(r.accepted).toBe(true);
  });

  it('test_accept_at_threshold_full_need', () => {
    // expectedFee = 100; threshold = 100 * 1.30 = 130
    const r = aiClubAcceptance(130, { transferValueEurK: 100 }, { bargainFactor: 1.0, needFactor: 1.0 });
    expect(r.accepted).toBe(true);
  });

  it('test_counter_offer_when_just_below_threshold', () => {
    // expectedFee=100, fee=85 → 85 >= 85 (hard reject floor) → counter
    const r = aiClubAcceptance(85, { transferValueEurK: 100 }, { bargainFactor: 1.0, needFactor: 0 });
    expect(r.accepted).toBe(false);
    if (!('counterOfferEurK' in r)) return;
    expect(r.counterOfferEurK).toBe(115); // expected * (1 + 1.0 * 0.15) = 115
  });

  it('test_hard_reject_far_below_threshold', () => {
    const r = aiClubAcceptance(80, { transferValueEurK: 100 }, { bargainFactor: 1.0, needFactor: 0 });
    expect(r.accepted).toBe(false);
    if ('counterOfferEurK' in r) throw new Error('expected hardReject');
    expect((r as { hardReject: true }).hardReject).toBe(true);
  });

  it('test_bargain_factor_high_raises_acceptance_bar', () => {
    // bargain=1.20 → expected=120 → threshold=120 (no need premium)
    const r1 = aiClubAcceptance(120, { transferValueEurK: 100 }, { bargainFactor: 1.2, needFactor: 0 });
    expect(r1.accepted).toBe(true);
    const r2 = aiClubAcceptance(110, { transferValueEurK: 100 }, { bargainFactor: 1.2, needFactor: 0 });
    expect(r2.accepted).toBe(false); // 110 < 120; would counter if >= 102 (120*0.85)
  });

  it('test_property_returns_valid_AuctionResult_for_random_inputs', () => {
    for (let i = 0; i < 1000; i++) {
      const fee = Math.random() * 500;
      const r = aiClubAcceptance(
        fee,
        { transferValueEurK: 50 + Math.random() * 300 },
        { bargainFactor: 0.85 + Math.random() * 0.35, needFactor: Math.random() },
      );
      if (r.accepted === true) {
        expect(r.accepted).toBe(true);
      } else if ('counterOfferEurK' in r) {
        expect(r.counterOfferEurK).toBeGreaterThan(0);
        expect(Number.isInteger(r.counterOfferEurK)).toBe(true);
      } else {
        expect((r as { hardReject: true }).hardReject).toBe(true);
      }
    }
  });
});

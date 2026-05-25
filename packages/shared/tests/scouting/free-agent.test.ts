import { describe, it, expect } from 'vitest';
import { freeAgentAcceptance } from '../../src/sim/scouting/free-agent.js';

describe('F2 freeAgentAcceptance', () => {
  it('test_accept_when_offer_matches_expectation_no_desperation', () => {
    expect(freeAgentAcceptance(10, { wageExpectationEurKWeek: 10, weeksUnsigned: 0 })).toBe(true);
  });

  it('test_reject_when_offer_below_expectation_no_desperation', () => {
    expect(freeAgentAcceptance(10, { wageExpectationEurKWeek: 15, weeksUnsigned: 0 })).toBe(false);
  });

  it('test_accept_with_full_desperation_at_20_weeks', () => {
    // expectation * 0.75 = 7.5; offer of 7.5 accepted
    expect(freeAgentAcceptance(7.5, { wageExpectationEurKWeek: 10, weeksUnsigned: 20 })).toBe(true);
  });

  it('test_desperation_caps_at_20_weeks', () => {
    expect(freeAgentAcceptance(7.5, { wageExpectationEurKWeek: 10, weeksUnsigned: 40 })).toBe(true);
    // Same threshold as 20 weeks — desperation maxed.
    expect(freeAgentAcceptance(7.4, { wageExpectationEurKWeek: 10, weeksUnsigned: 40 })).toBe(false);
  });

  it('test_desperation_property_threshold_always_between_75pct_and_100pct', () => {
    for (let weeks = 0; weeks <= 100; weeks += 2) {
      const expectation = 100;
      // Compute the effective threshold by binary search-ish — easier to just
      // verify the threshold bounds.
      const acceptsAt100 = freeAgentAcceptance(100, { wageExpectationEurKWeek: expectation, weeksUnsigned: weeks });
      const acceptsAt74 = freeAgentAcceptance(74, { wageExpectationEurKWeek: expectation, weeksUnsigned: weeks });
      expect(acceptsAt100).toBe(true); // 100 always >= effective threshold (which is ≤ 100)
      expect(acceptsAt74).toBe(false); // 74 always < 75 (minimum threshold)
    }
  });
});

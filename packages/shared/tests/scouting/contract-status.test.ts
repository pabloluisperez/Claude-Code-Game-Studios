/**
 * Contract status classification tests. Story 25-2.
 */

import { describe, it, expect } from 'vitest';
import { classifyContractStatus, weeksUntilContractEnd } from '../../src/sim/scouting/contract-status';

describe('weeksUntilContractEnd', () => {
  it('returns positive for contract ending in future', () => {
    expect(weeksUntilContractEnd(50, 10)).toBe(40);
  });

  it('returns zero for contract ending this week', () => {
    expect(weeksUntilContractEnd(10, 10)).toBe(0);
  });

  it('returns negative for already-ended contract', () => {
    expect(weeksUntilContractEnd(5, 10)).toBe(-5);
  });

  it('returns 8 for exactly 8 weeks remaining (Bosman boundary)', () => {
    expect(weeksUntilContractEnd(18, 10)).toBe(8);
  });
});

describe('classifyContractStatus', () => {
  const base = {
    contractEndWeek: 52,
    currentWeek: 10,
  };

  it('returns free_agent when contractStatus is free_agent', () => {
    expect(
      classifyContractStatus({ ...base, contractStatus: 'free_agent', clubId: 'abc' }),
    ).toBe('free_agent');
  });

  it('returns free_agent when clubId is NULL (even with contractStatus)', () => {
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', clubId: null }),
    ).toBe('free_agent');
  });

  it('returns free_agent for NULL contractStatus with NULL clubId', () => {
    expect(
      classifyContractStatus({ ...base, contractStatus: null, clubId: null }),
    ).toBe('free_agent');
  });

  it('returns expiring when ≤8 weeks remaining', () => {
    // Exactly 8 weeks → expiring
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', contractEndWeek: 18, clubId: 'abc', currentWeek: 10 }),
    ).toBe('expiring');

    // 1 week → expiring
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', contractEndWeek: 11, clubId: 'abc', currentWeek: 10 }),
    ).toBe('expiring');

    // Already expired (negative weeks) → expiring
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', contractEndWeek: 5, clubId: 'abc', currentWeek: 10 }),
    ).toBe('expiring');
  });

  it('returns in_contract when >8 weeks remaining', () => {
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', contractEndWeek: 52, clubId: 'abc', currentWeek: 10 }),
    ).toBe('in_contract');

    // 9 weeks → in_contract (boundary)
    expect(
      classifyContractStatus({ ...base, contractStatus: 'in_contract', contractEndWeek: 19, clubId: 'abc', currentWeek: 10 }),
    ).toBe('in_contract');
  });

  it('prioritizes free_agent over expiring (free agent with 0 weeks left)', () => {
    expect(
      classifyContractStatus({ ...base, contractStatus: 'free_agent', contractEndWeek: 10, clubId: 'abc', currentWeek: 10 }),
    ).toBe('free_agent');
  });

  it('handles week 0 (sim start)', () => {
    expect(
      classifyContractStatus({
        contractStatus: 'in_contract', clubId: 'abc', contractEndWeek: 52, currentWeek: 0,
      }),
    ).toBe('in_contract');

    expect(
      classifyContractStatus({
        contractStatus: 'in_contract', clubId: 'abc', contractEndWeek: 5, currentWeek: 0,
      }),
    ).toBe('expiring');
  });
});

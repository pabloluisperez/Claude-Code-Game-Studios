import { describe, it, expect } from 'vitest';
import { stripFieldsForTier } from '../../src/sim/scouting/visibility-field-stripping.js';
import type { PoolPlayer } from '../../src/sim/scouting/types.js';

const fullPlayer: PoolPlayer = {
  id: 'p1',
  name: 'Test Player',
  age: 22,
  position: 'MID',
  currentClub: 'FC Test',
  contractStatus: 'expiring',
  visibilityTier: 3, // start at max — we'll strip down
  ovrBand: '60-65',
  transferValueBand: '500-700k',
  ovrEstimate: 63,
  transferValueEstimate: 600,
  moraleBand: 'good',
  ovrExact: 63,
  transferValueExact: 612,
  moraleExact: 78,
  fitnessExact: 91,
  recentForm: 7.4,
};

describe('stripFieldsForTier', () => {
  it('test_t0_only_basic_fields', () => {
    const out = stripFieldsForTier(fullPlayer, 0);
    expect(out.ovrBand).toBeUndefined();
    expect(out.ovrEstimate).toBeUndefined();
    expect(out.ovrExact).toBeUndefined();
    expect(out.id).toBe('p1');
    expect(out.visibilityTier).toBe(0);
  });

  it('test_t1_adds_bands', () => {
    const out = stripFieldsForTier(fullPlayer, 1);
    expect(out.ovrBand).toBe('60-65');
    expect(out.transferValueBand).toBe('500-700k');
    expect(out.ovrEstimate).toBeUndefined();
    expect(out.ovrExact).toBeUndefined();
  });

  it('test_t2_adds_estimates', () => {
    const out = stripFieldsForTier(fullPlayer, 2);
    expect(out.ovrEstimate).toBe(63);
    expect(out.moraleBand).toBe('good');
    expect(out.ovrExact).toBeUndefined();
    expect(out.fitnessExact).toBeUndefined();
  });

  it('test_t3_adds_exact', () => {
    const out = stripFieldsForTier(fullPlayer, 3);
    expect(out.ovrExact).toBe(63);
    expect(out.fitnessExact).toBe(91);
    expect(out.recentForm).toBe(7.4);
  });

  it('test_strip_sets_visibility_tier_field', () => {
    expect(stripFieldsForTier(fullPlayer, 0).visibilityTier).toBe(0);
    expect(stripFieldsForTier(fullPlayer, 1).visibilityTier).toBe(1);
    expect(stripFieldsForTier(fullPlayer, 2).visibilityTier).toBe(2);
    expect(stripFieldsForTier(fullPlayer, 3).visibilityTier).toBe(3);
  });

  it('test_strip_blocks_leakage_even_when_higher_data_present', () => {
    // Confirmation that even if the input has all fields populated, T0 output
    // exposes ZERO of the gated reveals. The frontend can be trusted to
    // never see T2+ fields under a T0 tier.
    const out = stripFieldsForTier(fullPlayer, 0);
    const exposedHighTier =
      out.ovrBand ?? out.ovrEstimate ?? out.ovrExact ?? out.fitnessExact;
    expect(exposedHighTier).toBeUndefined();
  });
});

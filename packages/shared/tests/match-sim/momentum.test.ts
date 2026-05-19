/**
 * Unit tests for F3 (homeMomentumInitial) + F4 (momentumDelta + applyMomentumDelta).
 *
 * Story: MATCH-SIM-004
 * Acceptance Criteria: AC-MATCH-09, AC-MATCH-10, AC-MATCH-01/02 (rng discipline)
 * Test Evidence: packages/shared/tests/match-sim/momentum.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  homeMomentumInitial,
  momentumDelta,
  applyMomentumDelta,
} from '../../src/sim/sports/football/football-formulas.js';
import {
  FORMATION_MOMENTUM_MOD,
  MOMENTUM_MAX,
  MOMENTUM_MIN,
} from '../../src/sim/sports/football/football-constants.js';
import type {
  FormationPreset,
  PlayerStats,
  PreMatchSnapshot,
} from '../../src/sim/sports/football/football-types.js';
import type { SimContext, WorldState } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMid(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: `mid-${Math.random()}`,
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    passing: 70,
    vision: 70,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<PreMatchSnapshot> = {}): PreMatchSnapshot {
  return {
    field_quality: 50,
    fan_attendance: 50,
    ...overrides,
  } as PreMatchSnapshot;
}

function makeCtx(rng: () => number): SimContext {
  const prev: WorldState = defaultWorldState();
  return { rng, currentWeek: 1, hasMatchThisWeek: true, prevState: prev };
}

// ── F3: homeMomentumInitial ───────────────────────────────────────────────────

describe('F3 — homeMomentumInitial', () => {
  it('test_f3_exact_value_known_inputs', () => {
    // AC-MATCH-09 — field_quality=70, fan_attendance=60
    // 50 + (70-50)/100 × 5 + (60-50)/100 × 5
    // 50 + 1.0 + 0.5 = 51.5
    const result = homeMomentumInitial(makeSnapshot({ field_quality: 70, fan_attendance: 60 }));
    expect(result).toBeCloseTo(51.5, 10);
  });

  it('test_f3_50_50_returns_baseline_50', () => {
    const result = homeMomentumInitial(makeSnapshot({ field_quality: 50, fan_attendance: 50 }));
    expect(result).toBeCloseTo(50, 10);
  });

  it('test_f3_range_invariant_10000_random_pairs', () => {
    // For field_quality, fan_attendance ∈ [0, 100] → output ∈ [45, 55]
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let i = 0; i < 10000; i++) {
      const fq = Math.floor(lcg() * 101);
      const fa = Math.floor(lcg() * 101);
      const r = homeMomentumInitial(makeSnapshot({ field_quality: fq, fan_attendance: fa }));
      expect(r).toBeGreaterThanOrEqual(45);
      expect(r).toBeLessThanOrEqual(55);
    }
  });
});

// ── F4: momentumDelta ─────────────────────────────────────────────────────────

describe('F4 — momentumDelta', () => {
  it('test_f4_example_from_gdd_implementation_notes', () => {
    // GDD example: pass_home=65, pass_away=60, vis_home=60, vis_away=57, rng=0.6, 4-4-2
    // technique = (65-60)/100×3 + (60-57)/100×2 = 0.15 + 0.06 = 0.21
    // noise = 0.6×2 - 1 = 0.2
    // delta = 0.41
    const homeMids = [makeMid({ passing: 65, vision: 60 })];
    const awayMids = [makeMid({ passing: 60, vision: 57 })];
    const ctx = makeCtx(() => 0.6);
    const delta = momentumDelta(ctx, homeMids, awayMids, '4-4-2');
    expect(delta).toBeCloseTo(0.41, 5);
  });

  it('test_f4_352_amplifier_is_1_1x_vs_442_technique', () => {
    // Same MID stats, both formations, zero noise (rng=0.5 → 0.5×2-1=0)
    // 4-4-2: pass=70, vis=70. tech = (70-50)/100×3 + (70-50)/100×2 = 0.6+0.4 = 1.0
    // 3-5-2: pass=77, vis=77. tech = (77-50)/100×3 + (77-50)/100×2 = 0.81+0.54 = 1.35
    // Note: with full amplifier the 1.1x multiplies BOTH avg values BEFORE the diff.
    const homeMids = [makeMid({ passing: 70, vision: 70 })];
    const awayMids = [makeMid({ passing: 50, vision: 50 })];

    const ctx442 = makeCtx(() => 0.5);
    const delta442 = momentumDelta(ctx442, homeMids, awayMids, '4-4-2');

    const ctx352 = makeCtx(() => 0.5);
    const delta352 = momentumDelta(ctx352, homeMids, awayMids, '3-5-2');

    // 4-4-2 delta = 1.0 (technique) + 0 (noise) = 1.0
    expect(delta442).toBeCloseTo(1.0, 5);
    // 3-5-2 delta = (77-50)/100×3 + (77-50)/100×2 = 0.81+0.54 = 1.35
    expect(delta352).toBeCloseTo(1.35, 5);
    // Ratio between technique components is the 1.1× factor scaled by stat distance
    // delta352 / delta442 = 1.35 / 1.0 = 1.35 ≠ 1.1× because the amplifier
    // scales the AVG (not the diff). This is per GDD §F4 spec.
    expect(FORMATION_MOMENTUM_MOD['3-5-2']).toBe(1.1);
    expect(FORMATION_MOMENTUM_MOD['4-4-2']).toBe(1.0);
  });

  it('test_f4_352_applies_to_home_only_not_away', () => {
    // awayFormation parameter doesn't exist in F4 signature — F4 only amplifies home.
    // Sanity: 3-5-2 home vs 4-4-2 home with same MIDs produces different deltas (proven above).
    // Conversely, if we swap the "awayFormation" concept, F4's signature has no slot for it.
    // This test verifies that the function signature only takes homeFormation.
    // Use vision=50 too so we have a clean pass-only domination case
    const homeMids = [makeMid({ passing: 50, vision: 50 })];
    const awayMids = [makeMid({ passing: 70, vision: 50 })];
    const ctx = makeCtx(() => 0.5);
    // With 3-5-2 amplifier applied to home only:
    // pass_home = 50 × 1.1 = 55; pass_away = 70 → diff = -15
    // vis_home  = 50 × 1.1 = 55; vis_away  = 50 → diff = +5
    // tech = -15/100 × 3 + 5/100 × 2 = -0.45 + 0.10 = -0.35
    // noise = 0 (rng=0.5)
    const delta = momentumDelta(ctx, homeMids, awayMids, '3-5-2');
    expect(delta).toBeCloseTo(-0.35, 5);
  });

  it('test_f4_single_rng_call_per_tick_critical', () => {
    // AC-MATCH-01/02 CRITICAL — rng() invoked exactly once per F4 call
    const rngSpy = vi.fn(() => 0.5);
    const ctx = makeCtx(rngSpy);
    momentumDelta(ctx, [makeMid()], [makeMid()], '4-4-2');
    expect(rngSpy).toHaveBeenCalledTimes(1);
  });

  it('test_f4_noise_rng_0_gives_minus_1', () => {
    // With identical MIDs (technique=0) and rng=0, delta = -1.0
    const mids = [makeMid({ passing: 50, vision: 50 })];
    const ctx = makeCtx(() => 0);
    const delta = momentumDelta(ctx, mids, mids, '4-4-2');
    expect(delta).toBeCloseTo(-1.0, 10);
  });

  it('test_f4_noise_rng_1_gives_plus_1', () => {
    // With identical MIDs (technique=0) and rng=1.0, delta = +1.0
    const mids = [makeMid({ passing: 50, vision: 50 })];
    const ctx = makeCtx(() => 1.0);
    const delta = momentumDelta(ctx, mids, mids, '4-4-2');
    expect(delta).toBeCloseTo(1.0, 10);
  });

  it('test_f4_no_nan_when_home_mids_empty', () => {
    // All home MIDs sent off (edge case): avg([])=0 → no NaN
    const ctx = makeCtx(() => 0.5);
    const delta = momentumDelta(ctx, [], [makeMid()], '4-4-2');
    expect(Number.isNaN(delta)).toBe(false);
  });
});

// ── applyMomentumDelta clamping ───────────────────────────────────────────────

describe('applyMomentumDelta — clamping', () => {
  it('test_clamp_at_max', () => {
    expect(applyMomentumDelta(80, +10)).toBe(MOMENTUM_MAX);
  });
  it('test_clamp_at_min', () => {
    expect(applyMomentumDelta(20, -10)).toBe(MOMENTUM_MIN);
  });
  it('test_no_clamp_when_in_range', () => {
    expect(applyMomentumDelta(50, 0)).toBe(50);
    expect(applyMomentumDelta(50, 10)).toBe(60);
    expect(applyMomentumDelta(50, -10)).toBe(40);
  });
});

// ── AC-MATCH-10: 90-tick clamp invariant ──────────────────────────────────────

describe('AC-MATCH-10 — 90-tick momentum hard clamp', () => {
  it('test_dominant_home_momentum_stays_under_80', () => {
    // Home all 95s, away all 5s → momentum should saturate at MOMENTUM_MAX (80)
    const homeMids: PlayerStats[] = Array.from({ length: 4 }, () =>
      makeMid({ passing: 95, vision: 95 }),
    );
    const awayMids: PlayerStats[] = Array.from({ length: 4 }, () =>
      makeMid({ passing: 5, vision: 5 }),
    );
    // Use a deterministic LCG for the rng spy
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const ctx = makeCtx(rng);

    let momentum = 50;
    const history: number[] = [50];
    for (let t = 1; t <= 90; t++) {
      const delta = momentumDelta(ctx, homeMids, awayMids, '4-4-2');
      momentum = applyMomentumDelta(momentum, delta);
      history.push(momentum);
    }
    expect(Math.max(...history)).toBeLessThanOrEqual(MOMENTUM_MAX);
    expect(Math.min(...history)).toBeGreaterThanOrEqual(MOMENTUM_MIN);
    // Dominant home: end momentum should be at or near the clamp
    expect(momentum).toBeGreaterThanOrEqual(70);
  });

  it('test_weak_home_momentum_stays_above_20', () => {
    // Reverse: home all 5s, away all 95s → momentum saturates at MOMENTUM_MIN (20)
    const homeMids: PlayerStats[] = Array.from({ length: 4 }, () =>
      makeMid({ passing: 5, vision: 5 }),
    );
    const awayMids: PlayerStats[] = Array.from({ length: 4 }, () =>
      makeMid({ passing: 95, vision: 95 }),
    );
    let seed = 11;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const ctx = makeCtx(rng);

    let momentum = 50;
    const history: number[] = [50];
    for (let t = 1; t <= 90; t++) {
      momentum = applyMomentumDelta(momentum, momentumDelta(ctx, homeMids, awayMids, '4-4-2'));
      history.push(momentum);
    }
    expect(Math.max(...history)).toBeLessThanOrEqual(MOMENTUM_MAX);
    expect(Math.min(...history)).toBeGreaterThanOrEqual(MOMENTUM_MIN);
    expect(momentum).toBeLessThanOrEqual(30);
  });
});

// Type smoke
const _formations: readonly FormationPreset[] = ['4-4-2', '4-3-3', '3-5-2', '5-3-2'];
void _formations;

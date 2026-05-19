/**
 * Unit tests for chain C4 (training_intensity → team_fitness) with integrated
 * C10 staff_morale multiplier.
 *
 * C4  — Inverted parabola: sweet spot at intensity 50 (delay 1, noisy).
 *        Both extremes (<T_low=25 undertraining, >T_high=75 overtraining) HURT fitness.
 * C10 — staff_morale multiplier integrated into K_C4_eff — NOT a separate edge.
 *        Maps SM ∈ [0,100] → multiplier ∈ [MORALE_SCALE_MIN=0.5, 1.0].
 *
 * Story: CASCADE-ENGINE-008
 * Acceptance Criteria: AC #1–12 (all 12 ACs from the story).
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c4-c10.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  K_C4,
  T_low,
  T_high,
  MORALE_SCALE_MIN,
  NOISE_C4_AMP,
  C4_PARABOLA_NORMALIZER,
} from '../../src/sim/cascade-graph.js';
import { runTick } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  type SimContext,
  type WorldState,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

// ── Test helpers ───────────────────────────────────────────────────────────────

/**
 * Minimal SimContext factory.
 * rng defaults to () => 0.5 — zero-noise for C4: (0.5 − 0.5) × NOISE_C4_AMP = 0.
 * NOTE: Other chain test files use () => 0 as their default; C4 is different
 * because its noise formula is (rng() − 0.5) × AMP, so 0.5 is the neutral point.
 */
function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  rng: () => number = () => 0.5,
): SimContext {
  return { rng, currentWeek, hasMatchThisWeek: false, prevState };
}

/** Empty delayed-effects buffer. */
const EMPTY_BUFFER: DelayedEffectsBuffer = [];

// ── Filtered graph references ──────────────────────────────────────────────────

/** C4 edge reference for direct transferFn spot-value tests. */
const edgeC4 = CASCADA_FC_GRAPH.find((e) => e.id === 'C4')!;

/** Isolated C4-only graph for runTick integration tests. */
const C4_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C4');

// ── C4: training_intensity inverted parabola (spot-value tests) ────────────────

describe('chain C4 — training_intensity inverted parabola with C10 staff_morale multiplier', () => {
  it('test_c4_at_t_low_root_zero', () => {
    // AC #1 — T_low boundary: parabola root → deterministic part = 0.
    // training=25, morale=60, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × (0.5 + 0.6 × 0.5) = 8.0 × 0.8 = 6.4
    // base = 6.4 × (25−25) × (75−25) / 625 = 6.4 × 0 × 50 / 625 = 0.0
    // Expected delta: 0.0
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 25,
      staff_morale: 60,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c4_overtraining_negative_delta', () => {
    // AC #2 — Sobreentrenamiento: training=80 > T_high=75 → negative delta.
    // training=80, morale=60, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × 0.8 = 6.4
    // base = 6.4 × (80−25) × (75−80) / 625 = 6.4 × 55 × (−5) / 625 = −2.816
    // Expected delta ≈ −2.816
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 80,
      staff_morale: 60,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-2.816, 5);
  });

  it('test_c4_undertraining_negative_delta', () => {
    // AC #3 — Infraentrenamiento: training=10 < T_low=25 → negative delta.
    // training=10, morale=60, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × 0.8 = 6.4
    // base = 6.4 × (10−25) × (75−10) / 625 = 6.4 × (−15) × 65 / 625 = −9.984
    // Expected delta ≈ −9.984
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 10,
      staff_morale: 60,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-9.984, 5);
  });

  it('test_c4_sweet_spot_positive_delta', () => {
    // AC #4 — Sweet spot: training=50 = parabola peak → maximum positive delta.
    // training=50, morale=60, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × 0.8 = 6.4
    // base = 6.4 × (50−25) × (75−50) / 625 = 6.4 × 25 × 25 / 625 = 6.4 × 625 / 625 = +6.4
    // Expected delta = +6.4
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 60,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(6.4, 5);
  });

  it('test_c4_counterintuitivity_proof_both_extremes_negative_sweet_spot_positive', () => {
    // AC #5 — Mandatory counterintuitivity proof.
    // Both extremes (undertraining=10, overtraining=80) produce NEGATIVE deltas.
    // Sweet spot (training=50) produces POSITIVE delta.
    // All three with morale=60, rng=0.5 (no noise).
    const base = { ...defaultWorldState(), staff_morale: 60 };

    const prevUnder: Readonly<WorldState> = { ...base, training_intensity: 10 };
    const prevOver: Readonly<WorldState> = { ...base, training_intensity: 80 };
    const prevSweet: Readonly<WorldState> = { ...base, training_intensity: 50 };

    const ctxUnder = makeCtx(1, prevUnder, () => 0.5);
    const ctxOver = makeCtx(1, prevOver, () => 0.5);
    const ctxSweet = makeCtx(1, prevSweet, () => 0.5);

    const deltaUnder = edgeC4.transferFn(prevUnder, ctxUnder);
    const deltaOver = edgeC4.transferFn(prevOver, ctxOver);
    const deltaSweet = edgeC4.transferFn(prevSweet, ctxSweet);

    // Both extremes must produce negative deltas
    expect(deltaUnder).toBeLessThan(0);
    expect(deltaOver).toBeLessThan(0);
    // Sweet spot must produce positive delta
    expect(deltaSweet).toBeGreaterThan(0);
    // Spot values (canonical from GDD)
    expect(deltaUnder).toBeCloseTo(-9.984, 5);
    expect(deltaOver).toBeCloseTo(-2.816, 5);
    expect(deltaSweet).toBeCloseTo(6.4, 5);
  });

  // ── C10 staff_morale multiplier boundary tests ─────────────────────────────

  it('test_c4_c10_staff_morale_0_half_efficiency', () => {
    // AC #6 — C10 boundary: staff_morale=0 → multiplier = MORALE_SCALE_MIN = 0.5.
    // training=50 (sweet spot), morale=0, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × (0.5 + (0/100) × 0.5) = 8.0 × 0.5 = 4.0
    // base = 4.0 × 25 × 25 / 625 = 4.0 × 1.0 = +4.0
    // Expected delta = +4.0 (50% efficiency — never zero even at lowest morale)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 0,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(4.0, 5);
  });

  it('test_c4_c10_staff_morale_100_full_efficiency', () => {
    // AC #7 — C10 boundary: staff_morale=100 → multiplier = 1.0 (full efficiency).
    // training=50 (sweet spot), morale=100, rng=0.5 (no noise).
    // K_C4_eff = 8.0 × (0.5 + (100/100) × 0.5) = 8.0 × 1.0 = 8.0
    // base = 8.0 × 25 × 25 / 625 = 8.0 × 1.0 = +8.0
    // Expected delta = +8.0 (full efficiency)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 100,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    const delta = edgeC4.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(8.0, 5);
  });

  // ── Rule 3 critical: C4 reads prevState, NOT accumulated nextState ─────────

  it('test_c4_reads_prevstate_staff_morale_not_accumulated_delta', () => {
    // AC #8 — ADR-003 Rule 3 critical test.
    // prevState has staff_morale=50 and training_intensity=50.
    // A PlayerDecision in the same tick bumps staff_morale by +20.
    // C4 must use prevState.staff_morale=50, NOT nextState.staff_morale=70.
    //
    // K_C4_eff (morale=50): 8.0 × (0.5 + 0.5 × 0.5) = 8.0 × 0.75 = 6.0
    // K_C4_eff (morale=70): 8.0 × (0.5 + 0.7 × 0.5) = 8.0 × 0.85 = 6.8  ← WRONG
    //
    // At training=50: correct base = 6.0 × 25 × 25 / 625 = 6.0 (using morale=50)
    //                  wrong  base = 6.8 × 25 × 25 / 625 = 6.8 (if morale=70 used)
    //
    // C4 has delay:1 — check the queued effect's delta, not nextState directly.
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      staff_morale: 50,
      training_intensity: 50,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);
    const decisions = [{ nodeId: 'staff_morale' as const, delta: +20, source: 'test' }];

    // Act
    const result = runTick(ctx, C4_ONLY, prevState, decisions, EMPTY_BUFFER);

    // C4 is delay:1 — must appear in newDelayedEffects (applied next week)
    const c4Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C4');
    expect(c4Effect).toBeDefined();
    // Must be 6.0 (morale=50 from prevState), NOT 6.8 (morale=70 after decision)
    expect(c4Effect!.delta).toBeCloseTo(6.0, 5);
  });

  // ── Oscillation edge case ──────────────────────────────────────────────────

  it('test_c4_oscillation_two_week_net_damage', () => {
    // AC #9 — Alternating extreme training is contraproducente.
    // W=1: training=90 → C4 enqueues delta for applyAt=2.
    // W=2: training=10 → C4 enqueues delta for applyAt=3; W=1 buffer consumed.
    //
    // With morale=60, rng=0.5 (no noise):
    //   W=1 base = 6.4 × (90−25) × (75−90) / 625 = 6.4 × 65 × (−15) / 625 = −9.984
    //   W=2 base = 6.4 × (10−25) × (75−10) / 625 = 6.4 × (−15) × 65 / 625 = −9.984
    //
    // The W=1 delayed effect (−9.984) is consumed at W=2, so team_fitness changes
    // by exactly −9.984 after the 2-tick window.
    //
    // Story AC #9 quotes "≈−10.5 ±0.5" as a rough estimate; the precise
    // deterministic value with rng=0.5 is −9.984. The story tolerance bracket
    // is a conservative estimate intended to accommodate noise. We assert the
    // precise no-noise value here and document the discrepancy.
    const baseState = { ...defaultWorldState(), staff_morale: 60 };
    const prevStateW1: Readonly<WorldState> = { ...baseState, training_intensity: 90 };

    // W=1 — training=90, enqueues delayed effect applyAt=2
    const ctxW1 = makeCtx(1, prevStateW1, () => 0.5);
    const resultW1 = runTick(ctxW1, C4_ONLY, prevStateW1, [], EMPTY_BUFFER);
    const bufferAfterW1 = resultW1.newDelayedEffects as DelayedEffectsBuffer;

    // W=2 — training=10, consumes W=1 buffer, enqueues new effect applyAt=3
    const prevStateW2: Readonly<WorldState> = { ...resultW1.nextState, training_intensity: 10 };
    const ctxW2 = makeCtx(2, prevStateW2, () => 0.5);
    const resultW2 = runTick(ctxW2, C4_ONLY, prevStateW2, [], bufferAfterW1);

    // The W=1 delayed effect (−9.984) was consumed at W=2
    // Net change to team_fitness = −9.984 (only W=1 effect lands in this window)
    const initialFitness = prevStateW1.team_fitness;
    expect(resultW2.nextState.team_fitness).toBeCloseTo(initialFitness - 9.984, 2);
  });

  // ── Noise term ─────────────────────────────────────────────────────────────

  it('test_c4_noise_positive_rng_1', () => {
    // AC #10 — Noise adds +1.0 when rng()=1.0.
    // noise = (1.0 − 0.5) × NOISE_C4_AMP = 0.5 × 2.0 = +1.0
    // training=50, morale=60: base = +6.4. Total = +6.4 + 1.0 = +7.4
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 60,
    };
    const ctxNoNoise = makeCtx(1, prevState, () => 0.5);
    const ctxPositiveNoise = makeCtx(1, prevState, () => 1.0);

    const baselineDelta = edgeC4.transferFn(prevState, ctxNoNoise);
    const noisyDelta = edgeC4.transferFn(prevState, ctxPositiveNoise);

    // Noisy delta should be +1.0 above the baseline
    expect(noisyDelta - baselineDelta).toBeCloseTo(1.0, 10);
    expect(noisyDelta).toBeCloseTo(7.4, 5);
  });

  it('test_c4_noise_negative_rng_0', () => {
    // AC #10 — Noise adds −1.0 when rng()=0.0.
    // noise = (0.0 − 0.5) × NOISE_C4_AMP = −0.5 × 2.0 = −1.0
    // training=50, morale=60: base = +6.4. Total = +6.4 − 1.0 = +5.4
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 60,
    };
    const ctxNoNoise = makeCtx(1, prevState, () => 0.5);
    const ctxNegativeNoise = makeCtx(1, prevState, () => 0.0);

    const baselineDelta = edgeC4.transferFn(prevState, ctxNoNoise);
    const noisyDelta = edgeC4.transferFn(prevState, ctxNegativeNoise);

    // Noisy delta should be −1.0 below the baseline
    expect(noisyDelta - baselineDelta).toBeCloseTo(-1.0, 10);
    expect(noisyDelta).toBeCloseTo(5.4, 5);
  });

  // ── Determinism ────────────────────────────────────────────────────────────

  it('test_c4_determinism_same_seed', () => {
    // AC #11 — Same prevState + same rng sequence → identical delta across two calls.
    // Uses a deterministic counter rng to include noise in both calls.
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 60,
      staff_morale: 75,
    };

    // rng sequence: 0.3 on first call
    const ctx1 = makeCtx(1, prevState, () => 0.3);
    const ctx2 = makeCtx(1, prevState, () => 0.3);

    const delta1 = edgeC4.transferFn(prevState, ctx1);
    const delta2 = edgeC4.transferFn(prevState, ctx2);

    expect(delta1).toBe(delta2);
  });

  // ── T_high boundary (symmetric root) ─────────────────────────────────────

  it('test_c4_at_t_high_root_zero', () => {
    // Story Notes/Gotchas: "At I_train = T_high = 75: (50) × (0) / 625 = 0."
    // Symmetric to AC #1 (T_low=25 root). Both parabola roots must produce delta=0.
    // training=75, morale=60, rng=0.5 → base = 6.4×(75−25)×(75−75)/625 = 0
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 75,
      staff_morale: 60,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);
    const delta = edgeC4.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c4_sign_invariant_overtraining_stays_negative_at_low_morale', () => {
    // Story says C10 multiplier "does NOT reverse the sign" of extremes.
    // Overtraining (training=80) produces a negative delta even at morale=0
    // (half efficiency reduces magnitude but does not flip sign).
    // morale=0: K_C4_eff = 8.0 × 0.5 = 4.0
    // base = 4.0 × (80−25) × (75−80) / 625 = 4.0 × 55 × (−5) / 625 = −1.76
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 80,
      staff_morale: 0,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);
    const delta = edgeC4.transferFn(prevState, ctx);
    // Must still be negative — lower morale only reduces magnitude, not sign
    expect(delta).toBeLessThan(0);
    expect(delta).toBeCloseTo(-1.76, 5);
  });

  // ── Delay routing ──────────────────────────────────────────────────────────

  it('test_c4_delay_routing_week_plus_1', () => {
    // AC #12 — C4 has delay:1. When evaluated at W=N, the effect must be enqueued
    // for applyAt = N+1. The destination node (team_fitness) must NOT change in
    // the evaluation tick.
    const W = 7;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      training_intensity: 50,
      staff_morale: 60,
    };
    const ctx = makeCtx(W, prevState, () => 0.5);

    // Act
    const result = runTick(ctx, C4_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — effect is enqueued for next week
    const c4Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C4');
    expect(c4Effect).toBeDefined();
    expect(c4Effect!.applyAt).toBe(W + 1);
    expect(c4Effect!.toNode).toBe('team_fitness');
    expect(c4Effect!.delta).toBeCloseTo(6.4, 5);

    // team_fitness must NOT change in the evaluation tick (delay not consumed yet)
    expect(result.nextState.team_fitness).toBe(prevState.team_fitness);
  });
});

// ── Constant sanity checks ─────────────────────────────────────────────────────

describe('C4/C10 constant sanity', () => {
  it('test_c4_parabola_normalizer_matches_formula', () => {
    // C4_PARABOLA_NORMALIZER must equal (T_high − T_low)² / 4 = (75−25)² / 4 = 625
    const expected = ((T_high - T_low) ** 2) / 4;
    expect(C4_PARABOLA_NORMALIZER).toBe(expected);
    expect(C4_PARABOLA_NORMALIZER).toBe(625);
  });

  it('test_c4_morale_scale_min_produces_half_efficiency_at_sm_0', () => {
    // MORALE_SCALE_MIN = 0.5 means morale=0 gives 50% K_C4 (never zero)
    const multiplierAtZero = MORALE_SCALE_MIN + (0 / 100) * (1 - MORALE_SCALE_MIN);
    expect(multiplierAtZero).toBe(MORALE_SCALE_MIN);
    expect(K_C4 * multiplierAtZero).toBe(4.0);
  });

  it('test_c4_morale_scale_at_sm_100_equals_1', () => {
    // MORALE_SCALE_MIN + (100/100) × (1 − MORALE_SCALE_MIN) = MORALE_SCALE_MIN + (1 − MORALE_SCALE_MIN) = 1.0
    const multiplierAtFull = MORALE_SCALE_MIN + (100 / 100) * (1 - MORALE_SCALE_MIN);
    expect(multiplierAtFull).toBeCloseTo(1.0, 10);
    expect(K_C4 * multiplierAtFull).toBeCloseTo(K_C4, 10);
  });

  it('test_c4_noise_amp_symmetric_range', () => {
    // NOISE_C4_AMP = 2.0 → noise range is ±1.0 (from rng ∈ [0,1])
    // At rng=0.0: noise = (0.0 − 0.5) × 2.0 = −1.0
    // At rng=1.0: noise = (1.0 − 0.5) × 2.0 = +1.0
    const noiseMin = (0.0 - 0.5) * NOISE_C4_AMP;
    const noiseMax = (1.0 - 0.5) * NOISE_C4_AMP;
    expect(noiseMin).toBeCloseTo(-1.0, 10);
    expect(noiseMax).toBeCloseTo(1.0, 10);
  });
});

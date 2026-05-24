/**
 * Unit tests for chains C2, C3, C13.
 *
 * C2  — injury_risk → squad_available_pct (delay 1, noisy).
 * C3  — field_quality → team_fitness (threshold, pure, delay 0).
 * C13 — squad_available_pct → team_fitness (sweet spot, pure, delay 1).
 *
 * Story: CASCADE-ENGINE-007
 * Acceptance Criteria: AC #1–15 (all 15 ACs from the story).
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c2-c3-c13.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  K_injury,
  IR_base,
  NOISE_C2_AMP,
  K_field_fatigue,
  T_field_poor,
  K_squad_fit,
  SQ_optimal,
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
 * rng defaults to () => 0 (deterministic, noise-free baseline).
 */
function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  rng: () => number = () => 0,
): SimContext {
  return { rng, currentWeek, hasMatchThisWeek: false, prevState };
}

/** Empty delayed-effects buffer. */
const EMPTY_BUFFER: DelayedEffectsBuffer = [];

// ── Filtered graphs ────────────────────────────────────────────────────────────

const C2_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C2');
const C3_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C3');
const C13_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C13');

/** C0 + C3 + C13 for additive fan-in composition test (AC #14). */
const C0_C3_C13 = CASCADA_FC_GRAPH.filter((e) =>
  ['C0', 'C3', 'C13'].includes(e.id),
);

// ── Edge references for direct transferFn spot-value tests ────────────────────

const edgeC2 = CASCADA_FC_GRAPH.find((e) => e.id === 'C2')!;
const edgeC3 = CASCADA_FC_GRAPH.find((e) => e.id === 'C3')!;
const edgeC13 = CASCADA_FC_GRAPH.find((e) => e.id === 'C13')!;

// ── C2: injury_risk → squad_available_pct (delay 1, noisy) ───────────────────

describe('chain C2 — injury_risk to squad_available_pct (delay 1, noisy)', () => {
  it('test_c2_baseline_zero_noise_injury_risk_50', () => {
    // Arrange — injury_risk=50, rng()=0.5 → noise = (0.5 - 0.5) × 2.0 = 0
    // base = -K_injury × (50 - IR_base) = -0.30 × 30 = -9.0
    // Expected delta = -9.0 (AC #1)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 50,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    // Act
    const delta = edgeC2.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-9.0, 10);
  });

  it('test_c2_noise_positive_with_rng_1', () => {
    // Arrange — injury_risk=50, rng()=1.0 → noise = (1.0 - 0.5) × 2.0 = +1.0
    // base = -9.0; delta = -9.0 + 1.0 = -8.0 (AC #1)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 50,
    };
    const ctx = makeCtx(1, prevState, () => 1.0);

    // Act
    const delta = edgeC2.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-8.0, 10);
  });

  it('test_c2_noise_negative_with_rng_0', () => {
    // Arrange — injury_risk=50, rng()=0.0 → noise = (0.0 - 0.5) × 2.0 = -1.0
    // base = -9.0; delta = -9.0 - 1.0 = -10.0 (AC #1)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 50,
    };
    const ctx = makeCtx(1, prevState, () => 0.0);

    // Act
    const delta = edgeC2.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-10.0, 10);
  });

  it('test_c2_at_base_level_zero_delta', () => {
    // Arrange — injury_risk=20 (at IR_base), rng()=0.5 → noise = 0
    // base = -0.30 × (20 - 20) = 0.0; delta = 0.0 (AC #2)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 20,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    // Act
    const delta = edgeC2.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c2_below_base_positive_recovery', () => {
    // Arrange — injury_risk=10 (below IR_base=20), rng()=0.5 → noise = 0
    // base = -0.30 × (10 - 20) = -0.30 × -10 = +3.0 (AC #3)
    // Sign is positive: squad availability recovers when injury risk is low.
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 10,
    };
    const ctx = makeCtx(1, prevState, () => 0.5);

    // Act
    const delta = edgeC2.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(3.0, 10);
    expect(delta).toBeGreaterThan(0); // explicit sign check per story note
  });

  it('test_c2_noise_bound_all_rng_values', () => {
    // AC #4 — across 1001 evenly-spaced rng values [0, 1], the noise term
    // must stay within ±NOISE_C2_AMP/2 of the base deterministic value.
    // Uses systematic rng injection (no seedrandom dependency).
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 50,
    };
    const base = -K_injury * (50 - IR_base); // -9.0

    for (let i = 0; i <= 1000; i++) {
      const rngValue = i / 1000;
      const ctx = makeCtx(1, prevState, () => rngValue);
      const delta = edgeC2.transferFn(prevState, ctx);
      // |delta - base| must be ≤ NOISE_C2_AMP / 2 (= 1.0)
      expect(Math.abs(delta - base)).toBeLessThanOrEqual(NOISE_C2_AMP / 2 + 1e-10);
    }
  });

  it('test_c2_delay_routing_applyAt_week_plus_1', () => {
    // AC #5 — C2 has delay:1; engine must enqueue a DelayedEffect with applyAt=W+1.
    // At W=3, injury_risk=50, rng()=0.5 → delta=-9.0, effect queued for W=4.
    const W = 3;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 50,
    };
    const ctx = makeCtx(W, prevState, () => 0.5);

    // Act
    const result = runTick(ctx, C2_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — effect is enqueued (not immediately applied)
    const c2Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C2');
    expect(c2Effect).toBeDefined();
    expect(c2Effect!.applyAt).toBe(W + 1); // = 4
    expect(c2Effect!.toNode).toBe('squad_available_pct');
    expect(c2Effect!.delta).toBeCloseTo(-9.0, 10);

    // squad_available_pct must NOT have changed this tick (delayed)
    expect(result.nextState.squad_available_pct).toBe(
      prevState.squad_available_pct,
    );
  });

  it('test_c2_at_injury_risk_max_value_stays_bounded', () => {
    // injury_risk=100 (maximum): base = -0.30*(100-20) = -24.0; noise ∈ [-1.0, +1.0]
    // Expected delta range: [-25.0, -23.0] — no overflow, no NaN.
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), injury_risk: 100 };
    for (const rngValue of [0.0, 0.5, 1.0]) {
      const ctx = makeCtx(1, prevState, () => rngValue);
      const delta = edgeC2.transferFn(prevState, ctx);
      expect(isNaN(delta)).toBe(false);
      expect(isFinite(delta)).toBe(true);
      expect(delta).toBeLessThanOrEqual(-23.0);
      expect(delta).toBeGreaterThanOrEqual(-25.0);
    }
  });

  it('test_c2_determinism_same_rng_same_result', () => {
    // AC #15 — two runTick calls with the same rng sequence → identical outputs.
    // Uses a counter-based deterministic rng (no Math.random, no seedrandom).
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      injury_risk: 45,
    };

    // First call
    let counter1 = 0;
    const ctx1 = makeCtx(1, prevState, () => (++counter1 % 10) / 10);
    const result1 = runTick(ctx1, C2_ONLY, prevState, [], EMPTY_BUFFER);

    // Second call — identical counter reset
    let counter2 = 0;
    const ctx2 = makeCtx(1, prevState, () => (++counter2 % 10) / 10);
    const result2 = runTick(ctx2, C2_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — newDelayedEffects deltas must be bit-identical
    expect(result1.newDelayedEffects.length).toBe(result2.newDelayedEffects.length);
    for (let i = 0; i < result1.newDelayedEffects.length; i++) {
      const e1 = result1.newDelayedEffects[i]!;
      const e2 = result2.newDelayedEffects[i]!;
      expect(e1.delta).toBe(e2.delta);
      expect(e1.applyAt).toBe(e2.applyAt);
      expect(e1.toNode).toBe(e2.toNode);
    }
    // nextState must also be identical
    for (const key of Object.keys(result1.nextState) as Array<keyof WorldState>) {
      expect(result1.nextState[key]).toBe(result2.nextState[key]);
    }
  });
});

// ── C3: field_quality → team_fitness (threshold, pure) ───────────────────────

describe('chain C3 — field_quality to team_fitness (threshold, pure)', () => {
  it('test_c3_below_threshold_negative_delta', () => {
    // Arrange — field_quality=25 < T_field_poor(40)
    // delta = -K_field_fatigue × max(0, 40 - 25) = -0.10 × 15 = -1.5 (AC #6)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      field_quality: 25,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC3.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-1.5, 10);
  });

  it('test_c3_at_threshold_zero_delta', () => {
    // Arrange — field_quality=40 = T_field_poor
    // delta = -0.10 × max(0, 40 - 40) = -0.10 × 0 = 0.0 (AC #7)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      field_quality: 40,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC3.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c3_above_threshold_zero_delta', () => {
    // Arrange — field_quality=60 > T_field_poor(40)
    // delta = -0.10 × max(0, 40 - 60) = -0.10 × max(0, -20) = 0.0 (AC #7)
    // Good fields produce ZERO delta — they stop hurting, not helping.
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      field_quality: 60,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC3.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c3_floor_at_zero_field', () => {
    // Arrange — field_quality=0 (minimum possible)
    // delta = -0.10 × max(0, 40 - 0) = -0.10 × 40 = -4.0 (AC #8 — maximum negative)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      field_quality: 0,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC3.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-4.0, 10);
    // Verify with constant formula for maintainability
    expect(delta).toBeCloseTo(-K_field_fatigue * T_field_poor, 10);
  });

  it('test_c3_does_not_call_rng', () => {
    // C3 is a pure deterministic formula — it must never invoke ctx.rng().
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      field_quality: 25,
    };
    const rngSpy = vi.fn(() => 0.5);
    const ctx = makeCtx(1, prevState, rngSpy);

    // Act — run through engine pipeline
    runTick(ctx, C3_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert
    expect(rngSpy).not.toHaveBeenCalled();
  });
});

// ── C13: squad_available_pct → team_fitness (sweet spot, pure) ───────────────

describe('chain C13 — squad_available_pct to team_fitness (sweet spot, pure)', () => {
  it('test_c13_below_sweet_spot_negative', () => {
    // Arrange — squad_available_pct=60, below SQ_optimal(75)
    // delta = K_squad_fit × (60 - 75) / 100 = 5.0 × (-15) / 100 = -0.75 (AC #9)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      squad_available_pct: 60,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC13.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-0.75, 10);
  });

  it('test_c13_at_sweet_spot_zero', () => {
    // Arrange — squad_available_pct=75 = SQ_optimal (sweet spot)
    // delta = 5.0 × (75 - 75) / 100 = 0.0 (AC #10)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      squad_available_pct: 75,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC13.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c13_at_max_positive', () => {
    // Arrange — squad_available_pct=100 (maximum)
    // delta = 5.0 × (100 - 75) / 100 = 5.0 × 25 / 100 = +1.25 (AC #11)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      squad_available_pct: 100,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC13.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(1.25, 10);
  });

  it('test_c13_at_min_negative', () => {
    // Arrange — squad_available_pct=0 (minimum possible)
    // delta = 5.0 × (0 - 75) / 100 = 5.0 × (-75) / 100 = -3.75 (AC #12)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      squad_available_pct: 0,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC13.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-3.75, 10);
    // Verify the documented full range: [-3.75, +1.25]
    expect(delta).toBeCloseTo(-K_squad_fit * SQ_optimal / 100, 10);
  });

  it('test_c13_delay_routing_applyAt_week_plus_1', () => {
    // AC #13 — C13 has delay:1; engine must enqueue a DelayedEffect with applyAt=W+1.
    // At W=2, squad_available_pct=60 → delta=-0.75, effect queued for W=3.
    const W = 2;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      squad_available_pct: 60,
    };
    const ctx = makeCtx(W, prevState);

    // Act
    const result = runTick(ctx, C13_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — effect enqueued for next tick
    const c13Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C13');
    expect(c13Effect).toBeDefined();
    expect(c13Effect!.applyAt).toBe(W + 1); // = 3
    expect(c13Effect!.toNode).toBe('team_fitness');
    expect(c13Effect!.delta).toBeCloseTo(-0.75, 10);

    // team_fitness must NOT have changed this tick (delayed)
    expect(result.nextState.team_fitness).toBe(prevState.team_fitness);
  });
});

// ── Integration: AC #14 — C0 + C3 + C13 additive composition ─────────────────

describe('integration — C0 + C3 + C13 additive composition (AC #14)', () => {
  it('test_additive_c0_c3_same_tick_net_zero', () => {
    // AC #14 (partial mirror of full AC-ADD-01 from story 017):
    //
    // GIVEN: team_fitness=50, field_quality=30, squad_available_pct=60
    //
    // C0 delta  = -K_fit_decay × (50 - 70) = -0.05 × -20 = +1.0  (delay:0)
    // C3 delta  = -K_field_fatigue × max(0, 40 - 30) = -0.10 × 10 = -1.0 (delay:0)
    // C13 delta = K_squad_fit × (60 - 75) / 100 = -0.75  BUT delay:1 → NOT applied this tick
    //
    // Net this tick = +1.0 + (-1.0) = 0.0 → team_fitness stays at 50
    // C13 must appear in newDelayedEffects with applyAt = currentWeek + 1
    const W = 1;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      team_fitness: 50,
      field_quality: 30,
      squad_available_pct: 60,
    };
    const ctx = makeCtx(W, prevState);

    // Act
    const result = runTick(ctx, C0_C3_C13, prevState, [], EMPTY_BUFFER);

    // Assert — team_fitness unchanged this tick (net = 0)
    expect(result.nextState.team_fitness).toBeCloseTo(50, 5);

    // C13 delayed effect must be queued for next tick
    const c13Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C13');
    expect(c13Effect).toBeDefined();
    expect(c13Effect!.applyAt).toBe(W + 1);
    expect(c13Effect!.toNode).toBe('team_fitness');
    expect(c13Effect!.delta).toBeCloseTo(-0.75, 5);
  });

  it('test_c13_delayed_contribution_arrives_at_week_plus_1', () => {
    // Continuation of AC #14: C13's delayed delta of -0.75 must be applied at W+1.
    //
    // W=1: enqueue C13 delta=-0.75 for applyAt=2; team_fitness stays at 50 (net from C0+C3=0).
    // W=2: consume the buffer → team_fitness changes by -0.75 (plus new C0/C3 contributions).
    //
    // To isolate the C13 delayed arrival, use only C13 at W=2 with the W=1 buffer.
    const W = 1;
    const prevStateW1: Readonly<WorldState> = {
      ...defaultWorldState(),
      team_fitness: 50,
      field_quality: 30,
      squad_available_pct: 60,
    };
    const ctxW1 = makeCtx(W, prevStateW1);
    const resultW1 = runTick(ctxW1, C13_ONLY, prevStateW1, [], EMPTY_BUFFER);

    // W=2: consume buffer from W=1 using C13_ONLY (no other deltas this tick)
    const prevStateW2 = resultW1.nextState;
    const bufferW2 = resultW1.newDelayedEffects as DelayedEffectsBuffer;
    const ctxW2 = makeCtx(W + 1, prevStateW2);
    const resultW2 = runTick(ctxW2, C13_ONLY, prevStateW2, [], bufferW2);

    // Assert — team_fitness at W=2 includes the C13 delayed delta from W=1
    // W=1 C13 enqueued delta=-0.75; team_fitness was 50 at W=1; should be ~49.25 at W=2
    // (50 + (-0.75) = 49.25, plus new C13 delay from W=2 which does not apply until W=3)
    expect(resultW2.nextState.team_fitness).toBeCloseTo(50 - 0.75, 5);

    // The W=2 C13 effect is queued for W=3
    const c13EffectW3 = resultW2.newDelayedEffects.find((e) => e.edgeId === 'C13');
    expect(c13EffectW3).toBeDefined();
    expect(c13EffectW3!.applyAt).toBe(W + 2); // = 3
  });
});

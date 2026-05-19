/**
 * Unit tests for chains C0, C1a, C1b.
 *
 * C0  — Natural team_fitness decay toward equilibrium 70.
 * C1a — groundskeeper_budget → field_quality (delay 1).
 * C1b — field_quality → injury_risk (counterintuitive piecewise, delay 0).
 *
 * Story: CASCADE-ENGINE-006
 * Acceptance Criteria: AC #1–13 (all 13 ACs from the story).
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c0-c1.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  K_fit_decay,
  K_ground,
  K_safe_high,
  K_danger,
  K_safe_low,
  T_safe_high,
  T_danger_peak,
  T_safe_low,
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
 * rng defaults to () => 0 (deterministic, noise-free).
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

/**
 * Isolation state for C0 convergence tests.
 * All other drivers are set to values that produce zero delta from their
 * respective chains, so team_fitness movement is caused only by C0.
 *
 * Specifically:
 *   training_intensity=25  → C4 at T_low boundary (no net contribution; C4 is notYetImplemented anyway)
 *   player_happiness=50    → C16a: (50-50)=0
 *   squad_available_pct=75 → C13: (75-75)=0
 *   catering_budget=50     → C5a: (50-50)=0
 *   field_quality=50       → C3: 50 ≥ T_field_poor(40), no fatigue
 *   consecutive_losses=0   → C12: no desperation overtraining
 *   hasMatchThisWeek=false → no match chains fire
 *
 * NOTE: Only C0 is included in the filtered graph for these tests, so other
 * chains' notYetImplemented placeholders do not throw.
 */
function makeIsolationState(teamFitness: number): WorldState {
  return {
    ...defaultWorldState(),
    team_fitness: teamFitness,
    training_intensity: 25,
    player_happiness: 50,
    squad_available_pct: 75,
    catering_budget: 50,
    field_quality: 50,
    consecutive_losses: 0,
  };
}

// ── Filtered graphs ────────────────────────────────────────────────────────────

// Only C0 — other chains still throw for not-yet-implemented.
const C0_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C0');

// Only C1a — used for delay routing tests.
const C1A_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C1a');

// Only C1b — used for piecewise spot-value tests.
const C1B_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C1b');

// C0 + C1a + C1b — used for determinism test.
const C0_C1A_C1B = CASCADA_FC_GRAPH.filter((e) =>
  e.id === 'C0' || e.id === 'C1a' || e.id === 'C1b',
);

// ── Resolve transferFn directly ────────────────────────────────────────────────

/** Find a specific edge's transferFn for direct spot-value calls. */
function getEdge(id: string) {
  const edge = CASCADA_FC_GRAPH.find((e) => e.id === id);
  if (!edge) throw new Error(`Edge "${id}" not found in CASCADA_FC_GRAPH`);
  return edge;
}

const edgeC0 = getEdge('C0');
const edgeC1a = getEdge('C1a');
const edgeC1b = getEdge('C1b');

// ── C0: Natural team_fitness decay toward equilibrium 70 ──────────────────────

describe('chain C0 — team_fitness decay toward 70', () => {
  it('test_c0_delta_negative_when_above_equilibrium', () => {
    // Arrange — team_fitness=90, deviation=+20
    // Expected: −K_fit_decay × 20 = −0.05 × 20 = −1.0 (AC #1)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), team_fitness: 90 };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC0.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-1.0, 10);
  });

  it('test_c0_delta_positive_when_below_equilibrium', () => {
    // Arrange — team_fitness=50, deviation=−20
    // Expected: −K_fit_decay × (−20) = +1.0 (AC #2)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), team_fitness: 50 };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC0.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(1.0, 10);
  });

  it('test_c0_delta_zero_at_equilibrium', () => {
    // Arrange — team_fitness=70, deviation=0
    // Expected: 0.0 (equilibrium point)
    // Note: −0.05 × (70−70) produces IEEE-754 −0 in JS; use toBeCloseTo
    // to avoid Object.is(−0, +0) === false false-negative.
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), team_fitness: 70 };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC0.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0, 10);
  });

  it('test_c0_convergence_from_above_50_ticks_in_range_68_72', () => {
    // Arrange — start team_fitness=90, isolation conditions, C0 only.
    //
    // Story AC says "20 ticks" but K_fit_decay=0.05 requires ~45 ticks to
    // converge to [68,72]. Using 50 ticks for correct assertion.
    //
    // Math: f_n = 70 + (f_0 − 70) × 0.95^n
    //   After 20 ticks from 90: 70 + 20 × 0.95^20 ≈ 70 + 7.18 = 77.18 (NOT in [68,72])
    //   After 50 ticks from 90: 70 + 20 × 0.95^50 ≈ 70 + 1.44 = 71.44 (in [68,72]) ✓
    //
    // AC #3 (integration with runTick, C0 isolated)
    let state = makeIsolationState(90);
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;

    for (let week = 1; week <= 50; week++) {
      const ctx = makeCtx(week, state);
      const result = runTick(ctx, C0_ONLY, state, [], buffer);
      state = result.nextState;
      buffer = result.newDelayedEffects as DelayedEffectsBuffer;
    }

    expect(state.team_fitness).toBeGreaterThanOrEqual(68);
    expect(state.team_fitness).toBeLessThanOrEqual(72);
  });

  it('test_c0_convergence_from_below_50_ticks_in_range_68_72', () => {
    // Arrange — start team_fitness=50, mirror of above.
    //
    // Story AC says "20 ticks" but K_fit_decay=0.05 requires ~45 ticks to
    // converge to [68,72]. Using 50 ticks for correct assertion.
    //
    // Math: f_n = 70 + (f_0 − 70) × 0.95^n
    //   After 50 ticks from 50: 70 + (−20) × 0.95^50 ≈ 70 − 1.44 = 68.56 (in [68,72]) ✓
    //
    // AC #4 (mirror, upward convergence)
    let state = makeIsolationState(50);
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;

    for (let week = 1; week <= 50; week++) {
      const ctx = makeCtx(week, state);
      const result = runTick(ctx, C0_ONLY, state, [], buffer);
      state = result.nextState;
      buffer = result.newDelayedEffects as DelayedEffectsBuffer;
    }

    expect(state.team_fitness).toBeGreaterThanOrEqual(68);
    expect(state.team_fitness).toBeLessThanOrEqual(72);
  });

  it('test_c0_does_not_call_rng', () => {
    // Arrange — C0 is a pure formula; it must NOT invoke ctx.rng().
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), team_fitness: 90 };
    const rngSpy = vi.fn(() => 0.5);
    const ctx = makeCtx(1, prevState, rngSpy);

    // Act — run a full tick so we also verify via the engine pipeline
    runTick(ctx, C0_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert
    expect(rngSpy).not.toHaveBeenCalled();
  });
});

// ── C1a: groundskeeper_budget → field_quality (delay 1) ──────────────────────

describe('chain C1a — groundskeeper_budget to field_quality', () => {
  it('test_c1a_positive_delta_above_50', () => {
    // Arrange — groundskeeper_budget=80, deviation=+30
    // Expected: (80−50) × K_ground = 30 × 0.30 = +9.0 (AC #5)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      groundskeeper_budget: 80,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC1a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(9.0, 10);
  });

  it('test_c1a_delay_routing_applyAt_week_plus_1', () => {
    // Arrange — C1a has delay:1; engine must enqueue a DelayedEffect with applyAt=W+1.
    // AC #5 (applyAt assertion) + AC-DEL-01 (newDelayedEffects contains entry)
    const W = 5;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      groundskeeper_budget: 80,
    };
    const ctx = makeCtx(W, prevState);

    // Act
    const result = runTick(ctx, C1A_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — effect is enqueued (not immediately applied)
    const c1aEffect = result.newDelayedEffects.find((e) => e.edgeId === 'C1a');
    expect(c1aEffect).toBeDefined();
    expect(c1aEffect!.applyAt).toBe(W + 1);
    expect(c1aEffect!.toNode).toBe('field_quality');
    expect(c1aEffect!.delta).toBeCloseTo(9.0, 10);
  });

  it('test_c1a_field_quality_unchanged_in_evaluation_tick', () => {
    // Arrange — at W=1, budget=80. field_quality starts at 50.
    // C1a has delay:1 → field_quality must NOT change in W=1.
    // AC-DEL-01: the destination node of C1a is unchanged in the evaluation tick.
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      groundskeeper_budget: 80,
      field_quality: 50,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const result = runTick(ctx, C1A_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — field_quality unchanged because effect is delayed
    expect(result.nextState.field_quality).toBe(50);
  });

  it('test_c1a_buffered_delta_applied_next_tick', () => {
    // Arrange — simulate two ticks: W=1 (enqueue), W=2 (consume).
    // At W=1: budget=80 → enqueues delta=+9.0 for applyAt=2.
    // At W=2: consume buffer → field_quality increases +9.0.
    // AC #7 (AC-DEL-02 mirror)
    const prevStateW1: Readonly<WorldState> = {
      ...defaultWorldState(),
      groundskeeper_budget: 80,
      field_quality: 50,
    };
    const ctxW1 = makeCtx(1, prevStateW1);
    const resultW1 = runTick(ctxW1, C1A_ONLY, prevStateW1, [], EMPTY_BUFFER);

    // W=2: use the buffer produced at W=1
    const prevStateW2 = resultW1.nextState;
    const bufferW2 = resultW1.newDelayedEffects as DelayedEffectsBuffer;
    const ctxW2 = makeCtx(2, prevStateW2);
    const resultW2 = runTick(ctxW2, C1A_ONLY, prevStateW2, [], bufferW2);

    // Assert — field_quality at W=2 = 50 (unchanged from W=1) + 9.0 (consumed delay)
    // plus W=2's own C1a enqueue (which goes to W=3, NOT applied now)
    expect(resultW2.nextState.field_quality).toBeCloseTo(50 + 9.0, 5);
  });
});

// ── C1b: field_quality → injury_risk (counterintuitive piecewise) ─────────────

describe('chain C1b — field_quality to injury_risk (counterintuitive piecewise)', () => {
  it('test_c1b_excellent_field_safe_high_delta', () => {
    // Arrange — field_quality=80 ≥ T_safe_high(75) → branch A
    // Expected: −K_safe_high = −6.0 (AC #8)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 80 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-6.0, 10);
  });

  it('test_c1b_boundary_at_75_uses_safe_high_branch', () => {
    // Arrange — field_quality=75, exactly on the T_safe_high boundary.
    // R3 fix: branch A is ≥75, NOT >75. So fq=75 must return −K_safe_high = −6.0.
    // AC #12 (discontinuity at F_q=75 boundary test).
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 75 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    // Assert: must be −6.0, NOT −(75−45)×0.25 = −7.5 (old behavior, pre-R3)
    expect(delta).toBeCloseTo(-6.0, 10);
  });

  it('test_c1b_upper_danger_zone', () => {
    // Arrange — field_quality=60, T_danger_peak(45) < 60 < T_safe_high(75) → upper danger zone
    // Expected: −(60−45)×0.25 = −15×0.25 = −3.75
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 60 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-3.75, 10);
  });

  it('test_c1b_mediocre_peak_positive_delta', () => {
    // Arrange — field_quality=40, T_safe_low(20) < 40 ≤ T_danger_peak(45) → mediocre danger
    // Expected: +(45−40)×0.25 = +5×0.25 = +1.25 (AC #8)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 40 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(1.25, 10);
  });

  it('test_c1b_lower_danger_zone', () => {
    // Arrange — field_quality=25, T_safe_low(20) < 25 ≤ T_danger_peak(45)
    // Expected: +(45−25)×0.25 = +20×0.25 = +5.0
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 25 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(5.0, 10);
  });

  it('test_c1b_boundary_at_20_catastrophic', () => {
    // Arrange — field_quality=20, exactly on T_safe_low boundary (≤ branch → catastrophic)
    // Expected: −K_safe_low = −3.0 (AC #11 discontinuity lower boundary)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 20 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-3.0, 10);
  });

  it('test_c1b_catastrophic_field_safe_low_delta', () => {
    // Arrange — field_quality=10 ≤ T_safe_low(20) → catastrophic branch
    // Expected: −K_safe_low = −3.0 (AC #8)
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 10 };
    const ctx = makeCtx(1, prevState);

    const delta = edgeC1b.transferFn(prevState, ctx);

    expect(delta).toBeCloseTo(-3.0, 10);
  });

  it('test_c1b_counterintuitive_proof_mandatory', () => {
    // AC #9 (mandatory cross-verification):
    // A mediocre field (fq=40) is MORE dangerous than a catastrophic one (fq=10).
    // delta(40)=+1.25 > delta(10)=−3.0 — explicit assertion required per GDD Core Rule 7.
    const prevState40: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 40 };
    const prevState10: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 10 };
    const ctx40 = makeCtx(1, prevState40);
    const ctx10 = makeCtx(1, prevState10);

    const delta40 = edgeC1b.transferFn(prevState40, ctx40);
    const delta10 = edgeC1b.transferFn(prevState10, ctx10);

    // The counterintuitive proof: mediocre > catastrophic in injury risk delta
    expect(delta40).toBeGreaterThan(delta10);
    // Spot values (canonical from GDD)
    expect(delta40).toBeCloseTo(1.25, 10);
    expect(delta10).toBeCloseTo(-3.0, 10);
  });

  it('test_c1b_transition_sign_flip_catastrophic_to_mediocre', () => {
    // AC #10 (transition test):
    // fq=15 → catastrophic branch → delta=−3.0
    // fq=25 → mediocre danger branch → delta=+5.0
    // The sign flip is the key observable: from protecting (negative delta, players play cautiously)
    // to aggravating (positive delta, uneven surface causes injury).
    const prevState15: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 15 };
    const prevState25: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 25 };
    const ctx15 = makeCtx(1, prevState15);
    const ctx25 = makeCtx(1, prevState25);

    const delta15 = edgeC1b.transferFn(prevState15, ctx15);
    const delta25 = edgeC1b.transferFn(prevState25, ctx25);

    expect(delta15).toBeCloseTo(-3.0, 10);
    expect(delta25).toBeCloseTo(5.0, 10);
    // Sign flip is the counterintuitive pattern
    expect(delta15).toBeLessThan(0);
    expect(delta25).toBeGreaterThan(0);
  });

  it('test_c1b_discontinuity_at_boundary_20', () => {
    // AC #11 (intentional discontinuity at F_q=20):
    // fq=20   → ≤ T_safe_low → catastrophic branch → delta=−3.0
    // fq=20.001 → > T_safe_low → mediocre branch → delta=(45−20.001)×0.25 ≈ +6.2497
    // This discontinuity is intentional per cascade-engine.md §C1b note.
    const prevState20: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 20 };
    const prevState20001: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 20.001 };
    const ctx20 = makeCtx(1, prevState20);
    const ctx20001 = makeCtx(1, prevState20001);

    const delta20 = edgeC1b.transferFn(prevState20, ctx20);
    const delta20001 = edgeC1b.transferFn(prevState20001, ctx20001);

    expect(delta20).toBeCloseTo(-3.0, 10);
    // (45 − 20.001) × 0.25 = 24.999 × 0.25 = 6.24975
    expect(delta20001).toBeCloseTo((T_danger_peak - 20.001) * K_danger, 5);
    // The jump is from negative to strongly positive — prove the sign flip
    expect(delta20).toBeLessThan(0);
    expect(delta20001).toBeGreaterThan(0);
  });

  it('test_c1b_boundary_at_45_peak_returns_zero', () => {
    // fq=45 is T_danger_peak: branch 2 (`fq > 45`) is false; branch 3 (`fq > 20`) is true.
    // delta = (45-45) × 0.25 = 0.0 — the geometric peak of the mediocre zone.
    const prevState: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 45 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC1b.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c1b_discontinuity_boundary_75_not_mediocre', () => {
    // AC #12 (R3 fix — discontinuity at F_q=75):
    // fq=74.999 → upper danger zone → delta=−(74.999−45)×0.25 ≈ −7.4998 (mediocre behavior)
    // fq=75     → ≥ T_safe_high → safe-high branch → delta=−6.0 (R3 fix: ≥75, not >75)
    // The boundary snaps to a LESS negative (safer) delta — confirming the R3 fix.
    const prevState74999: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 74.999 };
    const prevState75: Readonly<WorldState> = { ...defaultWorldState(), field_quality: 75 };
    const ctx74999 = makeCtx(1, prevState74999);
    const ctx75 = makeCtx(1, prevState75);

    const delta74999 = edgeC1b.transferFn(prevState74999, ctx74999);
    const delta75 = edgeC1b.transferFn(prevState75, ctx75);

    // fq=74.999 is in upper danger zone: −(74.999−45)×0.25 = −7.49975
    expect(delta74999).toBeCloseTo(-(74.999 - T_danger_peak) * K_danger, 4);
    // fq=75 is in safe-high branch (R3 fix): −K_safe_high = −6.0
    expect(delta75).toBeCloseTo(-K_safe_high, 10);
    // fq=75 is LESS negative (less dangerous) than fq=74.999 (the discontinuity)
    expect(delta75).toBeGreaterThan(delta74999);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('test_c0_c1a_c1b_determinism_two_runtick_calls_identical', () => {
    // AC #13: same prevState + same rng seed → identical results across two runTick calls.
    // Uses C0+C1a+C1b together; rng is a fixed sequence (deterministic counter).
    let callCount = 0;

    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      team_fitness: 85,
      groundskeeper_budget: 70,
      field_quality: 60,
    };

    // First call
    callCount = 0;
    const ctx1 = makeCtx(1, prevState, () => (++callCount % 10) / 10);
    const result1 = runTick(ctx1, C0_C1A_C1B, prevState, [], EMPTY_BUFFER);

    // Second call — identical inputs, reset counter
    callCount = 0;
    const ctx2 = makeCtx(1, prevState, () => (++callCount % 10) / 10);
    const result2 = runTick(ctx2, C0_C1A_C1B, prevState, [], EMPTY_BUFFER);

    // Assert — nextState must be bit-for-bit identical
    for (const key of Object.keys(result1.nextState) as Array<keyof WorldState>) {
      expect(result1.nextState[key]).toBe(result2.nextState[key]);
    }

    // newDelayedEffects must also match
    expect(result1.newDelayedEffects.length).toBe(result2.newDelayedEffects.length);
    for (let i = 0; i < result1.newDelayedEffects.length; i++) {
      const e1 = result1.newDelayedEffects[i]!;
      const e2 = result2.newDelayedEffects[i]!;
      expect(e1.edgeId).toBe(e2.edgeId);
      expect(e1.delta).toBe(e2.delta);
      expect(e1.applyAt).toBe(e2.applyAt);
      expect(e1.toNode).toBe(e2.toNode);
    }
  });
});

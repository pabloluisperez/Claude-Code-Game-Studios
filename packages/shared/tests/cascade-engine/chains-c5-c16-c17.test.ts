/**
 * Unit tests for chains C5a, C5b, C16a, C16b, C17.
 *
 * C5a  — catering_budget → team_fitness (delay 1, pure).
 * C5b  — catering_budget → staff_morale (delay 1, pure).
 * C16a — player_happiness → team_fitness (delay 0, no guard, always fires).
 * C16b — player_happiness → match_performance_index (delay 0, guarded by hasMatchThisWeek).
 * C17  — sponsor_quality → player_happiness (delay 1, pure, monotonic non-negative).
 *
 * Story: CASCADE-ENGINE-009
 * Acceptance Criteria: AC #1–16 (all 16 ACs from the story).
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c5-c16-c17.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  K_catering_fit,
  K_catering_moral,
  K_happy_fit,
  K_happy_perf,
  K_sponsor_happy,
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
 * hasMatchThisWeek defaults to false; pass true for C16b guard tests.
 */
function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  rng: () => number = () => 0,
  hasMatchThisWeek = false,
): SimContext {
  return { rng, currentWeek, hasMatchThisWeek, prevState };
}

/** Empty delayed-effects buffer. */
const EMPTY_BUFFER: DelayedEffectsBuffer = [];

/** Find a specific edge's transferFn for direct spot-value calls. */
function getEdge(id: string) {
  const edge = CASCADA_FC_GRAPH.find((e) => e.id === id);
  if (!edge) throw new Error(`Edge "${id}" not found in CASCADA_FC_GRAPH`);
  return edge;
}

// ── Filtered graphs ────────────────────────────────────────────────────────────

const C5A_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C5a');
const C5B_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C5b');
const C16A_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C16a');
const C16B_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C16b');
const C17_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C17');
const C5A_C5B_C17 = CASCADA_FC_GRAPH.filter(
  (e) => e.id === 'C5a' || e.id === 'C5b' || e.id === 'C17',
);
const C16A_C16B = CASCADA_FC_GRAPH.filter(
  (e) => e.id === 'C16a' || e.id === 'C16b',
);
const ALL_FIVE = CASCADA_FC_GRAPH.filter((e) =>
  ['C5a', 'C5b', 'C16a', 'C16b', 'C17'].includes(e.id),
);

// ── Pre-resolved edges ─────────────────────────────────────────────────────────

const edgeC5a = getEdge('C5a');
const edgeC5b = getEdge('C5b');
const edgeC16a = getEdge('C16a');
const edgeC16b = getEdge('C16b');
const edgeC17 = getEdge('C17');

// ── C5a: catering_budget → team_fitness (delay 1) ─────────────────────────────

describe('chain C5a — catering_budget to team_fitness (delay 1)', () => {
  it('test_chain_c5a_positive_above_50', () => {
    // Arrange — catering_budget=80, deviation=+30
    // Expected: K_catering_fit × (80 − 50) / 50 = 3.0 × 30 / 50 = +1.8 (AC #1)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 80,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC5a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(1.8, 10);
  });

  it('test_chain_c5a_negative_below_50', () => {
    // Arrange — catering_budget=20, deviation=−30
    // Expected: K_catering_fit × (20 − 50) / 50 = 3.0 × (−30) / 50 = −1.8 (AC #2)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 20,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC5a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-1.8, 10);
  });

  it('test_chain_c5a_equilibrium_at_50', () => {
    // Arrange — catering_budget=50, deviation=0
    // Expected: K_catering_fit × 0 / 50 = 0.0 (AC #3)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 50,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC5a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });
});

// ── C5b: catering_budget → staff_morale (delay 1) ─────────────────────────────

describe('chain C5b — catering_budget to staff_morale (delay 1)', () => {
  it('test_chain_c5b_negative_below_50', () => {
    // Arrange — catering_budget=20, deviation=−30
    // Expected: K_catering_moral × (20 − 50) / 50 = 4.0 × (−30) / 50 = −2.4 (AC #4)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 20,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC5b.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-2.4, 10);
  });

  it('test_chain_c5b_greater_magnitude_than_c5a', () => {
    // Arrange — same catering_budget for both edges.
    // |C5b delta| > |C5a delta| because K_catering_moral (4.0) > K_catering_fit (3.0).
    // "Staff is more sensitive to catering than players." (AC #5)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 20,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const deltaC5a = edgeC5a.transferFn(prevState, ctx);
    const deltaC5b = edgeC5b.transferFn(prevState, ctx);

    // Assert — magnitudes (both negative, so compare absolute values)
    expect(Math.abs(deltaC5b)).toBeGreaterThan(Math.abs(deltaC5a));
    // Canonical spot values
    expect(deltaC5a).toBeCloseTo(-1.8, 10);
    expect(deltaC5b).toBeCloseTo(-2.4, 10);
    // Sanity: K constants confirm the asymmetry
    expect(K_catering_moral).toBeGreaterThan(K_catering_fit);
  });
});

// ── C16a: player_happiness → team_fitness (delay 0, no guard) ─────────────────

describe('chain C16a — player_happiness to team_fitness (delay 0, always fires)', () => {
  it('test_chain_c16a_positive_above_50', () => {
    // Arrange — player_happiness=80, deviation=+30
    // Expected: K_happy_fit × (80 − 50) / 50 = 4.0 × 30 / 50 = +2.4 (AC #6)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 80,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC16a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(2.4, 10);
  });

  it('test_chain_c16a_negative_below_50', () => {
    // Arrange — player_happiness=20, deviation=−30
    // Expected: K_happy_fit × (20 − 50) / 50 = 4.0 × (−30) / 50 = −2.4 (AC #7)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 20,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC16a.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-2.4, 10);
  });

  it('test_chain_c16a_fires_on_non_match_week', () => {
    // Arrange — hasMatchThisWeek=false; C16a has no guard, must still fire. (AC #14)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 80,
      team_fitness: 70,
    };
    const ctx = makeCtx(1, prevState, () => 0, false /* hasMatchThisWeek */);

    // Act
    const result = runTick(ctx, C16A_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — team_fitness changed due to C16a (delay:0 → immediate write)
    // delta = +2.4 → team_fitness should be ~72.4
    expect(result.nextState.team_fitness).toBeCloseTo(70 + 2.4, 5);
    // No delayed effect enqueued (delay:0)
    const c16aEffect = result.newDelayedEffects.find((e) => e.edgeId === 'C16a');
    expect(c16aEffect).toBeUndefined();
  });
});

// ── C16b: player_happiness → match_performance_index (delay 0, guarded) ────────

describe('chain C16b — player_happiness to match_performance_index (guarded by hasMatchThisWeek)', () => {
  it('test_chain_c16b_fires_with_match_this_week', () => {
    // Arrange — player_happiness=20, hasMatchThisWeek=true
    // Expected: K_happy_perf × (20 − 50) / 50 = 7.0 × (−30) / 50 = −4.2 (AC #8)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 20,
    };
    const ctx = makeCtx(1, prevState, () => 0, true /* hasMatchThisWeek */);

    // Act
    const delta = edgeC16b.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(-4.2, 10);
  });

  it('test_chain_c16b_does_not_fire_without_match', () => {
    // Arrange — hasMatchThisWeek=false → guardFn returns false → C16b suppressed.
    // The log must contain a 'guarded' entry for C16b; MPI must be unchanged. (AC #9)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 20,
    };
    const ctx = makeCtx(1, prevState, () => 0, false /* hasMatchThisWeek */);

    // Act
    const result = runTick(ctx, C16B_ONLY, prevState, [], EMPTY_BUFFER);

    // Assert — guarded log entry present
    const guardedLog = result.log.find(
      (e) => e.source === 'guarded' && e.edgeId === 'C16b',
    );
    expect(guardedLog).toBeDefined();
    // match_performance_index unchanged (guard prevented write)
    expect(result.nextState.match_performance_index).toBe(
      prevState.match_performance_index,
    );
    // No delayed effect enqueued either
    expect(result.newDelayedEffects.find((e) => e.edgeId === 'C16b')).toBeUndefined();
  });

  it('test_chain_c16b_positive_happy_squad_with_match', () => {
    // Arrange — player_happiness=80, hasMatchThisWeek=true
    // Expected: K_happy_perf × (80 − 50) / 50 = 7.0 × 30 / 50 = +4.2 (AC #10)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      player_happiness: 80,
    };
    const ctx = makeCtx(1, prevState, () => 0, true /* hasMatchThisWeek */);

    // Act
    const delta = edgeC16b.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(4.2, 10);
  });
});

// ── C17: sponsor_quality → player_happiness (delay 1, monotonic non-negative) ──

describe('chain C17 — sponsor_quality to player_happiness (delay 1, monotonic)', () => {
  it('test_chain_c17_baseline', () => {
    // Arrange — sponsor_quality=60
    // Expected: K_sponsor_happy × 60 / 100 = 5.0 × 0.60 = +3.0 (AC #11)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      sponsor_quality: 60,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC17.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(3.0, 10);
  });

  it('test_chain_c17_zero_sponsor', () => {
    // Arrange — sponsor_quality=0 → no boost at all (AC #12)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      sponsor_quality: 0,
    };
    const ctx = makeCtx(1, prevState);

    // Act
    const delta = edgeC17.transferFn(prevState, ctx);

    // Assert
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_chain_c17_monotonic_non_negative_all_values', () => {
    // Arrange — 5 spot values spanning [0, 100]. (AC #13)
    // Canonical invariant: "sponsors only help, never hurt."
    // delta = K_sponsor_happy × sponsor_quality / 100, so delta ≥ 0 for all valid inputs.
    const spotValues = [0, 25, 50, 75, 100];

    for (const sponsor_quality of spotValues) {
      const prevState: Readonly<WorldState> = {
        ...defaultWorldState(),
        sponsor_quality,
      };
      const ctx = makeCtx(1, prevState);

      // Act
      const delta = edgeC17.transferFn(prevState, ctx);

      // Assert — non-negative for every spot value
      expect(delta, `C17 delta must be ≥ 0 for sponsor_quality=${sponsor_quality}`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Delay routing ──────────────────────────────────────────────────────────────

describe('delay routing — C5a/C5b/C17 queue; C16a/C16b write immediately', () => {
  it('test_chain_c5a_c5b_c17_delay_routing', () => {
    // Arrange — C5a/C5b/C17 all have delay:1.
    // At evaluation tick W=3 they must produce newDelayedEffects with applyAt=4.
    // C16a/C16b are delay:0 — they write deltaMap directly, not via delayed effects. (AC #15)
    const W = 3;
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 80,
      sponsor_quality: 60,
      player_happiness: 80,
    };
    const ctx = makeCtx(W, prevState, () => 0, true /* hasMatchThisWeek — so C16b fires */);

    // Act — run all 5 chains together
    const result = runTick(ctx, ALL_FIVE, prevState, [], EMPTY_BUFFER);

    // Assert — delayed chains produce applyAt = W+1
    const c5aEffect = result.newDelayedEffects.find((e) => e.edgeId === 'C5a');
    const c5bEffect = result.newDelayedEffects.find((e) => e.edgeId === 'C5b');
    const c17Effect = result.newDelayedEffects.find((e) => e.edgeId === 'C17');

    expect(c5aEffect).toBeDefined();
    expect(c5aEffect!.applyAt).toBe(W + 1);
    expect(c5aEffect!.toNode).toBe('team_fitness');
    expect(c5aEffect!.delta).toBeCloseTo(1.8, 5);

    expect(c5bEffect).toBeDefined();
    expect(c5bEffect!.applyAt).toBe(W + 1);
    expect(c5bEffect!.toNode).toBe('staff_morale');
    expect(c5bEffect!.delta).toBeCloseTo(2.4, 5);

    expect(c17Effect).toBeDefined();
    expect(c17Effect!.applyAt).toBe(W + 1);
    expect(c17Effect!.toNode).toBe('player_happiness');
    expect(c17Effect!.delta).toBeCloseTo(3.0, 5);

    // Assert — delay:0 chains do NOT appear in newDelayedEffects
    expect(result.newDelayedEffects.find((e) => e.edgeId === 'C16a')).toBeUndefined();
    expect(result.newDelayedEffects.find((e) => e.edgeId === 'C16b')).toBeUndefined();

    // Assert — C16a and C16b are immediately reflected in nextState
    // C16a: happiness=80, delta=+2.4 → team_fitness increases
    // C16b: happiness=80, hasMatchThisWeek=true, delta=+4.2 → MPI increases
    expect(result.nextState.team_fitness).toBeGreaterThan(prevState.team_fitness);
    expect(result.nextState.match_performance_index).toBeGreaterThan(
      prevState.match_performance_index,
    );
  });
});

// ── Purity: no ctx.rng() calls ─────────────────────────────────────────────────

describe('chains C5a/C5b/C16a/C16b/C17 — pure, no rng calls', () => {
  it('test_chain_all_pure_no_rng', () => {
    // Arrange — spy on rng; none of the 5 transferFns should invoke it. (AC #16)
    const rngSpy = vi.fn(() => 0.5);
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 80,
      player_happiness: 80,
      sponsor_quality: 60,
    };
    const ctx = makeCtx(1, prevState, rngSpy, true /* hasMatchThisWeek */);

    // Act — run all five chains via runTick
    runTick(ctx, ALL_FIVE, prevState, [], EMPTY_BUFFER);

    // Assert — rng was never called by any of the 5 transferFns
    expect(rngSpy).not.toHaveBeenCalled();
  });
});

// ── Determinism ────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('test_chain_determinism_same_inputs', () => {
    // Arrange — two runTick calls with identical inputs must produce identical output. (AC #16)
    const prevState: Readonly<WorldState> = {
      ...defaultWorldState(),
      catering_budget: 70,
      player_happiness: 65,
      sponsor_quality: 80,
    };

    // First call
    const ctx1 = makeCtx(1, prevState, () => 0, true);
    const result1 = runTick(ctx1, ALL_FIVE, prevState, [], EMPTY_BUFFER);

    // Second call — identical inputs
    const ctx2 = makeCtx(1, prevState, () => 0, true);
    const result2 = runTick(ctx2, ALL_FIVE, prevState, [], EMPTY_BUFFER);

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

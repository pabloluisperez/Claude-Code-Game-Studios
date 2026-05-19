/**
 * Tests for runTick() skeleton — CASCADE-ENGINE-004.
 *
 * Covers all 9 Acceptance Criteria:
 *   AC #1  pure-function contract (determinism + prevState immutability)
 *   AC #2  additive decision composition
 *   AC #3  clamping applied to final accumulated delta, not per-delta
 *   AC #4  clamp prevents exceeding max
 *   AC #5  clamp prevents going below min
 *   AC #6  Step 1 consumes delayed effects due this week
 *   AC #7  Step 1 carries forward effects not yet due
 *   AC #8  Readonly<WorldState> — prevState mutation fails at compile time
 *   AC #9  log ordering — Step 1 entries precede Step 2 entries
 *
 * Naming convention: test_[system]_[scenario]_[expected_result]
 * Story: CASCADE-ENGINE-004
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { runTick, clampToRange } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  NODE_RANGES,
  type SimContext,
  type PlayerDecision,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffect, DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

// ── Test fixtures ──────────────────────────────────────────────────────────────

/** Minimal SimContext factory. rng returns 0 — Steps 1/3/4 don't use rng. */
function makeCtx(currentWeek: number, hasMatchThisWeek = false): SimContext {
  const prevState = defaultWorldState();
  return {
    rng: () => 0,
    currentWeek,
    hasMatchThisWeek,
    prevState,
  };
}

/** Empty graph — evaluateEdges stub returns nothing. */
const EMPTY_GRAPH = [] as const;

/** Empty decisions list. */
const NO_DECISIONS: readonly PlayerDecision[] = [];

/** Empty delayed-effects buffer. */
const EMPTY_BUFFER: DelayedEffectsBuffer = [];

// ── clampToRange unit tests ────────────────────────────────────────────────────

describe('clampToRange', () => {
  it('test_clamp_value_within_range_returns_value', () => {
    expect(clampToRange(50, 0, 100)).toBe(50);
  });

  it('test_clamp_value_below_min_returns_min', () => {
    expect(clampToRange(-5, 0, 100)).toBe(0);
  });

  it('test_clamp_value_above_max_returns_max', () => {
    expect(clampToRange(110, 0, 100)).toBe(100);
  });

  it('test_clamp_value_at_boundary_min_returns_min', () => {
    expect(clampToRange(0, 0, 100)).toBe(0);
  });

  it('test_clamp_value_at_boundary_max_returns_max', () => {
    expect(clampToRange(100, 0, 100)).toBe(100);
  });
});

// ── AC #1: Pure-function contract ─────────────────────────────────────────────

describe('AC #1 — pure-function contract', () => {
  it('test_runtick_same_inputs_produce_deepequal_results', () => {
    const ctx = makeCtx(1);
    const prevState = defaultWorldState();

    const result1 = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);
    const result2 = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);

    expect(result1.nextState).toEqual(result2.nextState);
    expect(result1.log).toEqual(result2.log);
    expect(result1.newDelayedEffects).toEqual(result2.newDelayedEffects);
    expect(result1.thresholdCrossings).toEqual(result2.thresholdCrossings);
    expect(result1.week).toBe(result2.week);
  });

  it('test_runtick_does_not_mutate_prevstate', () => {
    const ctx = makeCtx(1);
    const prevState = defaultWorldState();
    // Snapshot all values before the call
    const snapshot = { ...prevState };

    runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);

    // Every key must be identical to the pre-call snapshot
    for (const key of Object.keys(snapshot) as Array<keyof typeof snapshot>) {
      expect(prevState[key]).toBe(snapshot[key]);
    }
  });
});

// ── AC #2: Additive decision composition ──────────────────────────────────────

describe('AC #2 — additive decision composition', () => {
  it('test_runtick_additive_decisions_sum_to_expected', () => {
    const ctx = makeCtx(1);
    // team_fitness default is 70 per NODE_RANGES
    const prevState = { ...defaultWorldState(), team_fitness: 70 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'team_fitness', delta: +3, source: 'test' },
      { nodeId: 'team_fitness', delta: +2, source: 'test' },
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);

    // 70 + 3 + 2 = 75, within [0, 100]
    expect(result.nextState.team_fitness).toBe(75);
  });
});

// ── AC #3: Clamping applied to final accumulated delta, not per-delta ─────────

describe('AC #3 — clamping applied to final accumulated delta', () => {
  it('test_runtick_clamping_applied_to_final_accumulated_delta', () => {
    const ctx = makeCtx(1);
    const prevState = { ...defaultWorldState(), fan_momentum: 98 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'fan_momentum', delta: +2.7, source: 't' },
      { nodeId: 'fan_momentum', delta: +0.55, source: 't' },
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);

    // 98 + 2.7 + 0.55 = 101.25, clamped to max 100
    // Note: per-delta clamping also gives 100 here (100.7→100, then +0.55→100).
    // See the discriminant test below for a case that uniquely proves single-clamp.
    expect(result.nextState.fan_momentum).toBe(NODE_RANGES.fan_momentum.max); // 100
  });

  it('test_runtick_single_clamp_distinguishes_from_per_delta_clamping', () => {
    // Discriminant case: base=95, +10, -8
    //   Final-clamp (correct): 95+10+(-8) = 97
    //   Per-delta (wrong):     clamp(95+10)=100, then 100+(-8) = 92
    // This test uniquely proves clamping is applied to the final sum, not per-edge.
    const ctx = makeCtx(1);
    const prevState = { ...defaultWorldState(), fan_momentum: 95 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'fan_momentum', delta: +10, source: 't' },
      { nodeId: 'fan_momentum', delta: -8, source: 't' },
    ];
    const result = runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);
    expect(result.nextState.fan_momentum).toBe(97);
  });
});

// ── AC #4: Clamp prevents exceeding max ───────────────────────────────────────

describe('AC #4 — clamp at max', () => {
  it('test_runtick_clamp_prevents_exceeding_max', () => {
    const ctx = makeCtx(1);
    const prevState = { ...defaultWorldState(), fan_momentum: 99 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'fan_momentum', delta: +5, source: 'test' },
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);

    expect(result.nextState.fan_momentum).toBe(NODE_RANGES.fan_momentum.max); // 100
  });
});

// ── AC #5: Clamp prevents going below min ────────────────────────────────────

describe('AC #5 — clamp at min', () => {
  it('test_runtick_clamp_prevents_going_below_min', () => {
    const ctx = makeCtx(1);
    const prevState = { ...defaultWorldState(), team_fitness: 1 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'team_fitness', delta: -10, source: 'test' },
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);

    expect(result.nextState.team_fitness).toBe(NODE_RANGES.team_fitness.min); // 0
  });
});

// ── AC #6: Step 1 consumes delayed effect due this week ───────────────────────

describe('AC #6 — Step 1 consumes delayed effect due this week', () => {
  it('test_runtick_step1_consumes_delayed_effect_due_this_week', () => {
    const ctx = makeCtx(5);
    const prevState = defaultWorldState();
    const fieldQualityDefault = NODE_RANGES.field_quality.default; // 50

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 5, toNode: 'field_quality', delta: 9, edgeId: 'C1a' } satisfies DelayedEffect,
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, buffer);

    // field_quality should be clamped(50 + 9, 0, 100) = 59
    const expectedFieldQuality = clampToRange(
      fieldQualityDefault + 9,
      NODE_RANGES.field_quality.min,
      NODE_RANGES.field_quality.max,
    );
    expect(result.nextState.field_quality).toBe(expectedFieldQuality);

    // The effect with edgeId 'C1a' must NOT be in newDelayedEffects (it was consumed)
    const stillPending = result.newDelayedEffects.some((e) => e.edgeId === 'C1a');
    expect(stillPending).toBe(false);
  });
});

// ── AC #7: Step 1 carries forward effects not yet due ────────────────────────

describe('AC #7 — Step 1 carries forward not-yet-due effects', () => {
  it('test_runtick_step1_carries_forward_not_yet_due_effect', () => {
    const ctx = makeCtx(3); // week 3 — effect is due at week 5
    const prevState = defaultWorldState();
    const fieldQualityDefault = NODE_RANGES.field_quality.default; // 50

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 5, toNode: 'field_quality', delta: 9, edgeId: 'C1a' } satisfies DelayedEffect,
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, buffer);

    // Delta was NOT applied — field_quality stays at default
    expect(result.nextState.field_quality).toBe(fieldQualityDefault);

    // The effect must still be present in newDelayedEffects
    const stillPending = result.newDelayedEffects.some((e) => e.edgeId === 'C1a');
    expect(stillPending).toBe(true);
  });
});

// ── AC #8: TypeScript readonly — prevState immutability ───────────────────────

describe('AC #8 — prevState Readonly<WorldState> immutability', () => {
  it('test_runtick_prevstate_readonly_enforced_by_type_system', () => {
    /**
     * Structural test for the runtime guarantee of prevState immutability.
     *
     * The TypeScript type `Readonly<WorldState>` on SimContext.prevState means
     * any attempt to write `ctx.prevState.team_fitness = 99` will fail to compile.
     * This test verifies the runtime side: prevState values are unchanged after
     * runTick() completes, confirming no implementation bypasses the type constraint
     * at runtime (e.g., via bracket notation or `as unknown as` casts).
     */
    const ctx = makeCtx(1);
    const prevState = defaultWorldState();
    const teamFitnessBefore = prevState.team_fitness;

    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'team_fitness', delta: +15, source: 'mutation-probe' },
    ];

    runTick(ctx, EMPTY_GRAPH, prevState, decisions, EMPTY_BUFFER);

    // prevState must not have been modified
    expect(prevState.team_fitness).toBe(teamFitnessBefore);
    // While nextState carries the delta
    // (verified separately in AC #2 — this test is purely about prevState safety)
  });
});

// ── AC #9: Log ordering — Step 1 entries precede Step 2 entries ───────────────

describe('AC #9 — log ordering', () => {
  it('test_runtick_log_entries_ordered_step1_before_step2', () => {
    const ctx = makeCtx(10);
    const prevState = defaultWorldState();

    // One buffer effect producing a Step 1 log entry
    const buffer: DelayedEffectsBuffer = [
      { applyAt: 10, toNode: 'field_quality', delta: 5, edgeId: 'STEP1-ANCHOR' } satisfies DelayedEffect,
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, buffer);

    // With empty graph (Step 2 stub returns no logs), we have exactly one log entry
    expect(result.log.length).toBeGreaterThanOrEqual(1);

    // The first log entry must be from the delayed effect (Step 1)
    expect(result.log[0]!.edgeId).toBe('STEP1-ANCHOR');

    // Step 2 ordering will be fully verified in CASCADE-ENGINE-005.
    // This test establishes the Step 1 anchor position.
  });

  it('test_runtick_log_entry_contains_correct_fields', () => {
    const ctx = makeCtx(7);
    const prevState = defaultWorldState();

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 7, toNode: 'staff_morale', delta: -4, edgeId: 'C9a-test' } satisfies DelayedEffect,
    ];

    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, buffer);

    expect(result.log.length).toBe(1);
    expect(result.log[0]).toEqual({
      edgeId: 'C9a-test',
      nodeId: 'staff_morale',
      delta: -4,
      week: 7,
    });
  });
});

// ── Additional: TickResult structure ──────────────────────────────────────────

describe('TickResult structure', () => {
  it('test_runtick_returns_correct_week', () => {
    const ctx = makeCtx(42);
    const prevState = defaultWorldState();
    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);
    expect(result.week).toBe(42);
  });

  it('test_runtick_threshold_crossings_stub_is_empty_array', () => {
    const ctx = makeCtx(1);
    const prevState = defaultWorldState();
    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);
    expect(result.thresholdCrossings).toEqual([]);
  });

  it('test_runtick_empty_inputs_produce_state_equal_to_defaults', () => {
    const ctx = makeCtx(1);
    const prevState = defaultWorldState();
    const result = runTick(ctx, EMPTY_GRAPH, prevState, NO_DECISIONS, EMPTY_BUFFER);
    // With no decisions and no buffer effects, nextState mirrors prevState values
    expect(result.nextState).toEqual(prevState);
  });
});

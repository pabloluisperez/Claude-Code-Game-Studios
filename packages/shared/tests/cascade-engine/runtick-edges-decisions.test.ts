/**
 * Tests for runTick() Steps 2 (Edge Evaluation) + Step 3 (PlayerDecisions).
 *
 * Covers all 8 Acceptance Criteria:
 *   AC #1  edges read prevState, NOT the decision-modified deltaMap
 *   AC #2  delayed effects capture prevState value, not decision-modified value
 *   AC #3  consecutive_wins increments correctly via decisions
 *   AC #4  consecutive_wins resets to zero on a loss via decisions
 *   AC #5  guarded edge does NOT call transferFn; logs source:'guarded'
 *   AC #6  delay:2 edge enqueues to correct applyAt = currentWeek + 2
 *   AC #7  edge ordering independence — prevState reads prove Rule 3 compliance
 *   AC #8  log completeness — all four source types recorded per tick
 *
 * Naming convention: test_[system]_[scenario]_[expected_result]
 * Story: CASCADE-ENGINE-005
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { runTick } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  type SimContext,
  type PlayerDecision,
  type WorldState,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffect, DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';
import type { CascadeEdgeDef } from '../../src/sim/cascade-graph.js';

// ── Test fixtures ──────────────────────────────────────────────────────────────

/**
 * Minimal SimContext factory.
 * prevState is passed explicitly so the ctx.prevState matches the runTick prevState
 * argument — required for AC #1/#2 edge reads to be consistent.
 */
function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  hasMatchThisWeek = false,
): SimContext {
  return { rng: () => 0, currentWeek, hasMatchThisWeek, prevState };
}

/** Empty delayed-effects buffer. */
const EMPTY_BUFFER: DelayedEffectsBuffer = [];

// ── AC #1: Edges read prevState, NOT the decision-modified deltaMap ───────────

describe('AC #1 — edges read prevState not decision-modified state', () => {
  it('test_runtick_edge_reads_prevstate_not_decision_modified_state', () => {
    // Arrange
    const prevState: WorldState = { ...defaultWorldState(), groundskeeper_budget: 50, field_quality: 50 };
    const ctx = makeCtx(1, prevState);

    // Edge reads groundskeeper_budget from prevState (=50); delta = (50-50)*0.3 = 0
    const edge: CascadeEdgeDef = {
      id: 'C1a-test',
      fromNode: 'groundskeeper_budget',
      toNode: 'field_quality',
      delay: 0,
      counterintuitive: false,
      transferFn: (prev) => (prev.groundskeeper_budget - 50) * 0.3,
    };

    // Decision bumps groundskeeper_budget by +30 — if edge wrongly reads
    // the accumulated delta it would see 80 and return delta=9, not 0.
    const decision: PlayerDecision = { nodeId: 'groundskeeper_budget', delta: +30, source: 'ui' };

    // Act
    const result = runTick(ctx, [edge], prevState, [decision], EMPTY_BUFFER);

    // Assert — edge delta must be 0 (read prevState=50, not 80)
    const edgeLog = result.log.find((e) => e.source === 'edge' && e.edgeId === 'C1a-test');
    expect(edgeLog).toBeDefined();
    expect(edgeLog!.delta).toBe(0);

    // Decision was applied: groundskeeper_budget = 50 + 30 = 80
    expect(result.nextState.groundskeeper_budget).toBe(80);
  });
});

// ── AC #2: Delayed effects capture prevState, not decision-modified value ─────

describe('AC #2 — delayed effects capture prevState value before decision', () => {
  it('test_runtick_delayed_effect_captures_prevstate_value_before_decision', () => {
    // Arrange
    const prevState: WorldState = { ...defaultWorldState(), ticket_price_index: 80, fan_momentum: 50 };
    const ctx = makeCtx(1, prevState);

    // C15-like edge: delay:2, reads ticket_price_index=80 → delta = -(80-50)*0.12 = -3.6
    const edge: CascadeEdgeDef = {
      id: 'C15-test',
      fromNode: 'ticket_price_index',
      toNode: 'fan_momentum',
      delay: 2,
      counterintuitive: true,
      transferFn: (prev) => -(prev.ticket_price_index - 50) * 0.12,
    };

    // Decision reduces ticket_price_index by 40 → nextState.ticket_price_index = 40
    const decision: PlayerDecision = { nodeId: 'ticket_price_index', delta: -40, source: 'ui' };

    // Act
    const result = runTick(ctx, [edge], prevState, [decision], EMPTY_BUFFER);

    // Assert — delayed effect must carry delta from prevState=80, not nextState=40
    expect(result.newDelayedEffects).toHaveLength(1);
    expect(result.newDelayedEffects[0]!.delta).toBeCloseTo(-3.6, 10);
    expect(result.newDelayedEffects[0]!.edgeId).toBe('C15-test');

    // Decision was applied: ticket_price_index = 80 - 40 = 40
    expect(result.nextState.ticket_price_index).toBe(40);
  });
});

// ── AC #3: Consecutive wins increments correctly ──────────────────────────────

describe('AC #3 — consecutive wins increments correctly', () => {
  it('test_runtick_consecutive_wins_increments_correctly', () => {
    // Arrange
    const prevState: WorldState = { ...defaultWorldState(), consecutive_wins: 3, consecutive_losses: 0 };
    const ctx = makeCtx(1, prevState);

    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'consecutive_wins', delta: +1, source: 'win' },
      { nodeId: 'consecutive_losses', delta: 0, source: 'win-reset' },
    ];

    // Act
    const result = runTick(ctx, [], prevState, decisions, EMPTY_BUFFER);

    // Assert
    expect(result.nextState.consecutive_wins).toBe(4);
    expect(result.nextState.consecutive_losses).toBe(0);
  });
});

// ── AC #4: Loss resets consecutive wins to zero ───────────────────────────────

describe('AC #4 — loss resets consecutive wins to zero', () => {
  it('test_runtick_loss_resets_consecutive_wins_to_zero', () => {
    // Arrange
    const prevState: WorldState = { ...defaultWorldState(), consecutive_wins: 2, consecutive_losses: 0 };
    const ctx = makeCtx(1, prevState);

    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'consecutive_wins', delta: -2, source: 'loss-reset' },
      { nodeId: 'consecutive_losses', delta: +1, source: 'loss' },
    ];

    // Act
    const result = runTick(ctx, [], prevState, decisions, EMPTY_BUFFER);

    // Assert
    expect(result.nextState.consecutive_wins).toBe(0);
    expect(result.nextState.consecutive_losses).toBe(1);
  });
});

// ── AC #5: Guarded edge — transferFn not called, logs source:'guarded' ────────

describe('AC #5 — guarded edge does not call transferFn', () => {
  it('test_runtick_guarded_edge_transferfn_not_called_and_logged', () => {
    // Arrange
    const prevState: WorldState = defaultWorldState();
    const ctx = makeCtx(1, prevState);

    let callCount = 0;
    const guardedEdge: CascadeEdgeDef = {
      id: 'always-guarded',
      fromNode: 'team_fitness',
      toNode: 'team_fitness',
      delay: 0,
      counterintuitive: false,
      guardFn: () => false,
      transferFn: (_prev, _ctx) => { callCount++; return 99; },
    };

    // Act
    const result = runTick(ctx, [guardedEdge], prevState, [], EMPTY_BUFFER);

    // Assert — transferFn must NOT have been called
    expect(callCount).toBe(0);

    // Log must contain a 'guarded' entry
    const guardedLog = result.log.find((e) => e.source === 'guarded' && e.edgeId === 'always-guarded');
    expect(guardedLog).toBeDefined();
    expect(guardedLog!.delta).toBe(0);

    // team_fitness must be unchanged (no delta applied)
    expect(result.nextState.team_fitness).toBe(prevState.team_fitness);
  });
});

// ── AC #6: delay:2 edge enqueues to applyAt = currentWeek + 2 ────────────────

describe('AC #6 — delay:2 edge enqueues to correct applyAt', () => {
  it('test_runtick_delay2_edge_enqueues_to_correct_applyAt', () => {
    // Arrange
    const prevState: WorldState = defaultWorldState();
    const ctx = makeCtx(3, prevState); // week 3

    const delayedEdge: CascadeEdgeDef = {
      id: 'delay2-edge',
      fromNode: 'fan_momentum',
      toNode: 'fan_attendance',
      delay: 2,
      counterintuitive: false,
      transferFn: () => 5,
    };

    // Act
    const result = runTick(ctx, [delayedEdge], prevState, [], EMPTY_BUFFER);

    // Assert — applyAt = 3 + 2 = 5
    expect(result.newDelayedEffects).toHaveLength(1);
    expect(result.newDelayedEffects[0]!.applyAt).toBe(5);
    expect(result.newDelayedEffects[0]!.edgeId).toBe('delay2-edge');
  });
});

// ── AC #7: Edge ordering independence proves Rule 3 (prevState reads) ─────────

describe('AC #7 — edge ordering independence proves ADR-003 Rule 3', () => {
  it('test_runtick_edge_ordering_independence_proves_rule3', () => {
    // Discriminant setup: edgeA WRITES to staff_morale; edgeB READS from staff_morale.
    //
    // With CORRECT impl (prevState reads):
    //   edgeA: reads team_fitness=70 → delta=0.7 → staff_morale deltaMap += 0.7
    //   edgeB: reads staff_morale from PREVSTATE=60 → delta=6 (regardless of order)
    //
    // With WRONG impl (passing accumulated state to transferFn):
    //   Order [A, B]: A fires, staff_morale accumulates 0.7; B reads staff_morale=60.7 → delta=6.07
    //   Order [B, A]: B fires first, staff_morale=60 → delta=6; A fires after → same 0.7
    //   Results DIFFER — this test catches the bug.
    const prevState: WorldState = { ...defaultWorldState(), team_fitness: 70, staff_morale: 60 };
    const ctx = makeCtx(1, prevState);

    const edgeA: CascadeEdgeDef = {
      id: 'A',
      fromNode: 'team_fitness',
      toNode: 'staff_morale',    // WRITES to staff_morale
      delay: 0,
      counterintuitive: false,
      transferFn: (prev) => prev.team_fitness * 0.01,
    };

    const edgeB: CascadeEdgeDef = {
      id: 'B',
      fromNode: 'staff_morale',  // READS from staff_morale (same node edgeA writes to)
      toNode: 'player_happiness',
      delay: 0,
      counterintuitive: false,
      transferFn: (prev) => prev.staff_morale * 0.1,  // reads staff_morale — must be prevState=60
    };

    // Act — forward order [A then B]
    const resultFwd = runTick(ctx, [edgeA, edgeB], prevState, [], EMPTY_BUFFER);
    // Act — reversed order [B then A]
    const resultRev = runTick(ctx, [edgeB, edgeA], prevState, [], EMPTY_BUFFER);

    // Assert — both reads from prevState → identical nextState regardless of order.
    // A wrong implementation would give player_happiness 6.07 in [A,B] order vs 6.0 in [B,A].
    expect(resultFwd.nextState).toEqual(resultRev.nextState);

    // Additionally verify edgeB's delta is based on prevState.staff_morale=60, not 60.7
    const edgeBLog = resultFwd.log.find((e) => e.source === 'edge' && e.edgeId === 'B');
    expect(edgeBLog).toBeDefined();
    expect(edgeBLog!.delta).toBeCloseTo(60 * 0.1, 10); // 6.0, not 6.07
  });
});

// ── AC #8: Log completeness — all four source types per tick ──────────────────

describe('AC #8 — log completeness counts all entry types', () => {
  it('test_runtick_log_completeness_counts_all_entry_types', () => {
    // Arrange:
    //   K=1 delayed effect consumed (Step 1)
    //   G=1 guarded edge       (Step 2, blocked)
    //   N=1 non-guarded immediate edge (Step 2, fires)
    //   M=1 player decision    (Step 3)
    // Expected total: 4 log entries, one of each source type.

    const prevState: WorldState = { ...defaultWorldState(), fan_momentum: 60, staff_morale: 60 };
    const ctx = makeCtx(5, prevState);

    const guardedEdge: CascadeEdgeDef = {
      id: 'guarded-edge',
      fromNode: 'fan_momentum',
      toNode: 'fan_attendance',
      delay: 0,
      counterintuitive: false,
      guardFn: () => false,
      transferFn: () => 99,
    };

    const immediateEdge: CascadeEdgeDef = {
      id: 'immediate-edge',
      fromNode: 'staff_morale',
      toNode: 'player_happiness',
      delay: 0,
      counterintuitive: false,
      transferFn: () => 3,
    };

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 5, toNode: 'team_fitness', delta: 2, edgeId: 'buffered-edge' } satisfies DelayedEffect,
    ];

    const decision: PlayerDecision = { nodeId: 'scouting_budget', delta: +5, source: 'ui' };

    // Act
    const result = runTick(ctx, [guardedEdge, immediateEdge], prevState, [decision], buffer);

    // Assert — exactly 4 log entries
    expect(result.log).toHaveLength(4);

    // Each source type must appear exactly once
    const sources = result.log.map((e) => e.source);
    expect(sources.filter((s) => s === 'delayed')).toHaveLength(1);
    expect(sources.filter((s) => s === 'guarded')).toHaveLength(1);
    expect(sources.filter((s) => s === 'edge')).toHaveLength(1);
    expect(sources.filter((s) => s === 'decision')).toHaveLength(1);
  });

  it('test_runtick_log_source_discriminators_match_expected_values', () => {
    // Verify each source type carries the correct discriminator literal.
    const prevState: WorldState = defaultWorldState();
    const ctx = makeCtx(2, prevState);

    const edge: CascadeEdgeDef = {
      id: 'disc-edge',
      fromNode: 'team_fitness',
      toNode: 'staff_morale',
      delay: 0,
      counterintuitive: false,
      transferFn: () => 1,
    };

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 2, toNode: 'field_quality', delta: 1, edgeId: 'disc-delayed' } satisfies DelayedEffect,
    ];

    const decision: PlayerDecision = { nodeId: 'training_intensity', delta: 1, source: 'disc-decision' };

    const result = runTick(ctx, [edge], prevState, [decision], buffer);

    const delayed = result.log.find((e) => e.edgeId === 'disc-delayed');
    const edgeEntry = result.log.find((e) => e.edgeId === 'disc-edge');
    const decisionEntry = result.log.find((e) => e.source === 'decision');

    expect(delayed?.source).toBe('delayed');
    expect(edgeEntry?.source).toBe('edge');
    expect(decisionEntry?.source).toBe('decision');
    expect(decisionEntry?.edgeId).toBe('disc-decision');
  });
});

// ── Additional: CascadeLog 'edge' entry optional fields ───────────────────────

describe('CascadeLog edge entry — optional fields populated', () => {
  it('test_runtick_edge_log_includes_fromNode_fromValue_delay', () => {
    // Arrange
    const prevState: WorldState = { ...defaultWorldState(), groundskeeper_budget: 75 };
    const ctx = makeCtx(1, prevState);

    const edge: CascadeEdgeDef = {
      id: 'optional-fields-edge',
      fromNode: 'groundskeeper_budget',
      toNode: 'field_quality',
      delay: 0,
      counterintuitive: false,
      transferFn: (prev) => (prev.groundskeeper_budget - 50) * 0.1,
    };

    // Act
    const result = runTick(ctx, [edge], prevState, [], EMPTY_BUFFER);

    const edgeLog = result.log.find((e) => e.source === 'edge' && e.edgeId === 'optional-fields-edge');
    expect(edgeLog).toBeDefined();
    expect(edgeLog!.fromNode).toBe('groundskeeper_budget');
    expect(edgeLog!.fromValue).toBe(75);
    expect(edgeLog!.delay).toBe(0);
  });

  it('test_runtick_delayed_log_entry_has_no_fromNode', () => {
    // 'delayed' source entries don't carry fromNode/fromValue — they're from prior ticks
    const prevState: WorldState = defaultWorldState();
    const ctx = makeCtx(4, prevState);

    const buffer: DelayedEffectsBuffer = [
      { applyAt: 4, toNode: 'staff_morale', delta: 2, edgeId: 'prior-edge' } satisfies DelayedEffect,
    ];

    const result = runTick(ctx, [], prevState, [], buffer);

    const delayedLog = result.log.find((e) => e.source === 'delayed');
    expect(delayedLog).toBeDefined();
    expect(delayedLog!.fromNode).toBeUndefined();
    expect(delayedLog!.fromValue).toBeUndefined();
  });
});

// ── Guarded + delayed edge — guard must block newDelayedEffects enqueue ────────

describe('guarded delayed edge — guard prevents newDelayedEffects enqueue', () => {
  it('test_runtick_guarded_delay_edge_does_not_enqueue_delayed_effect', () => {
    // Arrange: edge with both delay>0 AND guardFn=false.
    // The guard should prevent the effect from being queued in newDelayedEffects.
    const prevState: WorldState = defaultWorldState();
    const ctx = makeCtx(3, prevState);

    const guardedDelayedEdge: CascadeEdgeDef = {
      id: 'guarded-delayed',
      fromNode: 'fan_momentum',
      toNode: 'fan_attendance',
      delay: 2,
      counterintuitive: false,
      guardFn: () => false,
      transferFn: () => 10,
    };

    // Act
    const result = runTick(ctx, [guardedDelayedEdge], prevState, [], EMPTY_BUFFER);

    // Assert — guard fired: newDelayedEffects must be empty (effect NOT enqueued)
    expect(result.newDelayedEffects).toHaveLength(0);

    // Log has 'guarded' entry, NOT 'edge'
    const guardedLog = result.log.find((e) => e.source === 'guarded' && e.edgeId === 'guarded-delayed');
    expect(guardedLog).toBeDefined();
    const edgeLog = result.log.find((e) => e.source === 'edge' && e.edgeId === 'guarded-delayed');
    expect(edgeLog).toBeUndefined();
  });
});

// ── AC #1 strengthened — non-zero base value ──────────────────────────────────

describe('AC #1 (strengthened) — edge reads correct prevState with non-zero delta', () => {
  it('test_runtick_edge_reads_prevstate_non_zero_delta_confirms_positive_path', () => {
    // Arrange: prevState.groundskeeper_budget=70, transferFn=(prev-50)*0.3 → delta=6
    // Decision bumps groundskeeper_budget by +20 (nextState=90).
    // Wrong impl reading decision-modified value: (90-50)*0.3 = 12 ≠ 6.
    const prevState: WorldState = { ...defaultWorldState(), groundskeeper_budget: 70, field_quality: 50 };
    const ctx = makeCtx(1, prevState);

    const edge: CascadeEdgeDef = {
      id: 'C1a-nonzero',
      fromNode: 'groundskeeper_budget',
      toNode: 'field_quality',
      delay: 0,
      counterintuitive: false,
      transferFn: (prev) => (prev.groundskeeper_budget - 50) * 0.3,
    };

    const decision: PlayerDecision = { nodeId: 'groundskeeper_budget', delta: +20, source: 'ui' };

    // Act
    const result = runTick(ctx, [edge], prevState, [decision], EMPTY_BUFFER);

    // Assert — edge delta must be 6 (read prevState=70, not decision-modified 90)
    const edgeLog = result.log.find((e) => e.source === 'edge' && e.edgeId === 'C1a-nonzero');
    expect(edgeLog).toBeDefined();
    expect(edgeLog!.delta).toBeCloseTo(6, 10);  // (70-50)*0.3=6, NOT (90-50)*0.3=12

    // Decision applied correctly
    expect(result.nextState.groundskeeper_budget).toBe(90);
  });
});

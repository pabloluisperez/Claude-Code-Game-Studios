/**
 * Unit tests for VAR resolution.
 *
 * Story: MATCH-SIM-010
 * Acceptance Criteria: AC-MATCH-06 (no pause), AC-MATCH-25 (goal overturn → goalCounts=false).
 * Test Evidence: packages/shared/tests/match-sim/var.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveVarReview } from '../../src/sim/sports/football/football-var.js';
import type { MatchEvent } from '../../src/sim/sports/football/football-types.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

function makeCtx(rngCalls: number[]): { ctx: SimContext; spy: ReturnType<typeof vi.fn> } {
  let i = 0;
  const spy = vi.fn(() => {
    const v = rngCalls[i] ?? 0.99;
    i += 1;
    return v;
  });
  const ctx: SimContext = {
    rng: spy,
    currentWeek: 1,
    hasMatchThisWeek: true,
    prevState: defaultWorldState(),
  };
  return { ctx, spy };
}

const goalEvent: MatchEvent = {
  type: 'goal',
  minute: 30,
  team: 'home',
  player_id: 'fwd-1',
  causal_node: null,
};
const redEvent: MatchEvent = {
  type: 'red_card',
  minute: 60,
  team: 'home',
  player_id: 'def-1',
  causal_node: null,
  reason: 'direct',
};

// ── Goal paths ────────────────────────────────────────────────────────────────

describe('VAR — goal trigger', () => {
  it('test_var_goal_no_review_keeps_original_one_rng_call', () => {
    // rng=0.99 → above P_VAR_REVIEW_GOAL=0.25 → no review
    const { ctx, spy } = makeCtx([0.99]);
    const result = resolveVarReview({ ctx, tick: 30, trigger: 'goal', triggerEvent: goalEvent });
    expect(result.resultingEvents).toEqual([goalEvent]);
    expect(result.goalCounts).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('test_var_goal_reviewed_confirmed_two_rng_calls', () => {
    // rng=[0.10, 0.99] → review fires (0.10 < 0.25), overturn fails (0.99 >= 0.35)
    const { ctx, spy } = makeCtx([0.1, 0.99]);
    const result = resolveVarReview({ ctx, tick: 30, trigger: 'goal', triggerEvent: goalEvent });
    expect(result.resultingEvents.length).toBe(2);
    expect(result.resultingEvents[0]).toEqual(goalEvent);
    expect(result.resultingEvents[1]!.type).toBe('var_review');
    expect(result.resultingEvents[1]!.reason).toBe('goal_confirmed');
    expect(result.goalCounts).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('test_var_goal_overturned_offside_three_rng_calls', () => {
    // rng=[0.10, 0.10, 0.30] → review + overturn + offside (0.30 < 0.5)
    const { ctx, spy } = makeCtx([0.1, 0.1, 0.3]);
    const result = resolveVarReview({ ctx, tick: 30, trigger: 'goal', triggerEvent: goalEvent });
    expect(result.resultingEvents.length).toBe(2);
    expect(result.resultingEvents[0]).toEqual(goalEvent);
    expect(result.resultingEvents[1]!.type).toBe('goal_disallowed');
    expect(result.resultingEvents[1]!.reason).toBe('offside');
    expect(result.goalCounts).toBe(false);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('test_var_goal_overturned_foul_when_reason_rng_high', () => {
    const { ctx } = makeCtx([0.1, 0.1, 0.8]);
    const result = resolveVarReview({ ctx, tick: 30, trigger: 'goal', triggerEvent: goalEvent });
    expect(result.resultingEvents[1]!.reason).toBe('foul');
    expect(result.goalCounts).toBe(false);
  });
});

// ── Red paths ─────────────────────────────────────────────────────────────────

describe('VAR — red_card trigger', () => {
  it('test_var_red_no_review', () => {
    const { ctx, spy } = makeCtx([0.99]);
    const result = resolveVarReview({ ctx, tick: 60, trigger: 'red_card', triggerEvent: redEvent });
    expect(result.resultingEvents).toEqual([redEvent]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('test_var_red_reviewed_confirmed', () => {
    // rng=[0.10, 0.99] → review fires (< 0.30), confirmed (>= 0.35)
    const { ctx } = makeCtx([0.1, 0.99]);
    const result = resolveVarReview({ ctx, tick: 60, trigger: 'red_card', triggerEvent: redEvent });
    expect(result.resultingEvents.length).toBe(2);
    expect(result.resultingEvents[0]).toEqual(redEvent);
    expect(result.resultingEvents[1]!.type).toBe('var_review');
    expect(result.resultingEvents[1]!.reason).toBe('red_card_confirmed');
  });

  it('test_var_red_downgraded_original_replaced', () => {
    // rng=[0.10, 0.10] → review + overturn → red_downgraded REPLACES original
    const { ctx, spy } = makeCtx([0.1, 0.1]);
    const result = resolveVarReview({ ctx, tick: 60, trigger: 'red_card', triggerEvent: redEvent });
    expect(result.resultingEvents.length).toBe(1);
    expect(result.resultingEvents[0]!.type).toBe('red_downgraded');
    expect(result.resultingEvents[0]!.player_id).toBe('def-1');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ── Boundary tests ────────────────────────────────────────────────────────────

describe('VAR — review threshold boundaries', () => {
  it('test_var_goal_review_at_exact_threshold_does_not_fire', () => {
    // rng exactly = P_VAR_REVIEW_GOAL (0.25) → 0.25 < 0.25 is false → no review
    const { ctx } = makeCtx([0.25]);
    const result = resolveVarReview({ ctx, tick: 30, trigger: 'goal', triggerEvent: goalEvent });
    expect(result.resultingEvents).toEqual([goalEvent]);
  });

  it('test_var_red_review_at_exact_threshold_does_not_fire', () => {
    const { ctx } = makeCtx([0.3]);
    const result = resolveVarReview({ ctx, tick: 60, trigger: 'red_card', triggerEvent: redEvent });
    expect(result.resultingEvents).toEqual([redEvent]);
  });
});

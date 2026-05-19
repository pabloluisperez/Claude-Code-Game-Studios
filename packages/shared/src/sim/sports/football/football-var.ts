/**
 * VAR resolution — inline, non-pausing post-event review.
 *
 * Per AC-MATCH-06: VAR NEVER pauses the manager. The FSM stays in 'in_progress'
 * throughout. This module returns events only; it does not signal any
 * state-machine transition.
 *
 * Asymmetric event handling per GDD §Match Events §VAR inline:
 *   - GOAL: original event is KEPT in the array; if overturned, `goal_disallowed`
 *     is APPENDED and `goalCounts=false` flags the score-tally code.
 *   - RED: original event is REPLACED by `red_downgraded` (no red_card in array).
 *     The downgrade does NOT increment yellowCardsByPlayerId (a referee admitting
 *     a mistake shouldn't compound into a future second-yellow).
 *
 * RNG-call discipline:
 *   No review:          1 rng() call
 *   Review confirmed:   2 rng() calls
 *   Review overturned:  3 rng() calls (3rd is the reason for goal_disallowed)
 *
 * Story: MATCH-SIM-010
 * Control Manifest: 2026-05-19
 */

import type { MatchEvent } from './football-types.js';
import type { SimContext } from '../../cascade-types.js';
import {
  P_OVERTURN,
  P_OVERTURN_REASON_OFFSIDE,
  P_VAR_REVIEW_GOAL,
  P_VAR_REVIEW_RED,
} from './football-constants.js';

export type VarTrigger = 'goal' | 'red_card';

export interface VarReviewInput {
  readonly ctx: SimContext;
  readonly tick: number;
  readonly trigger: VarTrigger;
  readonly triggerEvent: MatchEvent;
}

export interface VarReviewResult {
  readonly resultingEvents: readonly MatchEvent[];
  /** False when a goal was overturned. Always true for red_card triggers. */
  readonly goalCounts: boolean;
}

/**
 * Resolve a single VAR review. The caller (story 013 — per-tick loop) invokes
 * this immediately after a goal or a direct red.
 *
 * AC-MATCH-25 contract: when `goalCounts === false`, the per-tick loop MUST
 * NOT increment the score. F8 post-match deltas (story 011) then compute
 * `mpi_delta` from the post-VAR score.
 */
export function resolveVarReview(input: VarReviewInput): VarReviewResult {
  const { ctx, tick, trigger, triggerEvent } = input;

  const reviewThreshold =
    trigger === 'goal' ? P_VAR_REVIEW_GOAL : P_VAR_REVIEW_RED;

  // (1) review roll
  if (ctx.rng() >= reviewThreshold) {
    // No review fires — quiet path
    return { resultingEvents: [triggerEvent], goalCounts: true };
  }

  // (2) overturn roll
  if (ctx.rng() >= P_OVERTURN) {
    // Reviewed but confirmed
    const varEvent: MatchEvent = {
      type: 'var_review',
      minute: tick,
      causal_node: null,
      reason: `${trigger}_confirmed`,
    };
    return {
      resultingEvents: [triggerEvent, varEvent],
      goalCounts: true,
    };
  }

  // Overturned path
  if (trigger === 'goal') {
    // (3) reason roll — offside vs foul (50/50)
    const reason = ctx.rng() < P_OVERTURN_REASON_OFFSIDE ? 'offside' : 'foul';
    const disallowed: MatchEvent = {
      type: 'goal_disallowed',
      minute: tick,
      team: triggerEvent.team,
      player_id: triggerEvent.player_id,
      causal_node: null,
      reason,
    };
    return {
      resultingEvents: [triggerEvent, disallowed],
      goalCounts: false,
    };
  }

  // red_card overturned → REPLACE original event with red_downgraded
  const downgraded: MatchEvent = {
    type: 'red_downgraded',
    minute: tick,
    team: triggerEvent.team,
    player_id: triggerEvent.player_id,
    causal_node: null,
  };
  return {
    resultingEvents: [downgraded],
    goalCounts: true, // not applicable for red; default true
  };
}

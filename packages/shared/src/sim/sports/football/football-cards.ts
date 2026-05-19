/**
 * Card detection state and resolution for the football match simulator.
 *
 * Single-call entry point: `resolveCardCheck` is invoked at every card-check
 * tick (15, 30, 45, 60, 75, 90) on which an attack-on-this-defender's-team
 * occurred. It rolls the yellow probability first, then the direct-red
 * probability if the yellow rolled negative. The rng() call count varies by
 * branch (1 or 2 calls) — this is acceptable because MatchSessionSnapshot
 * captures `prngState` at tick boundaries, not at sub-steps.
 *
 * Per AC-MATCH-22: a second yellow on the same player automatically emits a
 * red_card event with `reason='second_yellow'`.
 *
 * Story: MATCH-SIM-008
 * Control Manifest: 2026-05-19
 */

import type { MatchEvent, PlayerStats } from './football-types.js';
import type { SimContext } from '../../cascade-types.js';
import { pYellow } from './football-formulas.js';
import { P_RED_DIRECT } from './football-constants.js';

/** Input to a single card-check resolution. */
export interface CardCheckInput {
  readonly ctx: SimContext;
  readonly tick: number;
  readonly defender: Readonly<PlayerStats>;
  readonly defenderTeam: 'home' | 'away';
  /**
   * Map of player_id → current yellow count. Pass-by-reference safe:
   * `resolveCardCheck` returns an updated copy rather than mutating.
   */
  readonly yellowCardsByPlayerId: Readonly<Record<string, number>>;
}

/** Output of a single card-check resolution. */
export interface CardCheckResult {
  readonly events: readonly MatchEvent[];
  /** New Record (input is not mutated). */
  readonly updatedYellowCounts: Readonly<Record<string, number>>;
  /** True when the defender was sent off this check (red, or second yellow). */
  readonly playerSentOff: boolean;
}

/**
 * Resolve a single card check for the supplied defender at the supplied tick.
 *
 * RNG-call order (fixed for determinism):
 *   1. P_yellow roll  — `ctx.rng()`
 *   2. P_red_direct roll — `ctx.rng()` (ONLY if yellow rolled negative)
 *
 * Behavior:
 *   - yellow roll succeeds:
 *       increment yellowCardsByPlayerId[defender.id].
 *       If new count == 2 → emit [yellow_card, red_card{reason:'second_yellow'}]
 *                          and playerSentOff = true.
 *       Else → emit [yellow_card]; playerSentOff = false.
 *   - else, red_direct roll succeeds:
 *       emit [red_card{reason:'direct'}]; playerSentOff = true;
 *       yellow counts unchanged.
 *   - else:
 *       empty events; no state change.
 */
export function resolveCardCheck(input: CardCheckInput): CardCheckResult {
  const { ctx, tick, defender, defenderTeam, yellowCardsByPlayerId } = input;
  const pYellowVal = pYellow(defender, tick);

  const yellowRoll = ctx.rng();
  if (yellowRoll < pYellowVal) {
    // Yellow card path
    const prevCount = yellowCardsByPlayerId[defender.id] ?? 0;
    const newCount = prevCount + 1;
    const updatedYellowCounts = {
      ...yellowCardsByPlayerId,
      [defender.id]: newCount,
    };

    const yellowEvent: MatchEvent = {
      type: 'yellow_card',
      minute: tick,
      team: defenderTeam,
      player_id: defender.id,
      causal_node: null,
    };

    if (newCount >= 2) {
      // Second yellow → automatic red (AC-MATCH-22)
      const redEvent: MatchEvent = {
        type: 'red_card',
        minute: tick,
        team: defenderTeam,
        player_id: defender.id,
        causal_node: null,
        reason: 'second_yellow',
      };
      return {
        events: [yellowEvent, redEvent],
        updatedYellowCounts,
        playerSentOff: true,
      };
    }

    return {
      events: [yellowEvent],
      updatedYellowCounts,
      playerSentOff: false,
    };
  }

  // Yellow missed — try direct red
  const redRoll = ctx.rng();
  if (redRoll < P_RED_DIRECT) {
    const redEvent: MatchEvent = {
      type: 'red_card',
      minute: tick,
      team: defenderTeam,
      player_id: defender.id,
      causal_node: null,
      reason: 'direct',
    };
    return {
      events: [redEvent],
      updatedYellowCounts: yellowCardsByPlayerId,
      playerSentOff: true,
    };
  }

  // No card this check
  return {
    events: [],
    updatedYellowCounts: yellowCardsByPlayerId,
    playerSentOff: false,
  };
}

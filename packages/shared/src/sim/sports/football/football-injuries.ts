/**
 * Injury detection for the football match simulator.
 *
 * Per GDD step 6: injury checks fire at fixed ticks (45, 90) PLUS on any tick
 * with a goal or card. Per ADR-007 / GDD line 113, the rival team's
 * `injury_risk_ctx` is the constant `RIVAL_INJURY_RISK_CONST=50` — rivals do
 * NOT read the player's-club WorldState. The player's own team reads their
 * club's injury_risk from `PreMatchSnapshot`.
 *
 * Per AC-MATCH-28: EVERY emitted injury event has `causal_node: 'injury_risk'`
 * — unconditionally.
 *
 * Story: MATCH-SIM-009
 * Control Manifest: 2026-05-19
 */

import type {
  MatchEvent,
  PlayerStats,
  PreMatchSnapshot,
} from './football-types.js';
import type { SimContext } from '../../cascade-types.js';
import { effectiveFitness } from './football-formulas.js';
import {
  INJURY_CHECK_TICKS_FIXED,
  P_INJURY_BASE,
  P_INJURY_MAJOR_THRESHOLD,
  RIVAL_INJURY_RISK_CONST,
} from './football-constants.js';

/**
 * Resolve `injury_risk_ctx` for the player's team.
 *
 * @param playerTeam - which side of the pitch the player is playing for this match
 * @param playerClubSide - which side this player's club controls in this match
 * @param preMatchSnapshot - WorldState snapshot for the player's club
 */
export function getInjuryRiskCtx(
  playerTeam: 'home' | 'away',
  playerClubSide: 'home' | 'away',
  preMatchSnapshot: Readonly<PreMatchSnapshot>,
): number {
  return playerTeam === playerClubSide
    ? preMatchSnapshot.injury_risk
    : RIVAL_INJURY_RISK_CONST;
}

/**
 * P_injury — pure formula. Probability of an injury event for the given player
 * given the team's injury_risk_ctx and the current minute.
 *
 *   P_injury = (injury_risk_ctx/100) × P_INJURY_BASE × (1 − effectiveFitness(t)/100)
 *
 * Lower effective_fitness ⇒ higher P_injury (tired players get hurt). NaN-safe
 * because all factors are bounded products of finite ratios.
 */
export function pInjury(
  player: Readonly<PlayerStats>,
  injuryRiskCtx: number,
  t: number,
): number {
  const ef = effectiveFitness(player, t);
  return (injuryRiskCtx / 100) * P_INJURY_BASE * (1 - ef / 100);
}

/** Truth-table: when this tick should run an injury check. */
export function shouldRunInjuryCheck(
  tick: number,
  goalThisTick: boolean,
  cardThisTick: boolean,
): boolean {
  return goalThisTick || cardThisTick || INJURY_CHECK_TICKS_FIXED.includes(tick);
}

/** Input to a single injury-check resolution. */
export interface InjuryCheckInput {
  readonly ctx: SimContext;
  readonly tick: number;
  readonly player: Readonly<PlayerStats>;
  readonly playerTeam: 'home' | 'away';
  readonly playerClubSide: 'home' | 'away';
  readonly preMatchSnapshot: Readonly<PreMatchSnapshot>;
}

/** Output: a single optional MatchEvent. Caller decides what to do with it. */
export interface InjuryCheckResult {
  readonly event: MatchEvent | null;
}

/**
 * Resolve a single injury check. Two rng() calls when an injury fires (one
 * for P_injury, one for severity); one call otherwise. The fixed order
 * (P_injury → severity) is critical for determinism.
 *
 * Per AC-MATCH-28: emitted events have `causal_node: 'injury_risk'`.
 */
export function resolveInjuryCheck(input: InjuryCheckInput): InjuryCheckResult {
  const { ctx, tick, player, playerTeam, playerClubSide, preMatchSnapshot } = input;
  const injuryRiskCtx = getInjuryRiskCtx(playerTeam, playerClubSide, preMatchSnapshot);
  const p = pInjury(player, injuryRiskCtx, tick);

  if (ctx.rng() >= p) {
    return { event: null };
  }

  // Severity roll
  const severityRoll = ctx.rng();
  const severity = severityRoll < P_INJURY_MAJOR_THRESHOLD ? 'minor' : 'major';

  const event: MatchEvent = {
    type: 'injury',
    minute: tick,
    team: playerTeam,
    player_id: player.id,
    causal_node: 'injury_risk',
    reason: severity,
  };
  return { event };
}

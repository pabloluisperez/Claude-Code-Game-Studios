/**
 * F8 squad_available_pct + F9 team_skill + F9b player_happiness_delta.
 *
 * Per `design/gdd/player-management.md` and league-system.md Rule 8:
 *   - Denominator for F8 is `SQUAD_REGISTERED_SIZE = 25` (canonical constant).
 *   - F9 = round(mean(skill of starting 11)).
 *   - F9b = round(mean(morale of starting 11)) − prevState.player_happiness.
 *
 * All three are pushed as PlayerDecisions in Cascade Step 3 (additive deltas).
 *
 * Story: PLAYER-MANAGEMENT-006 (TR-PM-006)
 */

import type { NodeId, PlayerDecision } from '../cascade-types.js';

export const SQUAD_REGISTERED_SIZE = 25;
export const FORFEIT_SQUAD_PCT_THRESHOLD = 63;

/**
 * F8 — squad_available_pct uses the canonical SQUAD_REGISTERED_SIZE=25 denominator.
 * NOT the dynamic squad size — per league-system.md Rule 8.
 */
export function computeSquadAvailablePct(availableCount: number): number {
  return Math.round((availableCount / SQUAD_REGISTERED_SIZE) * 100);
}

export function squadPctTriggersForceit(pct: number): boolean {
  return pct <= FORFEIT_SQUAD_PCT_THRESHOLD;
}

/** F9 — mean skill of the starting 11. */
export function computeTeamSkill(startingElevenSkills: readonly number[]): number {
  if (startingElevenSkills.length === 0) return 20; // minimum clamp per edge case
  const sum = startingElevenSkills.reduce((a, b) => a + b, 0);
  return Math.round(sum / startingElevenSkills.length);
}

/**
 * F9b — player_happiness convergence delta.
 *   delta = round(mean(morale of starting 11)) − prevState.player_happiness
 * Can be positive, negative, or zero.
 */
export function computePlayerHappinessDelta(
  startingElevenMorale: readonly number[],
  prevPlayerHappiness: number,
): number {
  if (startingElevenMorale.length === 0) return 0;
  const meanMorale = Math.round(
    startingElevenMorale.reduce((a, b) => a + b, 0) / startingElevenMorale.length,
  );
  return meanMorale - prevPlayerHappiness;
}

export interface BuildDecisionsArgs {
  readonly availableCount: number;
  readonly startingElevenSkills: readonly number[];
  readonly startingElevenMorale: readonly number[];
  readonly prevPlayerHappiness: number;
  /** Previous WorldState values used to convert F8/F9 absolute values to deltas. */
  readonly prevSquadAvailablePct: number;
  readonly prevTeamSkill: number;
}

/**
 * Build the 3-entry PlayerDecision array for Cascade Step 3.
 * Each entry is an additive delta — Cascade clamps to NODE_RANGES at Step 4.
 */
export function buildWorldStateDecisions(args: BuildDecisionsArgs): PlayerDecision[] {
  const newSquadPct = computeSquadAvailablePct(args.availableCount);
  const newTeamSkill = computeTeamSkill(args.startingElevenSkills);
  const happinessDelta = computePlayerHappinessDelta(
    args.startingElevenMorale,
    args.prevPlayerHappiness,
  );
  const decisions: PlayerDecision[] = [
    {
      nodeId: 'squad_available_pct' satisfies NodeId,
      delta: newSquadPct - args.prevSquadAvailablePct,
      source: 'player_management_F8',
    },
    {
      nodeId: 'team_skill' satisfies NodeId,
      delta: newTeamSkill - args.prevTeamSkill,
      source: 'player_management_F9',
    },
    {
      nodeId: 'player_happiness' satisfies NodeId,
      delta: happinessDelta,
      source: 'player_management_F9b',
    },
  ];
  return decisions;
}

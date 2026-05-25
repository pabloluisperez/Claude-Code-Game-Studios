/**
 * F4: scout action cost (with Scout Director T3 discount).
 * Story SCOUTING-MARKET-003.
 */

import type { ScoutAction } from './types.js';

export const SCOUT_COST_EUR_K = 5;
export const DEEP_SCOUT_COST_EUR_K = 15;
export const SCOUT_DIRECTOR_T3_COST_DISCOUNT = 0.2;

export function scoutActionCost(
  actionType: ScoutAction,
  modifiers: { scoutDirectorT3?: boolean } = {},
): number {
  const base = actionType === 'scout' ? SCOUT_COST_EUR_K : DEEP_SCOUT_COST_EUR_K;
  const discount = modifiers.scoutDirectorT3 ? SCOUT_DIRECTOR_T3_COST_DISCOUNT : 0;
  return Math.round(base * (1 - discount));
}

/**
 * F4: scout action cost (with Scout Director T3 discount).
 * Story SCOUTING-MARKET-003.
 */

import type { ScoutAction } from './types.js';

export const SCOUT_COST_EUR_K = 5;
export const DEEP_SCOUT_COST_EUR_K = 15;
export const SCOUT_DIRECTOR_T3_COST_DISCOUNT = 0.2;

/**
 * City-tier scout cost multiplier (Pablo bug 2026-05-25: "5k/15k es demasiado
 * para un club de última división"). A T1 club pays 25% of base cost; full
 * cost only at T4 (Imperio Local).
 */
export const SCOUT_COST_CITY_TIER_MULTIPLIER: Record<1 | 2 | 3 | 4, number> = {
  1: 0.25, // Pueblo Olvidado — scout=1, deep_scout=4 (k€)
  2: 0.5,  // Club Emergente — scout=3, deep_scout=8
  3: 0.75, // Club Establecido — scout=4, deep_scout=11
  4: 1.0,  // Imperio Local — scout=5, deep_scout=15 (full GDD cost)
};

export function scoutActionCost(
  actionType: ScoutAction,
  modifiers: { scoutDirectorT3?: boolean; cityTier?: 1 | 2 | 3 | 4 } = {},
): number {
  const base = actionType === 'scout' ? SCOUT_COST_EUR_K : DEEP_SCOUT_COST_EUR_K;
  const tierMult =
    modifiers.cityTier !== undefined
      ? SCOUT_COST_CITY_TIER_MULTIPLIER[modifiers.cityTier]
      : 1.0;
  const directorDiscount = modifiers.scoutDirectorT3 ? SCOUT_DIRECTOR_T3_COST_DISCOUNT : 0;
  return Math.max(1, Math.round(base * tierMult * (1 - directorDiscount)));
}

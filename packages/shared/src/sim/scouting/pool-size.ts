/**
 * F5: pool visibility size — how many AI-club players show in the scouting
 * pool based on the manager's scouting_network_level (1..5).
 *
 * Story SCOUTING-MARKET-002. Per scouting-market.md §4 F5.
 */

import type { PoolVisibility } from './types.js';

export const AI_PLAYERS_CURRENT_DIV_BASE = 30;
export const AI_PLAYERS_CURRENT_DIV_PER_LEVEL = 5;
export const AI_PLAYERS_OTHER_DIV_BASE = 10;
export const AI_PLAYERS_OTHER_DIV_PER_LEVEL = 3;

export function poolVisibilitySize(scoutingNetworkLevel: number): PoolVisibility {
  const lvl = Math.max(1, Math.min(5, Math.floor(scoutingNetworkLevel)));
  const aiCurrentDiv = AI_PLAYERS_CURRENT_DIV_BASE + lvl * AI_PLAYERS_CURRENT_DIV_PER_LEVEL;
  const aiOtherDiv = AI_PLAYERS_OTHER_DIV_BASE + lvl * AI_PLAYERS_OTHER_DIV_PER_LEVEL;
  return {
    freeAgents: 'ALL',
    aiCurrentDiv,
    aiOtherDiv,
    total: `ALL_FREE + ${aiCurrentDiv + aiOtherDiv}`,
  };
}

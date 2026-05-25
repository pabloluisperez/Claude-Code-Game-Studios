/**
 * F1: per-player visibility tier (0..3). Server-authoritative.
 * Story SCOUTING-MARKET-002. Per ADR-031 §D6.
 *
 * Tier ladder:
 *   T0: player not in this window's pool → only id+name visible
 *   T1: in pool, no scout done → coarse bands
 *   T2: scouted → estimates
 *   T3: deep-scouted + Scout Director ≥ T2 + delay elapsed → exact values
 */

import type { ManagerScoutState, VisibilityTier } from './types.js';

export const T3_DELAY_WEEKS = 1;
export const T3_SCOUT_DIRECTOR_THRESHOLD_TIER = 2;

export function visibilityTierOf(
  player: { id: string; inPoolThisWindow: boolean },
  manager: ManagerScoutState,
  currentWeek: number,
): VisibilityTier {
  if (!player.inPoolThisWindow) return 0;
  if (!manager.hasScouted(player.id)) return 1;
  if (!manager.hasDeepScouted(player.id)) return 2;
  if (manager.scoutDirectorTier < T3_SCOUT_DIRECTOR_THRESHOLD_TIER) return 2;
  const deepDoneAt = manager.deepScoutCompletedAtWeek(player.id);
  if (deepDoneAt === null) return 2;
  if (currentWeek - deepDoneAt < T3_DELAY_WEEKS) return 2;
  return 3;
}

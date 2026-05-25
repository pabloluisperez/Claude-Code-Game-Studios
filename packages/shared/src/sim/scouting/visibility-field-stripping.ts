/**
 * Server-side field stripping for player data based on visibility tier.
 * The frontend MUST NEVER receive higher-tier fields than the player's
 * current tier — this is the cheat-prevention invariant per ADR-031 §D6.
 *
 * Story SCOUTING-MARKET-002.
 */

import type { PoolPlayer, VisibilityTier } from './types.js';

export function stripFieldsForTier(player: PoolPlayer, tier: VisibilityTier): PoolPlayer {
  const stripped: PoolPlayer = {
    id: player.id,
    name: player.name,
    age: player.age,
    position: player.position,
    currentClub: player.currentClub,
    contractStatus: player.contractStatus,
    visibilityTier: tier,
  };
  if (tier >= 1) {
    if (player.ovrBand !== undefined) stripped.ovrBand = player.ovrBand;
    if (player.transferValueBand !== undefined) stripped.transferValueBand = player.transferValueBand;
  }
  if (tier >= 2) {
    if (player.ovrEstimate !== undefined) stripped.ovrEstimate = player.ovrEstimate;
    if (player.transferValueEstimate !== undefined) stripped.transferValueEstimate = player.transferValueEstimate;
    if (player.moraleBand !== undefined) stripped.moraleBand = player.moraleBand;
  }
  if (tier >= 3) {
    if (player.ovrExact !== undefined) stripped.ovrExact = player.ovrExact;
    if (player.transferValueExact !== undefined) stripped.transferValueExact = player.transferValueExact;
    if (player.moraleExact !== undefined) stripped.moraleExact = player.moraleExact;
    if (player.fitnessExact !== undefined) stripped.fitnessExact = player.fitnessExact;
    if (player.recentForm !== undefined) stripped.recentForm = player.recentForm;
  }
  return stripped;
}

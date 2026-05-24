/**
 * P1↔P3 resolution — reputation level gates max hirable staff qualityTier.
 *
 * Per ADR-010 §P1↔P3 Resolution Mechanism:
 *   reputation.level 1-2 → max staff qualityTier = 1 (novice only)
 *   reputation.level 3   → max staff qualityTier = 2 (experienced)
 *   reputation.level 4-5 → max staff qualityTier = 3 (expert)
 *
 * Expert staff (tier 3) perceive cascade nodes at fine sensitivity → more
 * messages → more cascade signals. This is the canonical path from manager
 * progression to gameplay visibility.
 *
 * Pure function. Safe to call on client for preview (no I/O).
 *
 * Story: MANAGER-RPG-006
 * Control Manifest: 2026-05-19
 */

export type StaffQualityTier = 1 | 2 | 3;

export function getMaxHirableStaffQuality(reputationLevel: number): StaffQualityTier {
  if (reputationLevel >= 4) return 3;
  if (reputationLevel >= 3) return 2;
  return 1;
}

/**
 * Convenience: check whether a specific staff tier is hirable at the current
 * reputation level. Used by hud-ui to grey out unavailable hires.
 */
export function isStaffTierHirable(
  reputationLevel: number,
  tier: StaffQualityTier,
): boolean {
  return tier <= getMaxHirableStaffQuality(reputationLevel);
}

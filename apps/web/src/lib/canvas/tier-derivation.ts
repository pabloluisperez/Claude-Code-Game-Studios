/**
 * City progression tier derivation — pure functions.
 *
 * v1.1 implementation of design/gdd/city-progression.md §3.2, §4.1, §4.2, §4.3.
 *
 * Reads WorldState + tier history → produces current tier + sub-element states.
 * NEVER mutates WorldState (per ADR-021 server-authoritative read-only).
 */

import type {
  CityTier,
  CrowdSpriteLevel,
  PitchSurface,
  TierHistory,
} from './types.js';

/** Tier activation thresholds (city-progression.md §3.2, §7). */
export const TIER_THRESHOLDS: Record<2 | 3 | 4, {
  prestige: number;
  balanceK: number;
  fanBase: number;
  minSeason: number;
}> = {
  2: { prestige: 15, balanceK: 50, fanBase: 1500, minSeason: 1 },
  3: { prestige: 35, balanceK: 200, fanBase: 5000, minSeason: 3 },
  4: { prestige: 60, balanceK: 500, fanBase: 15000, minSeason: 6 },
};

/** Allowed divisions per tier (city-progression.md §3.2). */
export const DIVISION_REQUIRED: Record<2 | 3 | 4, readonly string[]> = {
  2: ['first', 'second', 'third', 'fourth', 'fifth'],
  3: ['first', 'second', 'third', 'fourth'],
  4: ['first', 'second'],
};

/** Anti yo-yo: consecutive weeks below threshold required before tier downgrade. */
export const ANTI_YOYO_WEEKS = 4;

/** Bankruptcy floor that triggers instant downgrade to T1 (city-progression.md §5.2). */
export const BANKRUPTCY_BALANCE_FLOOR_K = -500;

/**
 * Inputs to tier derivation. Slim subset of WorldState to keep this pure
 * function trivially testable.
 */
export type TierInput = {
  prestige: number;
  /** Financial balance in k€ (not raw euros). */
  financialBalanceK: number;
  fanBase: number;
  currentSeason: number;
  division: string;
};

/**
 * Tier activation predicate per city-progression.md §4.1.
 *
 * Returns true iff `state` meets ALL upConditions of `tier`.
 *
 * This is the *raw* predicate — it doesn't consider history. The full
 * `deriveTier` below combines the predicate with anti-yo-yo + bankruptcy.
 */
export function meetsTierConditions(tier: 2 | 3 | 4, state: TierInput): boolean {
  const t = TIER_THRESHOLDS[tier];
  return (
    state.prestige >= t.prestige &&
    state.financialBalanceK >= t.balanceK &&
    state.fanBase >= t.fanBase &&
    state.currentSeason >= t.minSeason &&
    DIVISION_REQUIRED[tier].includes(state.division)
  );
}

/**
 * Derive the current tier, considering anti-yo-yo and bankruptcy rules
 * (city-progression.md §3.2, §5.1, §5.2, §5.3).
 *
 * Returns:
 *   - `tier`: the resolved tier
 *   - `nextHistory`: updated TierHistory to persist for next tick
 *
 * Pure: same input → same output. Tests cover all 5 edge cases.
 */
export function deriveTier(
  state: TierInput,
  history: TierHistory = { everReachedTier: 1, weeksBelow: { 2: 0, 3: 0, 4: 0 } },
): { tier: CityTier; nextHistory: TierHistory } {
  // §5.2 bankruptcy override — instant T1, anti-yo-yo not protective.
  if (state.financialBalanceK < BANKRUPTCY_BALANCE_FLOOR_K) {
    return {
      tier: 1,
      nextHistory: {
        // Don't reset everReachedTier — §5.2 "recovery in <4 weeks restores"
        everReachedTier: history.everReachedTier,
        weeksBelow: { 2: 0, 3: 0, 4: 0 },
      },
    };
  }

  // Compute eligible tier from raw conditions (highest tier satisfied).
  let eligible: CityTier = 1;
  if (meetsTierConditions(2, state)) eligible = 2;
  if (meetsTierConditions(3, state)) eligible = 3;
  if (meetsTierConditions(4, state)) eligible = 4;

  // Anti-yo-yo: if we've ever reached a higher tier, hold it for up to
  // ANTI_YOYO_WEEKS consecutive weeks below.
  const nextWeeksBelow: TierHistory['weeksBelow'] = { ...history.weeksBelow };

  // For each tier T > eligible that we've previously reached, increment its
  // weeksBelow counter. If still < ANTI_YOYO_WEEKS, that tier holds.
  let heldTier: CityTier = eligible;
  for (const t of [2, 3, 4] as const) {
    if (t > eligible && history.everReachedTier >= t) {
      nextWeeksBelow[t] = history.weeksBelow[t] + 1;
      if (nextWeeksBelow[t] < ANTI_YOYO_WEEKS && t > heldTier) {
        heldTier = t;
      }
    } else {
      // Eligible — reset counter
      nextWeeksBelow[t] = 0;
    }
  }

  const everReachedTier: CityTier = Math.max(
    history.everReachedTier,
    heldTier,
  ) as CityTier;

  return {
    tier: heldTier,
    nextHistory: { everReachedTier, weeksBelow: nextWeeksBelow },
  };
}

/**
 * Pitch surface state derived from infrastructure_level (city-progression.md §3.3).
 */
export function pitchSurface(infrastructureLevel: number): PitchSurface {
  if (infrastructureLevel < 20) return 'dry';
  if (infrastructureLevel < 50) return 'patchy';
  if (infrastructureLevel < 80) return 'healthy';
  return 'pristine';
}

/**
 * Crowd sprite level from attendance / capacity ratio (city-progression.md §4.3).
 */
export function crowdSpriteLevel(density: number): CrowdSpriteLevel {
  const d = density < 0 ? 0 : density > 1 ? 1 : density;
  if (d < 0.15) return 'empty';
  if (d < 0.5) return 'sparse';
  if (d < 0.9) return 'packed';
  return 'overflowing';
}

/**
 * Tier transition descriptor — used by the renderer to decide whether to
 * play an animation when state changes.
 */
export type TierTransition =
  | { type: 'none' }
  | { type: 'upgrade'; from: CityTier; to: CityTier }
  | { type: 'downgrade'; from: CityTier; to: CityTier }
  | { type: 'bankruptcy'; from: CityTier; to: 1 };

export function tierTransition(prev: CityTier, next: CityTier, isBankruptcy = false): TierTransition {
  if (prev === next) return { type: 'none' };
  if (isBankruptcy) return { type: 'bankruptcy', from: prev, to: 1 };
  if (next > prev) return { type: 'upgrade', from: prev, to: next };
  return { type: 'downgrade', from: prev, to: next };
}

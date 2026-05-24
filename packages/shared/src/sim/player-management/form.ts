/**
 * F4 — form rolling average (exponentially weighted) + F5 — form decay.
 *
 * Per `design/gdd/player-management.md` §F4-F5 and ADR-016:
 *   - F4 weights (most-recent first): [1.0, 0.85, 0.7, 0.55, 0.4]
 *   - Clamped to [MIN_FORM, MAX_FORM] = [30, 90]
 *   - F5: -FORM_DECAY_WEEKLY/week after FORM_GRACE_WEEKS of non-play
 *
 * Story: PLAYER-MANAGEMENT-004 (TR-PM-004)
 */

export const MIN_FORM = 30;
export const MAX_FORM = 90;
export const FORM_DECAY_WEEKLY = 2.0;
export const FORM_GRACE_WEEKS = 5;
export const F4_MAX_HISTORY = 5;

const F4_WEIGHTS: readonly number[] = Object.freeze([1.0, 0.85, 0.7, 0.55, 0.4]);

/**
 * F4 — compute a new form from the rolling history of match ratings.
 * Ratings are ordered most-recent-first. Uses the available weight prefix.
 */
export function computeFormF4(ratingsMostRecentFirst: readonly number[]): number {
  if (ratingsMostRecentFirst.length === 0) return MIN_FORM;
  let weighted = 0;
  let totalWeight = 0;
  const n = Math.min(ratingsMostRecentFirst.length, F4_WEIGHTS.length);
  for (let i = 0; i < n; i++) {
    weighted += ratingsMostRecentFirst[i]! * F4_WEIGHTS[i]!;
    totalWeight += F4_WEIGHTS[i]!;
  }
  const form = Math.round(weighted / totalWeight);
  if (form < MIN_FORM) return MIN_FORM;
  if (form > MAX_FORM) return MAX_FORM;
  return form;
}

/**
 * F5 — apply form decay for a player who hasn't played in `weeksWithoutPlay`
 * weeks. The grace period (FORM_GRACE_WEEKS) means decay only kicks in after
 * 5 weeks of inactivity. Returns the new form, clamped at MIN_FORM.
 */
export function computeFormDecayF5(
  currentForm: number,
  weeksWithoutPlay: number,
): number {
  if (weeksWithoutPlay <= FORM_GRACE_WEEKS) return currentForm;
  const decayed = currentForm - FORM_DECAY_WEEKLY;
  return Math.max(MIN_FORM, decayed);
}

/**
 * Append a new match rating to the rolling history (most-recent-first).
 * Returns the truncated history with at most F4_MAX_HISTORY entries.
 */
export function applyFormUpdate(
  recentRatings: readonly number[],
  newRating: number,
): number[] {
  // Most-recent-first: prepend newRating, drop tail
  return [newRating, ...recentRatings].slice(0, F4_MAX_HISTORY);
}

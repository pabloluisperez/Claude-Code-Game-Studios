/**
 * Red-card + yellow-accumulation suspension formulas.
 *
 * Sprint 13 task 13-1 (Pablo playtest 2026-05-21 + clarifications):
 *
 * Suspension model is **per-match**, not per-week. A bye week with no
 * fixture doesn't count down. The match-day runner decrements
 * `players.suspended_matches_remaining` by 1 each time the player's club
 * plays a fixture; the suspension is over when the counter reaches 0
 * (or NULL).
 *
 * Two triggers populate the counter:
 *   1. Red-card event (direct, second_yellow, or violent) — sets counter
 *      to suspensionMatches(reason): 1, 2, or 3.
 *   2. 5-yellow accumulation rule — when `yellow_cards_season` reaches 5,
 *      counter is set to 1 and the yellow counter resets to 0.
 *
 * Pure functions. No RNG. No DB.
 *
 * Story: SPRINT-13-S01
 * Control Manifest: 2026-05-19
 */

/**
 * Lenient event shape — accepts both the full `MatchEvent` (from the
 * football match simulator) and the simpler `QuickMatchEvent` (from
 * quick-match). Both share `type`, `minute`, `team`, and a player ref.
 *
 * The player ref is `player_id` in MatchEvent and `playerId` in
 * QuickMatchEvent — we accept either.
 */
export interface SuspensionEvent {
  readonly type: string;
  readonly minute: number;
  readonly team: 'home' | 'away';
  readonly player_id?: string | undefined;
  readonly playerId?: string | undefined;
  readonly reason?: string | undefined;
}

/**
 * Mapping from red-card reason to suspension matches.
 *
 *   second_yellow → 1 match (mild — two cautions accumulated)
 *   direct        → 2 matches (serious foul, no prior caution)
 *   violent       → 3 matches (violent conduct — extension beyond `direct`)
 *
 * The `violent` tier is reserved for future use (match-sim does not emit
 * it today; second_yellow and direct cover all observed events). When the
 * football simulator adds a `severity: 'violent'` discriminator, this
 * function picks it up without any further wiring.
 */
export function suspensionMatches(
  reason: 'direct' | 'second_yellow' | 'violent' | string,
): number {
  if (reason === 'violent') return 3;
  if (reason === 'direct') return 2;
  if (reason === 'second_yellow') return 1;
  return 0;
}

/** Threshold for the season-yellow accumulation auto-suspension. */
export const YELLOW_SEASON_SUSPENSION_THRESHOLD = 5;

export interface SuspensionEntry {
  readonly playerId: string;
  readonly matches: number;
  readonly reason: string;
  readonly minute: number;
  readonly team: 'home' | 'away';
}

/**
 * Extract a list of `{ playerId, matches }` entries from a match's events.
 * Used by the match-day runner to persist suspensions in batch.
 *
 * Returns an empty array when no `red_card` events are present.
 */
export function extractSuspensions(
  events: readonly SuspensionEvent[],
): readonly SuspensionEntry[] {
  const out: SuspensionEntry[] = [];
  for (const ev of events) {
    if (ev.type !== 'red_card') continue;
    const playerId = ev.player_id ?? ev.playerId;
    if (!playerId) continue;
    if (ev.team !== 'home' && ev.team !== 'away') continue;
    const reason = ev.reason ?? 'direct';
    const matches = suspensionMatches(reason);
    if (matches <= 0) continue;
    out.push({
      playerId,
      matches,
      reason,
      minute: ev.minute,
      team: ev.team,
    });
  }
  return out;
}

export interface YellowAccumulationEntry {
  readonly playerId: string;
  readonly newSeasonCount: number;
  /** True when the 5-yellow threshold triggered an auto-suspension this tick. */
  readonly triggersSuspension: boolean;
}

/**
 * Process yellow-card events into season-counter updates. Each player's
 * count goes UP by the number of yellows they received this match;
 * `triggersSuspension` is set when the resulting count reaches or exceeds
 * the threshold.
 *
 * The match-day runner should:
 *   1. Read current `yellow_cards_season` per player from DB
 *   2. Call this function
 *   3. For each entry: persist `yellow_cards_season = newSeasonCount`
 *   4. For entries with `triggersSuspension`: set
 *      `suspended_matches_remaining = 1` AND reset
 *      `yellow_cards_season = 0`
 */
export function processYellowAccumulation(
  events: readonly SuspensionEvent[],
  currentSeasonCountsByPlayerId: Readonly<Record<string, number>>,
): readonly YellowAccumulationEntry[] {
  // Tally yellows this match by playerId (accepting both id shapes).
  const yellowsThisMatch: Record<string, number> = {};
  for (const ev of events) {
    if (ev.type !== 'yellow_card') continue;
    const pid = ev.player_id ?? ev.playerId;
    if (!pid) continue;
    yellowsThisMatch[pid] = (yellowsThisMatch[pid] ?? 0) + 1;
  }

  const out: YellowAccumulationEntry[] = [];
  for (const [playerId, deltaYellows] of Object.entries(yellowsThisMatch)) {
    const prev = currentSeasonCountsByPlayerId[playerId] ?? 0;
    const newSeasonCount = prev + deltaYellows;
    const triggersSuspension = newSeasonCount >= YELLOW_SEASON_SUSPENSION_THRESHOLD;
    out.push({ playerId, newSeasonCount, triggersSuspension });
  }
  return out;
}

/**
 * Check whether a player can be selected for a fixture.
 *
 * Returns `true` when:
 *   - `suspendedMatchesRemaining` is null OR 0
 *
 * Returns `false` when there are remaining matches to serve (>= 1).
 *
 * Used by the /squad lineup selector and the staff hire flow.
 */
export function isPlayerAvailable(
  suspendedMatchesRemaining: number | null,
): boolean {
  if (suspendedMatchesRemaining === null) return true;
  return suspendedMatchesRemaining <= 0;
}

/**
 * Return-fixture computation: given the current matchday and remaining
 * matches, what's the matchday the player can come back?
 *
 * Used by /squad UI to show "Vuelve en J17".
 *
 *   currentMatchday=10, matchesRemaining=2 → returns 12
 *     (misses matchday 10 → counter goes 2→1; misses matchday 11 → 1→0;
 *      returns matchday 12)
 *   matchesRemaining=null → returns null
 *   matchesRemaining=0 → returns currentMatchday (available now)
 */
export function returnMatchday(
  currentMatchday: number,
  suspendedMatchesRemaining: number | null,
): number | null {
  if (suspendedMatchesRemaining === null) return null;
  if (suspendedMatchesRemaining <= 0) return currentMatchday;
  return currentMatchday + suspendedMatchesRemaining;
}

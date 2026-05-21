/**
 * loadAdvanceContext — extracts the context-loading subset of the advance
 * orchestrator. The full orchestrator extraction is deferred to Sprint 9;
 * this helper is the proof-of-concept seam that consolidates the 4 SELECT
 * queries the advance form action currently runs serially.
 *
 * Before this helper, `apps/web/src/routes/dashboard/+page.server.ts` ran:
 *   1. SELECT playthroughs WHERE userId=...
 *   2. SELECT worldSnapshots WHERE playthroughId=...
 *   3. SELECT clubs.division WHERE id=playthrough.clubId
 *   4. SELECT leagues + seasons to determine tvCurrentSeason
 *
 * Now: callers may use `loadAdvanceContext(tx, playthroughId)` to get all
 * four in one helper call. The dashboard form action will adopt this in a
 * follow-up commit (Sprint 9 task) once the full orchestrator extraction
 * is scoped.
 *
 * Story: Sprint 8 task 8-4 (partial)
 * Control Manifest: 2026-05-19
 */

import {
  and,
  clubs,
  desc,
  eq,
  leagues,
  playthroughs,
  seasons,
  worldSnapshots,
} from '@smt/db';
import type { db as DbClient } from '@smt/db';
import { defaultWorldState } from '@smt/shared';
import type { WorldState } from '@smt/shared/sim/cascade-types';
import type { DelayedEffectsBuffer } from '@smt/shared/sim/delayed-effects';

export type DbHandle = typeof DbClient;

export interface AdvanceContext {
  /** Active playthrough row (the user's current career). */
  readonly playthrough: typeof playthroughs.$inferSelect;
  /** Previous tick's WorldState (or defaultWorldState if first advance). */
  readonly prevState: Readonly<WorldState>;
  /** Previous tick's delayed-effects buffer. */
  readonly prevBuffer: DelayedEffectsBuffer;
  /** Latest persisted week (-1 if no snapshots yet). */
  readonly latestWeek: number;
  /** Club's current division mapped to D1/D2 (cascade-engine + tv-rights vocab). */
  readonly currentDivision: 'D1' | 'D2';
  /** Active season number (1 if no league/season rows exist yet). */
  readonly currentSeason: number;
}

/**
 * Load all upstream context the advance orchestrator needs in a single helper.
 *
 * Does NOT take a transaction handle — context loading happens BEFORE the
 * transactional pipeline begins. Callers wrap the rest (TV pre-phase +
 * runTick + economy + match + persist) in `db.transaction()`.
 *
 * Throws if the playthrough row doesn't exist or doesn't belong to the user.
 * Returns null if no playthrough matches the user (caller renders the
 * "no active career" UI).
 */
export async function loadAdvanceContext(
  handle: DbHandle,
  userId: string,
): Promise<AdvanceContext | null> {
  // 1. Active playthrough (most recently updated for this user).
  const [playthrough] = await handle
    .select()
    .from(playthroughs)
    .where(eq(playthroughs.userId, userId))
    .orderBy(desc(playthroughs.updatedAt))
    .limit(1);

  if (!playthrough) return null;

  // 2. Latest world snapshot for that playthrough.
  const [latest] = await handle
    .select()
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const prevState =
    (latest?.worldState as WorldState | undefined) ?? defaultWorldState();
  const prevBuffer =
    (latest?.delayedEffectsBuffer as DelayedEffectsBuffer | undefined) ?? [];
  const latestWeek = latest?.week ?? -1;

  // 3. Club division (for tv-rights + economy division-keyed lookups).
  const [clubRow] = await handle
    .select({ division: clubs.division })
    .from(clubs)
    .where(eq(clubs.id, playthrough.clubId))
    .limit(1);
  const currentDivision: 'D1' | 'D2' =
    clubRow?.division === 'first' ? 'D1' : 'D2';

  // 4. Current season number (defaults to 1 if league/season not yet seeded).
  let currentSeason = 1;
  const [leagueRow] = await handle
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.playthroughId, playthrough.id))
    .limit(1);
  if (leagueRow) {
    const [seasonRow] = await handle
      .select({ seasonNumber: seasons.seasonNumber })
      .from(seasons)
      .where(
        and(eq(seasons.leagueId, leagueRow.id), eq(seasons.status, 'active')),
      )
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (seasonRow) currentSeason = seasonRow.seasonNumber;
  }

  return {
    playthrough,
    prevState,
    prevBuffer,
    latestWeek,
    currentDivision,
    currentSeason,
  };
}

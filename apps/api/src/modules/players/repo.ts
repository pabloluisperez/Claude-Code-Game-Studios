/**
 * Players repository — owns ALL reads/writes to the `players` table.
 *
 * Per control-manifest: cross-module direct DB access is forbidden. Other
 * modules (economy, match-sim, advance-worker) call functions exported here
 * rather than constructing queries against `players` directly.
 *
 * Story: PLAYER-MANAGEMENT-002
 * Control Manifest: 2026-05-19
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NewPlayer, Player } from '@smt/db';
import { players } from '@smt/db';
import type { db as DBType } from '@smt/db';

/** Canonical denominator for squad_available_pct per league-system.md Rule 8. */
export const SQUAD_REGISTERED_SIZE = 25;

type DBHandle = typeof DBType | Parameters<typeof DBType.transaction>[0] extends (tx: infer T) => unknown ? T : never;

// Drizzle's transaction callback type is parametric — keep our signatures loose:
type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

/**
 * Bulk-insert a roster of players. Used by world-gen at playthrough creation.
 * Returns inserted player ids.
 */
export async function createPlayers(
  tx: Tx,
  rows: readonly NewPlayer[],
): Promise<readonly { id: string }[]> {
  if (rows.length === 0) return [];
  const inserted = await tx.insert(players).values([...rows]).returning({ id: players.id });
  return inserted;
}

/** Find all players belonging to a club in a playthrough. */
export async function findByClub(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<readonly Player[]> {
  return tx
    .select()
    .from(players)
    .where(and(eq(players.playthroughId, playthroughId), eq(players.clubId, clubId)));
}

/** Find a single player by id. Returns null if not found. */
export async function findById(tx: Tx, id: string): Promise<Player | null> {
  const rows = await tx.select().from(players).where(eq(players.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Find players by a set of ids (used for lineup hydration). */
export async function findByIds(
  tx: Tx,
  ids: readonly string[],
): Promise<readonly Player[]> {
  if (ids.length === 0) return [];
  return tx.select().from(players).where(inArray(players.id, [...ids]));
}

/**
 * Apply a partial update to a single player. Caller is responsible for the
 * surrounding Drizzle transaction (advance-worker wraps the full tick).
 */
export async function updatePlayer(
  tx: Tx,
  id: string,
  patch: Partial<NewPlayer>,
): Promise<void> {
  await tx.update(players).set(patch).where(eq(players.id, id));
}

/**
 * Squad availability count per ADR-016 + league-system canonical rule.
 * The DENOMINATOR is `SQUAD_REGISTERED_SIZE = 25`, NOT the dynamic squad size
 * (a club may have >25 contracted players; only 25 are "registered").
 *
 * Returns:
 *   - available: number of players with availability='available'
 *   - total: the canonical registered size (25)
 *   - pct: round(available / total × 100) — input for the forfeit guard
 */
export async function getSquadAvailabilityCount(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<{ available: number; total: number; pct: number }> {
  const result = await tx
    .select({
      available: sql<number>`count(*) filter (where ${players.availability} = 'available')::int`,
    })
    .from(players)
    .where(and(eq(players.playthroughId, playthroughId), eq(players.clubId, clubId)));
  const availableCount = result[0]?.available ?? 0;
  const pct = Math.round((availableCount / SQUAD_REGISTERED_SIZE) * 100);
  return { available: availableCount, total: SQUAD_REGISTERED_SIZE, pct };
}

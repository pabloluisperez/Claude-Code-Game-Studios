/**
 * Repository for match_sessions table. Owns ALL reads/writes to match_sessions.
 *
 * Per ADR-013: partial UNIQUE on (playthroughId) excluding completed/archived/failed.
 * `acquireForUpdate` is the AC-MATCH-24 lock primitive (HTTP decision + timeout
 * job race).
 *
 * Story: MATCH-SIM-015
 * Control Manifest: 2026-05-19
 */

import { and, desc, eq, inArray, not, sql } from 'drizzle-orm';
import type { MatchSessionRow, NewMatchSessionRow } from '@smt/db';
import { matchSessions } from '@smt/db';

export type { MatchSessionRow, NewMatchSessionRow };
import type { db as DBType } from '@smt/db';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

/** Typed error so the HTTP layer can translate to 409 Conflict. */
export class MatchSessionConflictError extends Error {
  constructor(public playthroughId: string) {
    super(`Active match session already exists for playthrough ${playthroughId}`);
    this.name = 'MatchSessionConflictError';
  }
}

const TERMINAL_STATES = ['completed', 'archived', 'failed'];

/**
 * Insert a new session. If the partial UNIQUE blocks (active session exists),
 * throw `MatchSessionConflictError`.
 */
export async function createSession(
  tx: Tx,
  row: Omit<NewMatchSessionRow, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ id: string }> {
  try {
    const result = await tx.insert(matchSessions).values(row).returning({ id: matchSessions.id });
    return result[0]!;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Postgres unique violation: code '23505'
    if (
      message.includes('match_sessions_active_playthrough') ||
      message.includes('23505')
    ) {
      throw new MatchSessionConflictError(row.playthroughId);
    }
    throw err;
  }
}

/**
 * Find the active (non-terminal) session for a playthrough.
 * Per R6 fix: ORDER BY created_at DESC + filter ensures the active row wins.
 */
export async function findActiveSession(
  tx: Tx,
  playthroughId: string,
): Promise<MatchSessionRow | null> {
  const rows = await tx
    .select()
    .from(matchSessions)
    .where(
      and(
        eq(matchSessions.playthroughId, playthroughId),
        not(inArray(matchSessions.state, TERMINAL_STATES)),
      ),
    )
    .orderBy(desc(matchSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Find by ID (no state filter). */
export async function findById(
  tx: Tx,
  id: string,
): Promise<MatchSessionRow | null> {
  const rows = await tx
    .select()
    .from(matchSessions)
    .where(eq(matchSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Patch update. Caller passes only the fields they want to change.
 * Pass MatchSessionSnapshot fields (currentTick, prngState, etc.) — the repo
 * doesn't reconstruct a snapshot; the FSM layer (Story 014) owns that.
 */
export async function updateSnapshot(
  tx: Tx,
  sessionId: string,
  patch: Partial<NewMatchSessionRow>,
): Promise<void> {
  await tx.update(matchSessions).set(patch).where(eq(matchSessions.id, sessionId));
}

/** Mark session failed. */
export async function markFailed(
  tx: Tx,
  sessionId: string,
  _reason: string,
): Promise<void> {
  await tx
    .update(matchSessions)
    .set({ state: 'failed' })
    .where(eq(matchSessions.id, sessionId));
}

/** Mark completed. Final score persistence is handled by the caller via patch. */
export async function markCompleted(
  tx: Tx,
  sessionId: string,
): Promise<void> {
  await tx
    .update(matchSessions)
    .set({ state: 'completed' })
    .where(eq(matchSessions.id, sessionId));
}

/**
 * SELECT ... FOR UPDATE — AC-MATCH-24 lock. Caller MUST be inside a
 * transaction; the lock releases on commit/rollback.
 */
export async function acquireForUpdate(
  tx: Tx,
  sessionId: string,
): Promise<MatchSessionRow | null> {
  const rows = await tx.execute<MatchSessionRow>(
    sql`SELECT * FROM ${matchSessions} WHERE id = ${sessionId} FOR UPDATE`,
  );
  return (rows.rows ?? rows)[0] ?? null;
}

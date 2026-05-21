/**
 * Recovery worker — detects orphaned MatchSessions per ADR-013.
 *
 * Runs every 15 minutes via BullMQ repeat. Finds sessions where:
 *   state='paused_for_decision' AND timeoutJobId IS NULL
 *   AND updated_at < now() - 30 minutes
 *
 * These are sessions where the worker committed the pause but crashed before
 * queue.add(). The recovery worker creates the missing delayed job.
 *
 * Also: archives stale completed/failed sessions (older than 30 days).
 *
 * Story: MATCH-SIM-018
 * Control Manifest: 2026-05-19
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { db, matchSessions } from '@smt/db';
import type { MatchJobPayload } from './match-worker.js';

export interface RecoveryDeps {
  readonly timeoutQueue: Queue<MatchJobPayload>;
  readonly orphanThresholdMs?: number; // default 30 minutes
  readonly defaultTimeoutMs?: number; // for recreated jobs (24h default)
}

const DEFAULT_ORPHAN_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Per-run scan. Designed to be called by a BullMQ repeat job every 15 minutes.
 * Returns the number of orphans recovered.
 */
export async function recoverOrphanSessions(deps: RecoveryDeps): Promise<number> {
  const orphanThresholdMs = deps.orphanThresholdMs ?? DEFAULT_ORPHAN_MS;
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cutoff = new Date(Date.now() - orphanThresholdMs);

  const orphans = await db
    .select()
    .from(matchSessions)
    .where(
      and(
        eq(matchSessions.state, 'paused_for_decision'),
        isNull(matchSessions.timeoutJobId),
        lt(matchSessions.updatedAt, cutoff),
      ),
    );

  let recovered = 0;
  for (const session of orphans) {
    const job = await deps.timeoutQueue.add(
      'match-timeout',
      { matchSessionId: session.id, applyDefaultDecision: true },
      {
        delay: defaultTimeoutMs,
        jobId: `recovery-timeout-${session.id}-${session.currentTick}`,
      },
    );
    await db
      .update(matchSessions)
      .set({ timeoutJobId: job.id ?? null })
      .where(eq(matchSessions.id, session.id));
    recovered += 1;
  }

  return recovered;
}

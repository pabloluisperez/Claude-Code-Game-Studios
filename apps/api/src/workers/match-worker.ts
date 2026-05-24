/**
 * BullMQ Match Worker — drives a MatchSession from start to completion via
 * re-enqueue with PRNG state persistence (ADR-013 Option B).
 *
 * Pattern per ADR-013 + GDD §Flujo de pausa en servidor:
 *   BEGIN tx → load snapshot → advanceTick until pause/completion →
 *   persist snapshot → COMMIT → queue.add (delayed timeout) → UPDATE timeoutJobId
 *
 * R6 idempotency guard: if the worker crashes after COMMIT but before
 * queue.add(), the retry sees `timeout_job_id === null` and creates a fresh
 * delayed job (no duplicate snapshot).
 *
 * Story: MATCH-SIM-016
 * Control Manifest: 2026-05-19
 */

import type { Job, Queue } from 'bullmq';
import type { MatchEvent, MatchInput, MatchOutcome, MatchSessionSnapshot } from '@smt/shared';
import { advanceTick, applyDefaultDecisionsToSnapshot } from '@smt/shared';
import { db } from '@smt/db';
import * as Repo from '../modules/match/match-sessions-repo.js';

export interface MatchJobPayload {
  readonly matchSessionId: string;
  readonly applyDefaultDecision?: boolean;
}

export type MatchEventEmitter = (event: {
  type: 'match:paused' | 'match:resumed' | 'match:complete' | 'match:event';
  sessionId: string;
  payload: unknown;
}) => void;

export type ApplyMatchOutcomeCallback = (
  sessionId: string,
  outcome: MatchOutcome,
) => Promise<void>;

export interface MatchWorkerDeps {
  readonly timeoutQueue: Queue<MatchJobPayload>;
  readonly emitter: MatchEventEmitter;
  readonly applyOutcomeCallback: ApplyMatchOutcomeCallback;
  /** Default decision timeout in ms (per AC-MATCH-18). Defaults to 24h. */
  readonly decisionTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Process a single MatchSession job. Idempotent on retry.
 */
export async function processMatchJob(
  job: Job<MatchJobPayload>,
  deps: MatchWorkerDeps,
): Promise<void> {
  const { matchSessionId, applyDefaultDecision } = job.data;
  const timeoutMs = deps.decisionTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Phase 1: load + tick + persist inside a single transaction.
  const { outcome, pauseSnapshot, completedSnapshot } = await db.transaction(async (tx) => {
    const row = await Repo.acquireForUpdate(tx, matchSessionId);
    if (!row) {
      throw new Error(`MatchSession ${matchSessionId} not found`);
    }
    if (row.state === 'completed' || row.state === 'failed' || row.state === 'archived') {
      // Idempotent skip — BullMQ retried an already-terminal job.
      return { outcome: null, pauseSnapshot: null, completedSnapshot: null };
    }

    // Hydrate snapshot + input
    let snapshot = rowToSnapshot(row);
    const input = rowToMatchInput(row);

    if (applyDefaultDecision) {
      // Apply rival AI subs etc. for the pause that timed out
      // We don't know which pauseType triggered the timeout from the row alone;
      // assume substitution_window if at a SW tick, else injury_pause.
      const pauseType = isSwTick(row.currentTick) ? 'substitution_window' : 'injury_pause';
      snapshot = applyDefaultDecisionsToSnapshot(snapshot, pauseType);
    }

    // Drive ticks until next pause OR completion
    let pauseSnap: MatchSessionSnapshot | null = null;
    let outcomeResult: MatchOutcome | null = null;
    let completedSnap: MatchSessionSnapshot | null = null;

    // Single advanceTick call — it internally loops until pause or completion.
    const advance = advanceTick(snapshot, [{ kind: 'no_op' }], input);
    snapshot = advance.nextSnapshot;
    if (advance.matchOutcome !== null) {
      outcomeResult = advance.matchOutcome;
      completedSnap = snapshot;
    } else if (advance.pauseType !== null) {
      pauseSnap = snapshot;
    }

    // Persist
    await Repo.updateSnapshot(tx, matchSessionId, snapshotToRowPatch(snapshot));

    if (completedSnap) {
      await Repo.markCompleted(tx, matchSessionId);
    }

    return {
      outcome: outcomeResult,
      pauseSnapshot: pauseSnap,
      completedSnapshot: completedSnap,
    };
  });

  // Phase 2: AFTER commit, post-tx side effects.
  if (outcome && completedSnapshot) {
    await deps.applyOutcomeCallback(matchSessionId, outcome);
    deps.emitter({
      type: 'match:complete',
      sessionId: matchSessionId,
      payload: { outcome, snapshot: completedSnapshot },
    });
    return;
  }

  if (pauseSnapshot) {
    // R6 idempotency: only create the delayed job if timeoutJobId is still null
    // (set by a previous worker run that committed but didn't reach the
    // queue.add() step). Re-read fresh; the snapshot we have is stale wrt
    // timeoutJobId (we just persisted with whatever was there).
    const freshRow = await db.transaction((tx) => Repo.findById(tx, matchSessionId));
    if (freshRow && freshRow.timeoutJobId === null) {
      const newJob = await deps.timeoutQueue.add(
        'match-timeout',
        { matchSessionId, applyDefaultDecision: true },
        { delay: timeoutMs, jobId: `timeout-${matchSessionId}-${freshRow.currentTick}` },
      );
      await db.transaction((tx) =>
        Repo.updateSnapshot(tx, matchSessionId, { timeoutJobId: newJob.id ?? null }),
      );
    }
    // Re-emit Socket.IO event (idempotent at emitter layer per story 018).
    deps.emitter({
      type: 'match:paused',
      sessionId: matchSessionId,
      payload: { snapshot: pauseSnapshot },
    });
  }
}

// ── Snapshot serialization helpers ───────────────────────────────────────────

function rowToSnapshot(row: Repo.MatchSessionRow): MatchSessionSnapshot {
  return {
    currentTick: row.currentTick,
    eventsAccumulated: row.eventsAccumulated as readonly MatchEvent[],
    currentLineupHome: row.currentLineupHome as MatchSessionSnapshot['currentLineupHome'],
    currentLineupAway: row.currentLineupAway as MatchSessionSnapshot['currentLineupAway'],
    homeMomentum: row.homeMomentum,
    substitutionsUsed: row.substitutionsUsed,
    awaySubstitutionsUsed: row.awaySubstitutionsUsed,
    yellowCardsByPlayerId: row.yellowCardsByPlayerId as Record<string, number>,
    currentFormationHome: row.currentFormationHome as MatchSessionSnapshot['currentFormationHome'],
    currentFormationAway: row.currentFormationAway as MatchSessionSnapshot['currentFormationAway'],
    activeInstructionHome: row.activeInstructionHome as MatchSessionSnapshot['activeInstructionHome'],
    activeInstructionAway: row.activeInstructionAway as MatchSessionSnapshot['activeInstructionAway'],
    prngState: row.prngState,
    state: row.state as MatchSessionSnapshot['state'],
    timeoutJobId: row.timeoutJobId,
  };
}

function snapshotToRowPatch(s: MatchSessionSnapshot): Partial<Repo.NewMatchSessionRow> {
  return {
    currentTick: s.currentTick,
    eventsAccumulated: [...s.eventsAccumulated],
    currentLineupHome: [...s.currentLineupHome],
    currentLineupAway: [...s.currentLineupAway],
    homeMomentum: s.homeMomentum,
    substitutionsUsed: s.substitutionsUsed,
    awaySubstitutionsUsed: s.awaySubstitutionsUsed,
    yellowCardsByPlayerId: { ...s.yellowCardsByPlayerId },
    currentFormationHome: s.currentFormationHome,
    currentFormationAway: s.currentFormationAway,
    activeInstructionHome: s.activeInstructionHome,
    activeInstructionAway: s.activeInstructionAway,
    prngState: s.prngState,
    state: s.state,
    timeoutJobId: s.timeoutJobId,
  };
}

function rowToMatchInput(row: Repo.MatchSessionRow): MatchInput {
  return {
    seed: row.seed,
    homeLineup: row.currentLineupHome as MatchInput['homeLineup'],
    awayLineup: row.currentLineupAway as MatchInput['awayLineup'],
    homeFormation: row.currentFormationHome as MatchInput['homeFormation'],
    awayFormation: row.currentFormationAway as MatchInput['awayFormation'],
    homeInstruction: row.activeInstructionHome as MatchInput['homeInstruction'],
    awayInstruction: row.activeInstructionAway as MatchInput['awayInstruction'],
    preMatchSnapshot: row.preMatchSnapshot as MatchInput['preMatchSnapshot'],
    playerClubSide: row.playerClubSide as MatchInput['playerClubSide'],
    playerClubId: row.playerClubId,
  };
}

function isSwTick(tick: number): boolean {
  return tick === 45 || tick === 60 || tick === 75;
}

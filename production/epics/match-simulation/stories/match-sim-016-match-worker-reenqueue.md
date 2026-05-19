---
Story: MATCH-SIM-016
Status: Pending
Type: Integration
GDD Requirement: AC-MATCH-02 (determinism across pause boundaries — production E2E), AC-MATCH-18 (timeout 24h default decision applies)
Governing ADR: ADR-013 (re-enqueue pattern with PRNG persistence)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/match-sim/match-worker.test.ts
Engine Reference: docs/engine-reference/web/modules/jobs.md (BullMQ)
---

# Story: BullMQ Match Worker — Re-enqueue with PRNG State Persistence

## Goal

Implement the BullMQ worker that drives a `MatchSession` from start to completion via re-enqueue. The worker:

1. Loads the snapshot from DB (`match-sessions-repo` from story 015).
2. Calls FSM's `advanceTick` (story 014) until a pause OR tick 90.
3. On pause: persist new snapshot + create delayed timeout job (per GDD R6 idempotency guard) + complete the current job.
4. On tick 90: persist completed state + apply worldStateDeltas to cascade-engine via callback (out of scope — interface only) + emit MatchComplete (Socket.IO — story 018).
5. On crash: BullMQ re-queues the active job; the worker re-loads the snapshot and continues from the persisted prngState.

This is the integration point between stories 014 (FSM), 015 (DB), and BullMQ. AC-MATCH-02 in production form (across an actual job boundary) is verified here.

## Scope

In `apps/api/src/workers/match-worker.ts` (new):

- `export async function processMatchJob(job: Job<MatchJobPayload>): Promise<void>` — BullMQ worker function. Payload: `{ matchSessionId: string; applyDefaultDecision?: boolean; }`.
- Inside the worker:
  - Open DB transaction.
  - `acquireForUpdate(tx, matchSessionId)` (from story 015).
  - Verify `state ∈ {'in_progress', 'paused_for_decision'}`; else log + return (idempotent skip — handles BullMQ retry of an already-completed job).
  - If `applyDefaultDecision === true` (timeout path), call FSM's `applyDefaultDecisions(snapshot)` (story 014) first.
  - Call `advanceTick(snapshot, decisions=[])` repeatedly until `pauseType !== null` OR `matchOutcome !== null`.
  - **On pause**:
    1. `updateSnapshot(tx, sessionId, newSnapshot)` (with state='paused_for_decision', prng_state, etc.).
    2. Within the SAME transaction: `timeout_job_id = null` initially (per GDD R6 idempotency guard).
    3. COMMIT.
    4. AFTER commit: `queue.add('match-timeout', { matchSessionId, applyDefaultDecision: true }, { delay: decisionTimeoutMs ?? 24*3600*1000, jobId: uniqueId })`.
    5. UPDATE `timeout_job_id` with the new job id (separate transaction).
    6. Emit `match_pause` event via injected `MatchEventEmitter` (story 018 wires the real Socket.IO impl; here just call the interface).
  - **On tick 90**:
    1. Build `MatchOutcome` (FSM provides it).
    2. `markCompleted(tx, sessionId, outcome)`.
    3. COMMIT.
    4. Emit `match_complete` event.
    5. Call `applyMatchOutcomeCallback(outcome)` — an injectable function provided at worker setup that wires the result into the cascade-engine tick (out of scope here; the interface accepts the callback).
- **GDD R6 idempotency guard**: if the worker crashes AFTER commit but BEFORE `queue.add()`, BullMQ re-runs the job. The retry sees `state='paused_for_decision'` AND `timeout_job_id === null` → re-creates the delayed job (does NOT duplicate a snapshot). Pseudocode pattern:
  ```ts
  if (session.state === 'paused_for_decision' && session.timeoutJobId === null) {
    const jobId = await queue.add('match-timeout', { matchSessionId, applyDefaultDecision: true }, { delay });
    await db.update(matchSessions).set({ timeoutJobId: jobId }).where(eq(matchSessions.id, sessionId));
  } else if (session.state === 'paused_for_decision' && session.timeoutJobId !== null) {
    // re-emit Socket.IO event (idempotent) without creating a new delayed job
    emitter.emit({ type: 'match_pause', ... });
  }
  ```

- BullMQ Redis connection settings: `maxRetriesPerRequest: null` (control-manifest Foundation Required).

## Out of Scope

- Socket.IO impl (story 018 — uses an interface here).
- Hono routes that enqueue the first job (story 017).
- Recovery worker for orphaned sessions (story 018).
- ApplyMatchOutcome integration with cascade-engine (separate epic).

## Acceptance Criteria

- [ ] **End-to-end determinism**: spin up Postgres + Redis (Docker Compose). Create a match session, enqueue the first job. Worker runs to first pause (tick 45). Verify snapshot is persisted with `prng_state` non-null. Apply a scripted decision (no_op) via direct DB update + enqueue resume job. Worker runs to next pause / completion. Capture the resulting MatchOutcome. Repeat the SAME scenario as a one-shot `simulateMatch` (story 013). The two outcomes are deep-equal. **This is AC-MATCH-02 in production form**.
- [ ] **Crash recovery (production AC-MATCH-02)**: start a worker job, kill it (kill -9) at tick 30. Restart the worker. BullMQ re-runs the job. The job loads the snapshot at tick 0 (or whatever was last persisted) and runs to completion. Result: identical to a clean run with the same seed + same default decisions.
- [ ] **AC-MATCH-18 timeout default**: enqueue a session, run to pause at tick 45 (injury). Persist snapshot. Manually enqueue the timeout job with `applyDefaultDecision: true`. Worker processes: `applyDefaultDecisions` triggers `playing_with_ten` (empty bench). Match continues to tick 90. No substitution event in MatchOutcome.events.
- [ ] **Idempotency guard (R6)**: simulate a crash AFTER commit but BEFORE queue.add() (mock queue.add to throw on first call). The retry sees `timeout_job_id IS NULL` and creates a fresh delayed job. NO duplicate snapshot. NO orphan job.
- [ ] **Re-emit on retry without duplicating jobs**: if the worker is retried for an already-paused session (snapshot already persisted, timeout_job_id set), the worker does NOT create a second delayed job. It DOES re-emit the Socket.IO event (idempotent at the emitter level — story 018 ensures this is safe).
- [ ] **Worker idempotency on completed**: if the worker is retried for a `state='completed'` session → returns silently without touching anything.
- [ ] **`acquireForUpdate` integration**: two workers triggered simultaneously for the same session → the second blocks until the first commits. After the first finishes (snapshot updated to `paused_for_decision`), the second sees the new state and returns early (idempotent).
- [ ] **Performance**: a single worker job processes one tick-range (max 45 ticks between pauses) in < 50ms (per AC-MATCH-19; the per-tick budget). Across a 90-tick match split into 3 jobs (pause at 45, 60, 75) the total worker CPU time is < 150ms.

## Implementation Notes

*From ADR-013 §Re-enqueue Pattern + GDD §Flujo de pausa en servidor:*

- "BEGIN DB TRANSACTION → write snapshot → state='paused_for_decision', timeoutJobId=null → COMMIT → queue.add() → UPDATE timeoutJobId → complete BullMQ job → emit Socket.IO".
- "GUARD de idempotencia para retry (R6)": the worker re-checks `timeoutJobId === null` before creating a new delayed job.
- "Two-phase note (R4)": Redis and PostgreSQL cannot share a transaction. The pattern accepts this; the recovery worker (story 018) cleans up orphans where Redis is down.

*Decision validation order at HTTP layer (deferred to story 017)*:
- The worker assumes the snapshot's decisions have already been validated. The HTTP layer enforces sub-pool, COUNTER-not-for-home, mutual-exclusion. Worker is a downstream consumer.

## Test Requirements (Integration, BLOCKING)

`tests/integration/match-sim/match-worker.test.ts` (Vitest + Docker Compose):

- E2E determinism (worker vs one-shot).
- Crash recovery (BullMQ re-queue after kill).
- AC-MATCH-18 timeout default.
- Idempotency guard (mock queue.add failure).
- Re-emit on retry without dup-job.
- Completed session idempotency.
- `acquireForUpdate` blocking.
- Performance budget.

## Dependencies

- **Upstream**: 001-014 (FSM logic), 015 (DB schema + repo).
- **Downstream blockers**: 017 (routes enqueue this worker), 018 (recovery worker + Socket.IO emit).

## Estimate

**2.5 days.** The crash-recovery test alone is a half-day setup. The idempotency guard testing (mock queue.add to throw at the right moment) is tricky to author. Budget 0.5 day for the deterministic-via-worker test (cornerstone).

## Notes / Gotchas

- **BullMQ `maxRetriesPerRequest: null`** is non-obvious and slice-validated. Without it, certain Redis edge cases throw silently in BullMQ@4+. Control-manifest captures this.
- **The crash-recovery test** is the most expensive to author but pays for itself many times over. The slice has a similar test pattern; production replicates.
- **`unique jobId`** for the timeout delayed job: use `match-timeout:${matchSessionId}` so BullMQ rejects duplicate adds (defense-in-depth alongside the timeoutJobId column).
- **Worker idempotency on COMPLETED is required** because BullMQ may retry a job that succeeded in DB but failed to ack. The worker must detect "I'm being retried after success" and return silently. The `state='completed'` check covers this.
- **`MatchEventEmitter`** is injected at worker instantiation. Production injects a Socket.IO-backed impl (story 018); tests inject a `vi.fn()` spy.

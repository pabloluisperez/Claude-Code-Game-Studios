---
Story: MATCH-SIM-018
Status: Complete (code-complete; integration tests deferred to env with Socket.IO + Redis running)
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: AC-MATCH-30 (orphan timeout guard via recovery worker), AC-MATCH-31 (BullMQ `*/15` SKIP LOCKED), AC-MATCH-32 (Socket.IO `match:event` schema), AC-MATCH-03a (determinism unit), AC-MATCH-03b (determinism integration), AC-MATCH-PERF-01 (per-tick budget)
Governing ADR: ADR-013 (Recovery worker mandated), ADR-018 (Socket.IO `/match` namespace + match:event schema), ADR-002 (determinism contract), ADR-001 (Socket.IO 4)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/match-sim/socketio.test.ts + tests/integration/match-sim/recovery-worker.test.ts + tests/integration/match-sim/determinism-e2e.test.ts

---

# MATCH-SIM-018 — Socket.IO `/match` + recovery worker + determinism integration

## Overview

Three closely-coupled deliverables that together close out the match epic:

1. **Socket.IO `/match` namespace** — server-pushed real-time match event
   feed per ADR-018. Replaces the slice's client-side animation timing with
   server-authoritative event streaming. Multiple clients (future MMO match-
   watching) stay in sync.

2. **Recovery worker** — BullMQ scheduled worker (`*/15` cron) that scans for
   orphan timeout jobs (sessions stuck in `paused_for_decision` past their
   decisionTimeoutMs) and applies the default conservative decision. Uses
   `SELECT FOR UPDATE SKIP LOCKED` to avoid contention with normal decision
   POSTs.

3. **End-to-end determinism integration test** — the cornerstone test that
   proves the entire match-epic deliverable is deterministic. Same seed +
   same lineups + same WorldState + same decisions → identical MatchOutcome
   AND identical event stream order. Pairs with story 014's unit-level
   determinism tests.

## Acceptance Criteria

### AC-MS18-01 — Socket.IO `/match` namespace exists + rooms work

GIVEN a running API server with the Socket.IO server attached
WHEN a client connects to the `/match` Socket.IO namespace
THEN:
- The namespace accepts the connection
- The client emits `match:subscribe { sessionId }` to join room `match:{sessionId}`
- The server validates the user has access to the playthrough (session-cookie auth per ADR-001)
- The server replies with `match:subscribed { snapshot }` containing the current MatchSessionSnapshot

If the user lacks access → server emits `match:error { code: 'unauthorized' }`
and disconnects.

### AC-MS18-02 — Server emits match events per ADR-018 schema

WHEN the match-worker (story 016) processes ticks
THEN for each MatchEvent produced, the worker emits to room `match:{sessionId}` a
`match:event` message matching the ADR-018 schema:

```json
{
  "sessionId": "uuid",
  "minute": 67,
  "type": "goal",
  "variant": "header" | "volley" | "default",
  "team": "home",
  "player": { "id": "uuid", "name": "RPC #9", "position": "FWD" },
  "score": { "home": 1, "away": 1 }
}
```

Event types match story 014's MatchEvent union (goal, yellow_card, red_card,
injury, substitution_window, half_time, full_time, var_review).

### AC-MS18-03 — `match:tick` heartbeat every ~5 in-game minutes

To support client clock-drift detection (per ADR-018), the worker emits
`match:tick { sessionId, minute }` at minutes 5, 10, 15, ..., 90 (or
equivalent — once per simulated 5-minute block).

The client uses these to re-sync its local minute clock against the server's
authoritative minute, especially at ×3 / ×10 playback speeds where drift
accumulates.

### AC-MS18-04 — `match:full-time` carries final outcome

WHEN tick 90 is processed AND the match transitions to state `completed`
THEN the worker emits `match:full-time` with the full MatchOutcome:

```json
{
  "sessionId": "uuid",
  "score": { "home": 1, "away": 2 },
  "outcome": { /* MatchOutcome shape from story 011 */ }
}
```

After this emission, the room is destroyed and connected clients are disconnected.

### AC-MS18-05 — Reconnection works via `match:resync`

GIVEN a connected client whose connection drops mid-match
WHEN the client reconnects and emits `match:subscribe { sessionId }`
THEN the server emits a single `match:resync { snapshot, missedEvents }`
message containing:
- The current MatchSessionSnapshot
- All events since the client's last received `match:event`'s minute (client
  sends `lastReceivedMinute` in the subscribe payload)

After resync, normal `match:event` streaming resumes.

### AC-MS18-06 — Recovery worker scans for orphan timeout jobs

GIVEN a session in state `paused_for_decision` whose `timeoutJobId` has fired
AND no `/decision` POST resolved it (e.g., server crash mid-decision, BullMQ
job lost, etc.)
WHEN the recovery worker's `*/15` cron tick fires
THEN the worker:
- Runs `SELECT ... FROM match_sessions WHERE state = 'paused_for_decision'
  AND updated_at < NOW() - INTERVAL '20 minutes' FOR UPDATE SKIP LOCKED`
- For each returned row, applies the default conservative decision (no
  substitution, keep current XI) by enqueueing a new match-worker job with
  the synthetic default decision payload
- Updates `match_sessions.state` and bumps `updated_at`

The 20-minute threshold is configurable but defaults to safe; `decisionTimeoutMs`
in production is 24h, so 20-min stuck sessions are truly orphaned.

### AC-MS18-07 — SKIP LOCKED prevents contention

GIVEN two recovery-worker replicas (or a recovery worker + a manual decision
POST hitting the same row at the same time)
WHEN both queries arrive within the same Postgres txn window
THEN exactly one processes the row (the other skips it because the row is
locked).

No double-resume, no race-condition double-enqueue.

### AC-MS18-08 — Recovery worker does NOT touch `failed` sessions

GIVEN a session in state `failed` (e.g., simulator crash, irrecoverable PRNG
corruption)
WHEN the recovery worker tick fires
THEN the row is NOT selected — `failed` is terminal per ADR-013.

A `failed` session can be archived manually (admin tool, out of scope here)
but never auto-resumed.

### AC-MS18-09 — End-to-end determinism integration test

The cornerstone test for the epic.

GIVEN:
- A fixed seed (e.g., `"determinism-e2e-2026-05-19"`)
- A fixed lineup configuration (Real Pueblo vs CD Cinta, both with deterministic
  generated lineups per ADR-016)
- A fixed pre-match WorldState
- A fixed decision sequence at the substitution_window pauses (e.g., "sub at
  45'", "skip at 60'", "no sub at 75'")

WHEN the match is simulated TWICE in independent test runs (with full DB +
BullMQ wiring; integration-test scope, not unit-mocked)

THEN both runs produce:
- Identical MatchOutcome (homeScore, awayScore, winner)
- Identical events array (same minute, same type, same player, same severity)
- Identical worldStateDeltas (mpi_delta, injury_risk)
- Identical playerRatings (Record<string, number>)

This is the moral equivalent of slice's `match-determinism.test.ts` lifted to
the production stack with real BullMQ + DB.

### AC-MS18-10 — Pause-and-resume == one-shot (ADR-013 Option B verified at integration)

GIVEN the same inputs as AC-MS18-09 AND the substitution_window at minute 45
is paused-and-resumed (via the full /decision route + worker re-enqueue) vs.
a hypothetical one-shot pure-function run that skips the pause

WHEN both completed

THEN the post-tick-45 events + final score + worldStateDeltas are identical.

This is the integration-level proof that ADR-013 Option B (persist seedrandom
state in MatchSessionSnapshot.rngState) preserves the RNG stream across the
re-enqueue boundary.

### AC-MS18-11 — Performance budget per tick

GIVEN the integration test setup
WHEN the match worker processes 90 ticks
THEN the median per-tick processing time is ≤ 5ms (per match-simulation.md
performance budget mention) and the 95th percentile is ≤ 15ms.

If any per-tick exceeds 50ms → fail the test (flag for perf investigation).

## Dependencies

- **Upstream**: 015 (DB schema for match_sessions), 016 (match-worker
  enqueue + event emission API), 017 (routes that POST decisions)
- **Downstream**: hud-ui epic's live match UI consumes the Socket.IO events

## Estimate

**3 days.** Largest story in the epic. Includes:
- 1d: Socket.IO `/match` namespace + auth + room management + resync
- 0.75d: Recovery worker scheduler + SKIP LOCKED test
- 1d: End-to-end determinism integration test (the cornerstone)
- 0.25d: Performance budget validation

## Notes / Gotchas

- **Slice does NOT have Socket.IO streaming** — it used client-side `setTimeout` chains. Production starts fresh.
- **Socket.IO + Hono adapter**: research the correct integration approach for Hono 4 (the `@hono/node-server` engine reference doc has notes on attaching Socket.IO to the same HTTP server).
- **`SELECT FOR UPDATE SKIP LOCKED`**: known PostgreSQL idiom. Drizzle 0.36+
  supports `.for('update', { skipLocked: true })` in select chains — verify
  syntax against engine reference before writing the test.
- **Determinism test seed stability**: use a constant seed in the test file
  (NOT generated at test time) so the test is byte-stable across CI runs.
- **Performance budget machine variance**: CI machines differ from dev
  machines. Run with `vitest --bench` mode or a separate perf job that allows
  ~3× tolerance vs. local baseline.
- **Connection auth**: Socket.IO `/match` namespace must validate the
  session cookie on the upgrade handshake — see realtime-multiplayer
  specialist if approach unclear.
- **OQ-LIVE-05 (from UX spec)**: ×10 playback client clock-drift is a real
  issue. The `match:tick` heartbeats every 5 minutes mitigate it but the
  exact drift-correction algorithm on the client is out of scope here — flag
  for the hud-ui epic.

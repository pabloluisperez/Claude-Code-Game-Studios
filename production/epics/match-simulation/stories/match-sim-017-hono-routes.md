---
Story: MATCH-SIM-017
Status: Blocked
Last Updated: 2026-05-19
Type: Integration
Blocker: Depends on MATCH-SIM-015 + 016 which are blocked.
GDD Requirement: AC-MATCH-15 (substitution windows route), AC-MATCH-18 (timeout default decision), AC-MATCH-backend-mutex (mutual exclusion on POST /matches/:id/decision)
Governing ADR: ADR-013 (Match Session re-enqueue), ADR-015 (EventDecisionPayload for substitution_window), ADR-001 (Web stack — Hono 4)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/match-sim/match-routes.test.ts
---

# MATCH-SIM-017 — Hono routes: POST /matches/start + /matches/decision

## Overview

Expose the MatchSession FSM (story 014) and re-enqueue worker (story 016) via
two Hono POST endpoints. `/matches/start` initializes a new MatchSession for
the playthrough's current-week fixture and enqueues the first match-worker
job. `/matches/decision` accepts the player's substitution_window /
injury_pause response, cancels any pending timeout job, updates the
MatchSessionSnapshot, and re-enqueues the worker to resume from the saved
tick.

This is the API surface the SvelteKit web app calls. Production replaces the
slice's simpler controller pattern with full validation, session-lock
respect, idempotency, and instruction-validity checks.

## Acceptance Criteria

### AC-MS17-01 — POST /matches/start creates a session + enqueues worker

GIVEN a playthrough whose `currentWeek` has an unplayed fixture for the
manager's club AND no active MatchSession exists for the playthrough
WHEN the client posts `{ playthroughId }` to `/api/matches/start`
THEN the server:
- Verifies the partial UNIQUE INDEX (story 015) — if a row with
  state ∉ {completed, archived, failed} exists, returns **409 Conflict**
  with body `{ error: 'match_already_in_progress' }`
- Loads the fixture + lineups + WorldStateSnapshot
- Constructs the initial MatchSessionSnapshot via `buildInitialState()`
  (story 014) with the seedrandom PRNG factory using `{state: true}` (ADR-013)
- INSERTs the `match_sessions` row in state `pre_match`
- Enqueues a BullMQ match-worker job with `{ sessionId, isPlayerMatch: true }`
- Returns **201 Created** with body matching the LineupPlayerLite + session info
  schema (see story 014's return type)

### AC-MS17-02 — POST /matches/decision validates payload + state

GIVEN a MatchSession in state `paused_for_decision` with a pending timeout job
WHEN the client posts `{ sessionId, decision: SubstitutionDecision | null,
playerDecisionsForCascade: PlayerDecisions }` to `/api/matches/decision`
THEN the server:
- Validates the request body with Zod (per control-manifest cross-cutting rule)
- If `sessionId` does not exist → **404 Not Found**
- If the session state is NOT `paused_for_decision` → **409 Conflict** with
  body `{ error: 'session_not_paused', currentState: '<state>' }`
- If the decision violates the substitution invariants (more than 5 cambios used,
  player_in_id not in bench, etc.) → **400 Bad Request** with explicit error message
- Cancels the timeout job via `queue.remove(session.timeoutJobId)`
- Applies the decision atomically to the MatchSessionSnapshot
- Enqueues a new match-worker job (no delay) with `{ sessionId, isPlayerMatch }`
- Returns **200 OK** with `{ accepted: true }` (event stream continues via Socket.IO per story 018)

### AC-MS17-03 — Idempotent retry on /decision

GIVEN a /decision request that completed successfully
WHEN the client retries with the same `sessionId` (e.g., due to network jitter)
THEN the server detects the session is already in state `in_progress`
(transitioned from `paused_for_decision`) and returns **200 OK** with
`{ accepted: true, idempotent: true }` — no double-enqueue.

The idempotency check uses the session's current state as the discriminant. A
retry that arrives AFTER the session moved past `in_progress` (e.g., to
`completed`) returns **409 Conflict** with `{ error: 'session_already_completed' }`.

### AC-MS17-04 — COUNTER instruction is rejected for home team

GIVEN a substitution_window decision with `instruction: 'COUNTER'` on the home team
WHEN the request is posted to /decision
THEN the server returns **400 Bad Request** with
`{ error: 'instruction_invalid', detail: 'COUNTER cannot be used by the home team' }`
per match-simulation.md R4 (cross-review fix 2026-05-18).

The check happens at the route boundary (Zod refinement), NOT inside the
simulator — fail fast at the API.

### AC-MS17-05 — Mutual exclusion on simultaneous /decision attempts

GIVEN a session in `paused_for_decision` AND two clients (same user, different
tabs) both POST to /decision simultaneously
WHEN both requests arrive within ~10ms of each other
THEN exactly one succeeds (200), the other returns **409 Conflict** with
`{ error: 'session_state_changed' }`

The mechanism: `SELECT ... FOR UPDATE` on the match_sessions row inside the
decision transaction. The second request finds state ≠ `paused_for_decision`
and aborts. Per AC-MATCH-backend-mutex.

### AC-MS17-06 — Session lock honored at /start

GIVEN a session in any non-terminal state (`pre_match`, `in_progress`,
`paused_for_decision`)
WHEN /matches/start is called for the same playthrough
THEN returns **409 Conflict** per AC-MS17-01.

Specifically: a session in state `failed` does NOT block a new start (per
ADR-013 partial UNIQUE excludes `failed`). Story 015's partial UNIQUE INDEX
enforces this at the DB level.

### AC-MS17-07 — Decision payload uses ADR-015 EventDecisionPayload variants

GIVEN the decision payload represents a substitution_window
WHEN the route parses the body
THEN it validates against the `SubstitutionWindowPayload` variant of
`EventDecisionPayload` (per ADR-015 — when added as part of /matches/decision spec)
OR against the legacy raw `SubstitutionDecision` shape used by the slice (acceptable
for MVP if ADR-015 schema is too aspirational; document the deviation in story
acceptance review).

Slice used the raw shape; production migrates to the ADR-015 union form-by-form.

### AC-MS17-08 — All Hono routes use kebab-case paths

Per control-manifest naming conventions:
- `/api/matches/start` (not `/api/matches/Start` or `/api/matches/startMatch`)
- `/api/matches/decision`
- `/api/matches/:sessionId` (read endpoint, future)

## Dependencies

- **Upstream**: 014 (FSM), 015 (DB schema + repo), 016 (worker enqueue)
- **Downstream**: 018 (Socket.IO `/match` namespace emits events; route handlers may
  also broadcast acknowledgments via Socket.IO)

## Estimate

**2 days.** Includes:
- 0.5d: route scaffolding + Zod schemas
- 0.5d: idempotency + mutex tests (the trickiest part)
- 0.5d: COUNTER + bench validation rules
- 0.5d: integration tests (real DB + BullMQ in-memory) for the full pause-decide-resume flow

## Notes / Gotchas

- **Zod 3 vs Hono validator**: use `hono/zod-validator` middleware (per
  technical-preferences.md allowed libraries) to avoid hand-rolled validation in
  the handler.
- **SELECT FOR UPDATE timeout**: set a Postgres statement timeout (e.g., 5s) for
  the decision transaction so a stuck row doesn't hang clients indefinitely.
- **Idempotency vs at-most-once**: an idempotent retry of /decision must NOT
  double-enqueue the resume job. The route handler checks `session.state` BEFORE
  enqueuing — if already `in_progress`, return idempotent success.
- **CSRF**: out of scope for this story; assume session-cookie auth (per ADR-001)
  + same-site cookies handle it. If CSRF tokens are added later, this story's
  routes must accept them.
- **Rate limiting**: not enforced at the route — sessions are 1-per-playthrough
  so the partial UNIQUE INDEX is the effective rate limit.
- **Future**: a GET /matches/:sessionId/snapshot endpoint will be needed for
  Socket.IO reconnection resync (story 018) — not implemented here, just noted.

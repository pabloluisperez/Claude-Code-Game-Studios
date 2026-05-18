# ADR-013: Match Session Pattern (Stateful Re-enqueue)

## Status
Accepted

## Date
2026-05-18 (created in match-simulation R2 review — resolves OQ-MATCH-01)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Simulation / Backend |
| **Knowledge Risk** | LOW — BullMQ patterns, TypeScript, no post-cutoff APIs |
| **References Consulted** | ADR-007 (SportPlugin pure function), ADR-002 (determinism), ADR-005 (worldstate persistence), BullMQ delayed jobs docs |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Implement re-enqueue pattern and verify MatchSessionSnapshot survives server restart |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext + ctx.rng() for determinism), ADR-007 (simulateMatch pure function — this ADR extends it), ADR-005 (world_snapshots persistence) |
| **Enables** | match-simulation.md GDD epics — this ADR must be Accepted before writing any epic |
| **Blocks** | Epic planning for match-simulation — OQ-MATCH-01 resolution |
| **Ordering Note** | ADR-007 remains valid for one-shot cascade-engine usage. ADR-013 adds the interactive stateful match pattern as a separate contract. |

## Context

### Problem Statement

ADR-007 defines `simulateMatch` as a **pure function** — no side effects, no I/O. This is correct for the cascade engine's weekly tick where `processMatchWeek` calls `simulateMatch` once and gets a `MatchOutcome`.

However, `match-simulation.md` GDD introduces a second usage pattern: the **interactive match session** where the player watches a tick-by-tick simulation and makes decisions at pause windows (injury subs, formation changes at minutes 45/60/75). This pattern is fundamentally stateful:

1. The simulation must pause mid-execution and wait for player input.
2. State must persist between pause and resume (which can span up to 24 hours).
3. The simulation runs as a server-side job (BullMQ), not a pure function call.
4. Socket.IO emits real-time events to the client — side effects are required.

ADR-007's pure function contract is violated by this usage. This ADR resolves the tension by separating the two patterns explicitly.

### Constraints

- BullMQ does NOT support suspending a job mid-execution. A job that `await`s indefinitely blocks the worker slot.
- The PRNG stream must remain reproducible across job re-executions.
- Server crashes must not lose match state.
- A club must never have two active MatchSessions simultaneously (would corrupt WorldState deltas).

## Decision

**Two separate contracts co-exist:**

1. **`simulateMatch()` (ADR-007, unchanged)** — pure function, used by cascade engine for the weekly tick simulation and for any offline simulation (e.g., preview mode, opponent simulation). Lives in `packages/shared/src/sim/sports/football/football-plugin.ts`. No I/O, no side effects.

2. **`MatchSession` (this ADR)** — stateful interactive session using the **re-enqueue pattern**. Lives in `apps/api/src/match/`. Has I/O (DB, Socket.IO). Used only for the player-facing interactive match experience.

### Re-enqueue Pattern

BullMQ jobs are atomic — they run to completion. The re-enqueue pattern simulates "pause" behavior without blocking worker slots:

```
MatchWorker.process(job):
  1. Load MatchSessionSnapshot from DB (or create from WorldState if first job)
  2. Run ticks from snapshot.currentTick until:
     a. A pause event is reached (injury, substitution_window at 45/60/75), OR
     b. Tick 90 is reached (match complete)
  3. If pause event reached:
     a. Write updated MatchSessionSnapshot to DB
     b. Create BullMQ delayed job: delay = decisionTimeoutMs, save timeoutJobId in match_sessions
     c. Emit Socket.IO event: { type:'match_pause', events_so_far, decision_type, options }
     d. Complete this job (slot is freed)
  4. If tick 90 reached:
     a. Apply worldStateDeltas to cascade engine
     b. Update MatchSession.state = 'completed'
     c. Emit Socket.IO: { type:'match_complete', finalScore, ... }

POST /matches/:id/decision (handler):
  1. Cancel delayed timeout job (queue.remove(session.timeoutJobId))
  2. Apply decision to MatchSessionSnapshot in DB
  3. Enqueue new MatchWorker job (no delay)

Timeout job fires (if manager does not decide):
  1. Apply default conservative decision to MatchSessionSnapshot
  2. Enqueue new MatchWorker job
```

### MatchSessionSnapshot

Persisted in `match_sessions` table between job executions:

```typescript
interface MatchSessionSnapshot {
  currentTick: number;
  eventsAccumulated: MatchEvent[];
  currentLineupHome: PlayerSlot[];    // post-substitutions applied
  currentLineupAway: PlayerSlot[];
  homeMomentum: number;
  substitutionsUsed: number;          // shared pool (voluntary + forced by injury)
  yellowCardsByPlayerId: Record<string, number>;
  state: 'pre_match' | 'in_progress' | 'paused_for_decision' | 'completed' | 'archived';
  timeoutJobId: string | null;
  // PRNG state: see PRNG Reproducibility section below
}
```

### PRNG Reproducibility

ADR-002 guarantees that given the same seed + same decisions, `simulateMatch` produces identical output. For re-enqueue to be reproducible, one of these must hold:

**Option A (preferred): Fixed RNG consumption per tick.** The football algorithm guarantees a fixed number of `ctx.rng()` calls per tick regardless of lineup composition. This means: given the same seed, running ticks 1-44, pausing, and resuming from tick 45 produces the same results as running all 90 ticks without pausing. The algorithm must be designed with this constraint in mind (e.g., always consume a fixed sequence of rng calls per tick even if some are unused).

**Option B (fallback): Persist PRNG state.** If fixed RNG consumption cannot be guaranteed, `MatchSessionSnapshot` must include the serialized PRNG state after each tick batch. `seedrandom` supports serialization. Use this if the algorithm cannot guarantee fixed calls.

**Decision**: Implement Option A. If it proves infeasible during implementation, fall back to Option B and update this ADR.

### Session Lock

Constraint at DB level prevents concurrent MatchSessions for the same playthrough:

```sql
CREATE UNIQUE INDEX match_sessions_active_playthrough
  ON match_sessions(playthrough_id)
  WHERE state NOT IN ('completed', 'archived');
```

`POST /matches/:id/start` returns `409 Conflict` with `{ error: 'match_already_in_progress' }` if this constraint is violated.

### File Locations

```
apps/api/src/
└── match/
    ├── match-session.ts        # MatchSession FSM + MatchSessionSnapshot type
    ├── match-worker.ts         # BullMQ worker — re-enqueue pattern implementation
    ├── match-routes.ts         # Hono routes: POST /matches/:id/start, /decision
    └── match-socket.ts         # Socket.IO emitter adapter (injectable via SimContext)
```

The `MatchEventEmitter` interface is injected into the simulation context so that unit tests can spy on emissions without a real Socket.IO server:

```typescript
interface MatchEventEmitter {
  emit(event: MatchPauseEvent | MatchCompleteEvent): void;
}
```

## Alternatives Considered

### Alternative A: Long-polling job (job awaits decision in Redis pub/sub)

- **Description**: The BullMQ job stays active and awaits a Redis pub/sub message to resume.
- **Pros**: Simpler conceptual model — one job per match.
- **Cons**: Blocks a worker slot for up to 24 hours per paused match. With 4 concurrent matches paused, the worker is fully occupied. Fragile under server restarts.
- **Rejection**: Re-enqueue pattern has identical user-facing behavior without consuming worker slots.

### Alternative B: Separate "simulation engine" process (not BullMQ)

- **Description**: Run the match simulation in a dedicated long-running process per match.
- **Pros**: No re-enqueue complexity.
- **Cons**: Requires process management, health checks, and crash recovery infrastructure. Overkill for a game with expected concurrency of 1-100 simultaneous matches.
- **Rejection**: BullMQ already provides job queuing, retry logic, and delayed jobs. Re-enqueue is a BullMQ-native pattern.

## Consequences

### Positive

- Worker slots never blocked by paused matches.
- Server crashes are safe: BullMQ automatically re-queues `active` jobs on restart; `MatchSessionSnapshot` in DB ensures the re-started job continues from the correct state.
- `simulateMatch` pure function (ADR-007) remains untouched — it's still used by cascade engine and can be used for offline simulation/preview.
- `MatchEventEmitter` injectable interface makes the simulation unit-testable without Socket.IO.

### Negative

- More complex than a single job — re-enqueue requires careful snapshot management.
- `timeoutJobId` correlation: if the delayed job is created but the server crashes before `timeoutJobId` is saved to DB, the timeout job will fire even if the manager decides. Mitigation: save `timeoutJobId` in the same DB transaction as the `MatchSessionSnapshot`.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| PRNG divergence after substitution | MEDIUM | HIGH | Implement fixed RNG consumption per tick (Option A); test with AC-02 |
| Duplicate session creation (race condition) | LOW | HIGH | UNIQUE INDEX + 409 response |
| Snapshot write fails mid-match | LOW | MEDIUM | Wrap snapshot write + job creation in DB transaction |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `match-simulation.md` | Interactive pause/resume at injury and substitution windows | Re-enqueue pattern with MatchSessionSnapshot |
| `match-simulation.md` OQ-MATCH-01 | Reconcile ADR-007 pure function with stateful match session | Two separate contracts: simulateMatch (ADR-007) + MatchSession (this ADR) |
| `match-simulation.md` OQ-MATCH-05 | Server crash recovery during paused match | BullMQ job re-queue on restart + DB snapshot |
| `match-simulation.md` | Session lock — no concurrent matches per club | UNIQUE INDEX WHERE state NOT IN ('completed', 'archived') |

## Performance Implications

- Each match pause creates one DB write (MatchSessionSnapshot) + one BullMQ delayed job.
- Expected: 3-4 pauses per match (injuries + sub windows). At 100 concurrent matches: 300-400 DB writes/hour — negligible.
- Socket.IO events: real-time per match event. Peak load: 90 events/match at ~1 event/second. At 100 concurrent matches: 9,000 events/minute — within Socket.IO capacity.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — ctx.rng() PRNG determinism — foundational for reproducibility
- [ADR-005](ADR-005-worldstate-persistence.md) — world_snapshots persistence — MatchOutcome stored here after completion
- [ADR-007](ADR-007-sport-agnostic-match-sim.md) — simulateMatch pure function — extended (not replaced) by this ADR
- [ADR-008](ADR-008-world-clock-event-loop.md) — world clock that triggers match week processing
- `design/gdd/match-simulation.md` — full GDD specification of the football match simulation

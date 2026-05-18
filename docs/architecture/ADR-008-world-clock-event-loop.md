# ADR-008: World Clock + Event Loop Architecture

## Status
Accepted

## Date
2026-05-16 (Proposed) → 2026-05-16 (Accepted, post-architecture-review run 2)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Hono + Drizzle + PostgreSQL) |
| **Knowledge Risk** | LOW — Hono 4, Drizzle 0.36+, BullMQ 5, PostgreSQL 16: all stable, post-cutoff risk minimal |
| **References Consulted** | `docs/engine-reference/web/modules/backend.md`, `docs/engine-reference/web/VERSION.md` |
| **Post-Cutoff APIs Used** | None — Hono route pattern, Drizzle pgTable, DB transactions: all stable API surface |
| **Verification Required** | Verify batch advance returns correct state for N=1 and N=4 weeks; verify transaction atomicity on BLOCKING threshold stop |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext.worldClock — week number passed to sim functions), ADR-003 (evaluateTick() signature — this ADR requires TickResult to expose thresholdCrossings), ADR-005 (playthroughs.currentWeek + worldSnapshots — the persistence layer this ADR uses) |
| **Enables** | ADR-009 (Staff Message Routing — triggered post-advance, after events are consumed), ADR-011 (League Schema — generates match fixture calendar events at season start), ADR-012 (UI Architecture — reads nextEventPreview for HUD display) |
| **Blocks** | Epic event-system — cannot start without this ADR Accepted; Epic hud-ui anticipated-event feature |
| **Ordering Note** | ADR-008 Accepted → event-system.md GDD → league-system.md GDD (fixture generation) → hud-ui.md GDD. ADR-009 can begin in parallel once ADR-008 is Accepted. |

## Context

### Problem Statement

The game's core loop is "take decision → skip to next event → read feedback". Without a defined architecture, implementers must independently answer: who advances `currentWeek`, how many weeks does a "skip" advance, what counts as an event worth stopping at, and how does the cascade engine signal threshold-crossing situations that should interrupt a skip. These decisions touch the cascade engine (ADR-003), the persistence layer (ADR-005), and the HUD (ADR-012 future), and must be consistent across all systems before any of them can be implemented.

The architecture review (2026-05-16) identified this as a Priority 1 architectural gap blocking `event-system.md`, `league-system.md`, and `hud-ui.md` GDDs.

### Constraints

- Weekly tick is the fundamental simulation unit (ADR-003)
- `currentWeek` already lives in `playthroughs.currentWeek` (ADR-005)
- Server-authoritative: all tick computations run in `apps/api/` (ADR-001)
- **Pilar 4 "Calm Is The Tempo"**: the clock waits for the player — no autonomous time advance
- `SimContext.worldClock` is the in-game week (not `Date.now()`) — `Date.now()` in sim is forbidden (ADR-002)
- BullMQ is reserved for async operations; the cascade tick is synchronous TypeScript
- Single developer → implementation simplicity matters; over-engineering for future scale is explicitly rejected

### Requirements

- Player triggers time advancement (not autonomous)
- "Skip to next event" as the primary UX: server computes N weeks, not the client
- Calendar events pre-generated per season (matches, deadlines, board meetings)
- Dynamic events from cascade threshold crossings can interrupt a skip
- "Anticipated next event" queryable for HUD display and retention hook
- All intermediate weeks persisted as snapshots (ADR-005)
- Deterministic: same sequence of advance calls from same snapshot → same outcomes (ADR-002)

## Decision

**Player-triggered skip-to-next-event with synchronous batch tick processing. Calendar events pre-persisted per season. Dynamic events from cascade threshold callbacks. No BullMQ for tick advance.**

### Advance Model

```
POST /api/game/advance
  → game-clock-service: query next STOP event week
  → for each week W from currentWeek+1 to nextStopWeek:
      tick = evaluateTick(ctx, graph, prevState, playerDecisions, pending)
      collect thresholdCrossings
      if any crossing.priority === 'BLOCKING':
        record pendingDynamicEvent at W → stop loop
      persist worldSnapshot(W) [deferred to transaction]
  → db.transaction:
      INSERT all snapshots
      UPDATE playthroughs.currentWeek = finalWeek
      MARK calendar event consumed
      INSERT pendingDynamicEvent (if any)
  → return AdvanceResult
```

No client-supplied N. Server derives the destination week from the `calendar_events` table.

### Architecture Diagram

```
Player clicks "Advance"
        │
        ▼
POST /api/game/advance
        │
        ▼
game-clock-service
  │
  ├─► SELECT FROM calendar_events
  │   WHERE playthrough_id = X AND week > currentWeek
  │   AND consumed = false ORDER BY week LIMIT 1
  │   → nextStopWeek
  │
  └─► loop W = currentWeek+1 .. nextStopWeek
        │
        ├─► evaluateTick(ctx, graph, prevState, decisions, pending)
        │   returns TickResult {
        │     nextState, newDelayedEffects, log,
        │     thresholdCrossings: ThresholdCrossing[]   ← new (see Consequences)
        │   }
        │
        ├─► collect snapshot for W
        │
        └─► if any crossing.priority === 'BLOCKING':
              pendingDynamicEvent = { week: W, crossings }
              break
  │
  ▼
db.transaction:
  ├─ INSERT worldSnapshot for each collected week
  ├─ UPDATE playthroughs.currentWeek = finalWeek
  ├─ MARK calendar event at finalWeek consumed → consumedEvents
  └─ INSERT dynamic event (if pendingDynamicEvent)

RETURN AdvanceResult {
  finalWeek, weeksAdvanced, eventsTriggered,
  thresholdCrossings, nextEventPreview
}
```

### Key Interfaces

```typescript
// packages/shared/src/types/game-clock.ts

export type CalendarEventType =
  | 'match'
  | 'transfer_window_open'
  | 'transfer_window_close'
  | 'end_of_month'
  | 'board_meeting'
  | 'season_end'
  | 'dynamic'             // threshold-triggered at runtime
  | 'manager_level_up';   // additive extension by ADR-010; requires `assertNever` audit on switch sites

export type CalendarEventPriority = 'STOP' | 'NOTIFY';
// STOP   → advance halts at this week (match day, blocking dynamic event)
// NOTIFY → advance records it but continues to next STOP event

export interface CalendarEvent {
  id: string;
  playthroughId: string;
  week: number;
  season: number;
  type: CalendarEventType;
  priority: CalendarEventPriority;
  metadata: Record<string, unknown>;  // fixtureId for 'match', nodeId for 'dynamic'
}

export interface ThresholdCrossing {
  nodeId: string;           // WorldState node that crossed a threshold
  previousValue: number;
  newValue: number;
  direction: 'above' | 'below';
  priority: 'BLOCKING' | 'ADVISORY';
  // BLOCKING → stops the advance loop at this week
  // ADVISORY → recorded but advance continues
}

export interface AdvanceResult {
  finalWeek: number;
  weeksAdvanced: number;
  eventsTriggered: CalendarEvent[];     // calendar events consumed + any new dynamic events
  thresholdCrossings: ThresholdCrossing[];
  nextEventPreview: Pick<CalendarEvent, 'week' | 'type'> | null;
}
```

### Drizzle Schema Addition

```typescript
// packages/db/src/schema/calendar.ts

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  type: text('type').notNull(),            // CalendarEventType values
  priority: text('priority').notNull(),     // 'STOP' | 'NOTIFY'
  metadata: jsonb('metadata')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [calendarEvents.playthroughId],
    references: [playthroughs.id],
  }),
}));

// Migration must include:
// CREATE INDEX idx_calendar_events_next
//   ON calendar_events(playthrough_id, week)
//   WHERE consumed = false;
```

### Service Pseudocode (corrected)

```typescript
// apps/api/src/modules/game-clock/service.ts
async function advance(playthroughId: string): Promise<AdvanceResult> {
  const playthrough = await repo.findPlaythrough(playthroughId);
  const nextEvent = await repo.findNextEvent(playthroughId, playthrough.currentWeek);
  const nextStopWeek = nextEvent?.week ?? playthrough.currentWeek + 1;

  const snapshots: WorldSnapshot[] = [];
  let state = await repo.loadCurrentWorldState(playthroughId);
  let finalWeek = playthrough.currentWeek;
  const allCrossings: ThresholdCrossing[] = [];
  let pendingDynamic: { week: number; crossings: ThresholdCrossing[] } | null = null;

  for (let w = playthrough.currentWeek + 1; w <= nextStopWeek; w++) {
    const ctx: SimContext = {
      worldClock: w,
      rng: seedrandom(buildSeed(playthroughId, w)),
    };
    const tick = evaluateTick(ctx, graph, state.worldState, decisions, state.pending);

    snapshots.push({ playthroughId, week: w, worldState: tick.nextState });
    allCrossings.push(...tick.thresholdCrossings);

    const blocking = tick.thresholdCrossings.filter(c => c.priority === 'BLOCKING');
    if (blocking.length > 0) {
      pendingDynamic = { week: w, crossings: blocking };
      finalWeek = w;
      break;
    }

    state = { worldState: tick.nextState, pending: tick.newDelayedEffects };
    finalWeek = w;
  }

  const consumedEvents: CalendarEvent[] = [];

  await db.transaction(async (tx) => {
    for (const snap of snapshots) await repo.insertSnapshot(tx, snap);
    await repo.updateCurrentWeek(tx, playthroughId, finalWeek);
    const consumed = await repo.markEventConsumed(tx, playthroughId, finalWeek);
    if (consumed) consumedEvents.push(consumed);
    if (pendingDynamic) {
      const dynEvent = await repo.insertDynamicEvent(
        tx, playthroughId, pendingDynamic.week, pendingDynamic.crossings
      );
      consumedEvents.push(dynEvent);
    }
  });

  const nextPreview = await repo.findNextEvent(playthroughId, finalWeek);
  return {
    finalWeek,
    weeksAdvanced: finalWeek - playthrough.currentWeek,
    eventsTriggered: consumedEvents,
    thresholdCrossings: allCrossings,
    nextEventPreview: nextPreview
      ? { week: nextPreview.week, type: nextPreview.type }
      : null,
  };
}
```

### Season Calendar Generation

At season start, `season-service` pre-inserts all scheduled events:

| Event Type | Priority | Generated By |
|------------|----------|-------------|
| `match` | `STOP` | league-system (ADR-011) — fixture schedule |
| `end_of_month` | `STOP` | season-service — every 4th week |
| `transfer_window_open` | `STOP` | season-service — per competition calendar |
| `transfer_window_close` | `STOP` | season-service — per competition calendar |
| `board_meeting` | `STOP` | season-service — once per month |
| `season_end` | `STOP` | season-service — final week of season |

Until `league-system.md` GDD is complete, season-service generates only non-match events. Match fixture events are inserted once the league system is implemented.

### BullMQ Usage

**Not used for tick advance.** The cascade simulation is synchronous TypeScript (<100ms per tick; typical advance N ≤ 4 ticks). BullMQ remains reserved for:
- Narrative AI text generation (ADR-004) — triggered after `advance()` completes, async
- Season calendar generation at season start — background job, non-blocking

## Alternatives Considered

### Alternative 1: Player-specified N weeks (`POST /advance/{n}`)
- **Description**: Client computes how many weeks to advance and passes N to the API.
- **Pros**: Simple API, flexible for edge cases.
- **Cons**: Moves "what is the next event?" logic to the client. Client must query events separately before calling advance. Breaks server-authoritative principle.
- **Rejection Reason**: Server owns calendar and cascade outcomes. Client should not compute simulation boundaries.

### Alternative 2: 1-week primitive, skip-to-event as N client calls
- **Description**: The API advances exactly 1 week per call. The UI calls it N times for skip-to-event.
- **Pros**: Simplest possible API contract.
- **Cons**: HTTP round-trip per week; 4+ calls for a "skip to end of month". Each call loads WorldState from DB. Higher latency (perceived and actual).
- **Rejection Reason**: Skip-to-event is the primary UX. Multiple round-trips degrade the experience without any correctness or architectural benefit.

### Alternative 3: BullMQ async advance
- **Description**: Player enqueues a tick job; BullMQ worker processes; Socket.IO notifies completion.
- **Pros**: Non-blocking HTTP; handles slow simulations; naturally queued for concurrent users.
- **Cons**: Adds async complexity (job state, Socket.IO coordination) for an operation that completes in <500ms. Over-engineering for MVP single-player.
- **Rejection Reason**: The simulation is fast. BullMQ adds latency (job queue round-trip) without benefit. Reserved for AI text generation where latency is expected.

### Alternative 4: Extend `DelayedEffectsBuffer` for calendar events
- **Description**: Calendar events are stored as special `DelayedEffect` entries (ADR-003 concept).
- **Pros**: No new table; reuses existing infrastructure.
- **Cons**: Conflates simulation effects (cascade deltas) with game loop control (match day, transfer deadline). Makes the simulation layer aware of game structure decisions.
- **Rejection Reason**: Single-responsibility principle. The cascade engine computes state; the calendar system controls game loop flow. These are different concerns.

## Consequences

### Positive
- Single `POST /api/game/advance` endpoint encapsulates the core game loop action
- Server always owns "what comes next" — correct for server-authoritative architecture
- `nextEventPreview` in `AdvanceResult` enables the "anticipated event" HUD retention hook trivially
- Threshold crossing contract cleanly decouples cascade engine from event storage: engine returns crossings, service decides what to do
- All persistence is in a single transaction — no partial state on failure
- BullMQ remains reserved for genuinely async operations

### Negative
- `calendar_events` table must be populated at season start — if `league-system.md` GDD is not yet written, match fixture events are unavailable (only non-match events can be inserted until ADR-011 is complete)
- **ADR-003 `TickResult` must be extended**: ADR-003 defines `evaluateTick() → TickResult` without specifying `TickResult`'s fields. This ADR requires `TickResult` to include `thresholdCrossings: ThresholdCrossing[]`. ADR-003 must be updated with this addition before implementation begins.
- Threshold crossing thresholds must be configured per node in the cascade graph definition (adds data requirements to `cascade-engine.md` GDD)

### Risks
- **R1 — HTTP timeout on very long skips**: If a future scenario requires processing 38+ weeks in one call. **Mitigation**: STOP events are placed at every match (every ~1-2 weeks). The advance loop always halts at a STOP event. A 38-week skip never happens in practice because match days are STOP events.
- **R2 — Calendar events table growth**: Many seasons × many events per season. **Mitigation**: `consumed` flag + periodic cleanup of past-season events. Future: archive table strategy.
- **R3 — Threshold tuning surface**: Too sensitive interrupts advances too often; too lenient misses critical state changes. **Mitigation**: Threshold config lives in cascade graph definition (GDD-owned, data-driven per ADR-003). Adjustable without code changes.
- **R4 — ADR-011 dependency**: Until league fixtures are generated, the advance system works but match events are absent. **Mitigation**: Game-clock service must gracefully handle an empty calendar (advance 1 week when no events found) rather than throwing.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | Skip-por-eventos (MVP req #7) | `POST /api/game/advance` → server-computed N to next STOP event |
| game-concept.md | Anticipated event HUD retention hook | `nextEventPreview` in `AdvanceResult`; also queryable via `GET /api/game/next-event` |
| game-concept.md | Pilar 4: "el reloj te espera" | No autonomous timer; advance only on explicit player action |
| game-concept.md | Short-term loop: "semana de partido como unidad" | Match events are `STOP` priority — every match triggers a halt |
| game-concept.md | 30-second loop step 3: "avanzar tiempo (skip hasta próximo evento)" | Implemented by `POST /api/game/advance` |
| game-concept.md | Session hook: "próximo gran evento queda apuntado como gancho" | `nextEventPreview` surfaces this to the HUD after every advance |

## Performance Implications

- **CPU**: N `evaluateTick()` calls per advance. N ≤ ~4 for typical skip-to-match. Peak: ~8 for two matches in quick succession. At <10ms per tick: ≤80ms compute.
- **Memory**: N `WorldState` snapshots held in memory during batch. WorldState ~50-200 keys × 8 bytes = <2KB per state. N=8 → <16KB peak. Negligible.
- **Load Time**: Not applicable.
- **Network**: Single HTTP request/response. Response payload: `AdvanceResult` with snapshot + events list. Estimated <20KB.
- **DB**: N `INSERT` (worldSnapshots) + 1 `UPDATE` (currentWeek) + 1 `SELECT` (next event) + M `INSERT` (dynamic events, M usually 0). All within a single DB transaction.

## Migration Plan

No existing code to migrate. New tables and service.

1. Create `calendar_events` Drizzle migration
2. Add `calendarEventsRelations` to `packages/db/src/schema/calendar.ts`
3. Implement `game-clock-service` wrapping existing `evaluateTick()` from ADR-003
4. Update `TickResult` type in `packages/shared/src/sim/` to include `thresholdCrossings`
5. Implement `season-service` to generate non-match calendar events at season start
6. Implement `POST /api/game/advance` and `GET /api/game/next-event` Hono routes

Match fixture calendar events are added when `league-system.md` GDD is implemented.

## Validation Criteria

- `POST /advance` with `currentWeek=1` and a match event at `week=3`: returns `finalWeek=3`, `eventsTriggered` includes the match event, `worldSnapshots` for weeks 2 and 3 exist in DB.
- `POST /advance` with a `BLOCKING` threshold crossing at `week=2`: returns `finalWeek=2`, advance halted before week 3, dynamic event inserted in DB within the same transaction.
- `GET /api/game/next-event` returns the same week as `AdvanceResult.nextEventPreview`.
- Determinism: calling advance twice from the same snapshot (same seed) returns identical `AdvanceResult` (same `thresholdCrossings`, same `finalWeek`).
- No partial state on DB transaction failure: if `updateCurrentWeek` fails, no orphaned snapshots or dynamic events exist.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — `SimContext.worldClock` is the week number passed to sim functions; `Date.now()` in sim is forbidden
- [ADR-003](ADR-003-cascade-graph-topology.md) — `evaluateTick()` signature; `TickResult` must be extended with `thresholdCrossings: ThresholdCrossing[]`
- [ADR-005](ADR-005-worldstate-persistence.md) — `playthroughs.currentWeek` and `worldSnapshots` persistence layer
- ADR-009 (future) — Staff message delivery is triggered post-advance, after events are consumed
- ADR-011 (future) — League schema generates match fixture calendar events at season start
- ADR-012 (future) — UI Architecture reads `nextEventPreview` for HUD anticipated-event display

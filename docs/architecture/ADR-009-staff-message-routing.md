# ADR-009: Staff Message Routing & Granularity

## Status
Accepted

## Date
2026-05-16 (Proposed) → 2026-05-16 (Accepted, post-architecture-review run 2)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend + Realtime (BullMQ 5 + Socket.IO 4 + Drizzle) |
| **Knowledge Risk** | LOW — BullMQ 5, Socket.IO 4, Drizzle 0.36+: all stable, verified in VERSION.md |
| **References Consulted** | `docs/engine-reference/web/modules/backend.md`, `docs/engine-reference/web/modules/realtime.md`, `docs/engine-reference/web/VERSION.md` |
| **Post-Cutoff APIs Used** | None — BullMQ Worker, Socket.IO `io.to().emit()`, Drizzle pgTable: all stable API surface |
| **Verification Required** | Verify Socket.IO push reaches client within 500ms of advance completing; verify message count is bounded per-staff per-week (anti-spam); verify no messages emitted when BullMQ job fails (atomicity) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext — worldClock available in perception logic), ADR-003 (WorldState type, ThresholdCrossings contract), ADR-004 (Narrative AI pipeline — staff messages are template-based in MVP; ADR-004 enrichment path reserved for post-MVP), ADR-008 (advance() lifecycle — staff message job enqueued after advance commits) |
| **Enables** | `staff-system.md` GDD (can specify staff roles, domains, quality tiers), `hud-ui.md` GDD (can design the message inbox panel), ADR-010 (Manager-RPG progression affects staff quality, which determines message granularity per this ADR) |
| **Blocks** | Epic staff-system — cannot start without this ADR Accepted; Epic hud-ui inbox feature |
| **Ordering Note** | ADR-008 Accepted → ADR-009 Accepted → staff-system.md GDD → hud-ui.md GDD. ADR-010 (Manager-RPG) can be written in parallel but must reference the `StaffPerceptionConfig.qualityTier` contract defined here. |

## Context

### Problem Statement

The game's 30-second loop is "take decision → skip to next event → read feedback". The "read feedback" step is implemented by staff messages — contextual observations from staff members who each perceive their domain of the WorldState. Without a defined architecture, implementers must independently answer: when are messages generated, how does staff quality affect what they report, how are messages delivered, and where are they stored. The system connects three pillars (Pilar 3: staff quality reveals world, Pilar 1: cascades partially hidden, Pilar 4: calm tempo) and must not break any of them.

The architecture review (2026-05-16) identified this as Priority 2 architectural gap blocking `staff-system.md` and `hud-ui.md` GDDs.

### Constraints

- Staff messages are the **primary feedback mechanism** — they must arrive promptly after advance completes
- Pilar 1: Messages must hint at cascades, not expose them. Low-quality staff gives vague observations; expert staff gives causal insight. Neither gives away the formula.
- Pilar 3: Staff quality (hired by the player) determines message granularity — this is how "you grow like your club" manifests mechanically
- Pilar 4: No autonomous message generation; messages are produced by advances, not by real-time timers
- llama.cpp (ADR-004) cost is an open risk (TR1). Staff messages must not depend on AI in MVP.
- Server-authoritative (ADR-001): all generation runs in `apps/api/`
- BullMQ is already in the stack for async jobs (ADR-004 uses it for AI text generation)
- **Deployment constraint**: BullMQ worker and Socket.IO server run in the same Node.js process in MVP. If multi-process deployment is ever required, the io-import pattern must be replaced with Redis pub/sub via `@socket.io/redis-adapter`. This constraint is enforced via startup guard.

### Requirements

- Messages generated post-advance (not during the advance HTTP call)
- Staff quality tier (1–3) controls perception sensitivity (threshold for noticing changes)
- All messages are template-based in MVP — no llama.cpp per message
- Messages delivered via Socket.IO push within ~500ms of advance completion
- Messages persisted in DB (player can review inbox, messages survive page reload)
- Anti-spam: max messages per staff member per week (configurable)
- URGENT messages (from BLOCKING threshold crossings) bypass the spam limit

## Decision

**Asynchronous post-advance generation via BullMQ. Quality-tiered threshold sensitivity. Template library in `packages/shared`. Socket.IO push delivery from in-process worker. All MVP messages are template-based.**

### Architecture Diagram

```
POST /api/game/advance completes → DB committed
        │
        ├─► return AdvanceResult to client (immediate)
        │
        └─► staffMessagesQueue.add('generate', jobData)
                │
                ▼
        BullMQ Worker (same process as Socket.IO)
                │
                ├─► load active staff for playthroughId
                │
                ├─► for each staff member:
                │     config = buildPerceptionConfig(staffMember)
                │     for each nodeId in config.domain:
                │       delta = |newValue - prevValue| / nodeRange
                │       threshold = config.baseThresholdPct * qualityFactor(config.qualityTier)
                │       if delta >= threshold:
                │         key = '{role}:{nodeId}:{direction}:{qualityTier}'
                │         content = STAFF_MESSAGE_TEMPLATES[key]
                │         add to generatedMessages (if under spam limit)
                │
                ├─► INSERT generatedMessages → staff_messages table
                │
                └─► io.to(`playthrough:${playthroughId}`)
                      .emit('staff:messages-ready', { messages })
                          │
                          ▼
                    SvelteKit client receives push → updates inbox
```

### Key Interfaces

```typescript
// packages/shared/src/types/staff-messages.ts

export type StaffRole =
  | 'groundskeeper'
  | 'fitness_coach'
  | 'commercial_director'
  | 'scouting_director'
  | 'finance_director'
  | 'head_coach';

export type MessagePriority = 'URGENT' | 'ROUTINE';
// URGENT — triggered by BLOCKING threshold crossings (ADR-008); bypasses spam limit
// ROUTINE — normal informational observation

export interface StaffPerceptionConfig {
  staffId: string;
  role: StaffRole;
  qualityTier: 1 | 2 | 3;      // 1 = novice, 2 = experienced, 3 = expert
  domain: string[];              // NodeId[] — WorldState nodes this staff member perceives
  baseThresholdPct: number;      // minimum % change to notice; multiplied by qualityFactor:
                                 //   tier 1: × 3.0 (crude — only large changes)
                                 //   tier 2: × 1.5 (moderate sensitivity)
                                 //   tier 3: × 1.0 (fine sensitivity, near-baseline)
}

export interface StaffMessage {
  id: string;
  playthroughId: string;
  staffId: string;
  week: number;
  season: number;
  priority: MessagePriority;
  templateKey: string;           // '{StaffRole}:{NodeId}:{above|below}:{1|2|3}'
  content: string;               // rendered template
  isRead: boolean;
  createdAt: string;
}

// Socket.IO event emitted to 'playthrough:{playthroughId}' room
export interface StaffMessagesReadyEvent {
  playthroughId: string;
  week: number;
  messages: StaffMessage[];
}

// BullMQ job payload
export interface StaffMessageJobData {
  playthroughId: string;
  finalWeek: number;
  season: number;
  thresholdCrossings: ThresholdCrossing[];        // from ADR-008 TickResult
  worldStateDiff: Record<string, { prev: number; next: number }>;
}
```

### Template Library

```typescript
// packages/shared/src/data/staff-message-templates.ts
// Key: '{StaffRole}:{NodeId}:{direction}:{qualityTier}'
// Direction: 'above' (value went up) | 'below' (value went down)
// Post-MVP: keys can include {season}, {week} for calendar-aware messages

// TemplateKey is string for MVP flexibility; tighten to template literal post-MVP
// when the full NodeId catalog is stable (cascade-engine.md GDD).

export const STAFF_MESSAGE_TEMPLATES: Readonly<Record<string, string>> = {
  // Groundskeeper — field_quality
  'groundskeeper:field_quality:below:1': 'El campo está deteriorándose.',
  'groundskeeper:field_quality:below:2': 'El campo necesita atención — los jugadores están notando el estado del césped.',
  'groundskeeper:field_quality:below:3': 'El deterioro del campo está aumentando el riesgo de lesiones. Invertir esta semana evitaría problemas en los próximos partidos.',
  'groundskeeper:field_quality:above:1': 'El campo está mejor.',
  'groundskeeper:field_quality:above:2': 'El campo ha mejorado — los jugadores estarán más cómodos.',
  'groundskeeper:field_quality:above:3': 'El campo está en buenas condiciones. Esto debería reducir el riesgo de lesiones de cara al partido.',
  // ... more templates per role × node × direction × tier
} as const;

// Fallback for missing template keys
export const TEMPLATE_FALLBACK: Record<MessagePriority, string> = {
  URGENT: 'Hay una situación urgente que requiere tu atención.',
  ROUTINE: 'Hay novedades en el club esta semana.',
};
```

### Drizzle Schema Addition

```typescript
// packages/db/src/schema/staff-messages.ts

export const staffMessages = pgTable('staff_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').notNull(),  // FK to staff table (not yet defined — added when staff-system epic begins)
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  priority: text('priority').notNull(),        // 'URGENT' | 'ROUTINE'
  templateKey: text('template_key').notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const staffMessagesRelations = relations(staffMessages, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [staffMessages.playthroughId],
    references: [playthroughs.id],
  }),
}));

// Partial index (must be added in a custom migration SQL file — drizzle-kit generate
// does not emit partial indexes from schema. Add to: packages/db/drizzle/custom-indexes.sql):
// CREATE INDEX idx_staff_messages_unread
//   ON staff_messages(playthrough_id, week)
//   WHERE is_read = false;
```

### BullMQ Worker (corrected — in-process pattern)

```typescript
// apps/api/src/jobs/staff-messages.worker.ts
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.ts';
import { io } from '../lib/socket.ts';  // Socket.IO server singleton

// DEPLOYMENT CONSTRAINT: This worker imports io directly. It MUST run in the
// same Node.js process as the Socket.IO server. If the worker is ever extracted
// to a separate process, replace this with Redis pub/sub via @socket.io/redis-adapter.
if (!io) {
  throw new Error('[staff-messages.worker] Socket.IO server not initialized. Worker must start after socket server.');
}

export const staffMessagesWorker = new Worker<StaffMessageJobData>(
  'staff-messages',
  async (job) => {
    const { playthroughId, finalWeek, season, thresholdCrossings, worldStateDiff } = job.data;

    const staffList = await staffRepo.findActiveStaff(playthroughId);
    const generatedMessages: Omit<StaffMessage, 'id' | 'createdAt'>[] = [];

    for (const staffMember of staffList) {
      const config = buildPerceptionConfig(staffMember);
      const weekMessages = generateMessagesForStaff(
        config, worldStateDiff, thresholdCrossings, finalWeek, season
      );
      generatedMessages.push(...weekMessages);
    }

    if (generatedMessages.length > 0) {
      const inserted = await staffMessageRepo.insertBatch(generatedMessages);
      io.to(`playthrough:${playthroughId}`).emit('staff:messages-ready', {
        playthroughId,
        week: finalWeek,
        messages: inserted,
      } satisfies StaffMessagesReadyEvent);
    }
  },
  {
    connection: redis,
    concurrency: 1,  // explicit: single job at a time per worker instance
  }
);
```

### Enqueuing from `advance()`

```typescript
// In game-clock-service.advance() — immediately after DB transaction commits:
await staffMessagesQueue.add('generate', {
  playthroughId,
  finalWeek,
  season: playthrough.currentSeason,
  thresholdCrossings: allCrossings,
  worldStateDiff: buildDiff(previousState, finalState),
} satisfies StaffMessageJobData);
// Fire-and-forget: advance() does not await the job. Delivery is async.
```

### Anti-Spam Rule

Per staff member, per week: max `MAX_ROUTINE_MESSAGES_PER_STAFF` (default: 2) ROUTINE messages. URGENT messages are always included regardless of this limit. The `generateMessagesForStaff()` function applies this cap before returning. The cap is configurable in `packages/shared/src/config/staff-messages.config.ts`.

### Message Retention

Staff messages older than 2 seasons are eligible for cleanup. A `CleanupStaffMessagesJob` runs at season start (BullMQ scheduled job). This prevents unbounded table growth over long playthroughs.

## Alternatives Considered

### Alternative 1: Synchronous generation — messages in AdvanceResult
- **Description**: Messages generated inline during `advance()`, included in the HTTP response.
- **Pros**: Single round-trip. Simpler architecture — no BullMQ job, no Socket.IO push.
- **Cons**: Blocks the advance HTTP response. Template rendering for all staff (6 roles × N nodes) adds ~50–100ms to a response that should be <500ms. Increases advance() complexity by coupling perception logic to the game clock service.
- **Rejection Reason**: The advance response should return game state, not feedback. Perception is a separate concern. Keeping it async maintains clean separation.

### Alternative 2: Polling (no Socket.IO push)
- **Description**: Messages stored in DB; client polls `GET /api/game/messages` when player opens inbox.
- **Pros**: Simpler — no Socket.IO dependency for this feature.
- **Cons**: Player doesn't know new messages arrived. The retention hook ("read feedback") requires the player to proactively open inbox rather than seeing a notification. Weakens the loop.
- **Rejection Reason**: The anticipated-feedback hook is core to the 30-second loop. Socket.IO push delivers the notification that makes the loop feel alive.

### Alternative 3: Background continuous monitoring
- **Description**: A BullMQ repeatable job checks WorldState every N seconds and generates messages proactively.
- **Pros**: Messages could arrive outside of advance events.
- **Cons**: Violates Pilar 4 (clock waits for player). Generates messages even when player is offline. Unpredictable message cadence breaks the "advance → read feedback" rhythm.
- **Rejection Reason**: Autonomous time-driven behavior contradicts Pilar 4 explicitly.

### Alternative 4: AI enrichment for all messages
- **Description**: Every staff message passes through llama.cpp for natural language generation.
- **Pros**: Rich, varied, immersive text for every observation.
- **Cons**: TR1 (llama.cpp cost/latency) is an unresolved open question. At 6 staff × 2 messages/week × 38 weeks/season = 456 AI calls per season per player. Cost is unknowable without the TR1 spike.
- **Rejection Reason**: Template-based messages are cheaper, faster, and good enough for MVP validation. The decision to enrich with AI is deferred until TR1 spike resolves the cost question. The template library is the fallback that ADR-004's fallback catalog already anticipates.

## Consequences

### Positive
- Advance HTTP response stays fast — perception work is off the critical path
- Staff messages feel reactive (Socket.IO push) without being intrusive (still player-triggered)
- Template library lives in `packages/shared/` — data-driven, no code changes to add or tune messages
- Quality tier system cleanly implements "you grow like your club" (Pilar 3) without exposing cascade formulas (Pilar 1)
- Zero llama.cpp dependency in MVP — TR1 risk fully isolated

### Negative
- Two-step delivery: advance returns → job runs → socket push. Client must handle the brief gap (show a loading/pending state for the inbox)
- Template library will need significant content to cover all staff roles × nodes × directions × tiers — a content production task, not just an engineering task
- Partial index for unread messages requires a manual migration SQL file (Drizzle limitation)
- `staffId` FK not enforced at DB level until staff table is defined (staff-system epic)

### Risks
- **R1 — BullMQ job failure = missing messages**: If the worker crashes after DB commit but before DB insert + socket emit, messages are lost. **Mitigation**: BullMQ retries (default 3 attempts). Idempotency guard: check if messages for `(playthroughId, finalWeek)` already exist before inserting.
- **R2 — Socket.IO delivery not guaranteed**: If player is disconnected when messages arrive, the socket emit is missed. **Mitigation**: Messages are persisted in DB. Client fetches missed messages on reconnect via `GET /api/game/messages?since={week}`.
- **R3 — In-process deployment assumption**: Worker directly imports `io`. Multi-process deployment breaks this. **Mitigation**: Startup guard throws at boot time. Documented explicitly in code and ADR. Migration path: `@socket.io/redis-adapter` pub/sub.
- **R4 — Template coverage gap**: If a node triggers a message but no template exists for that `{role}:{nodeId}:{direction}:{tier}` key, the fallback fires (`TEMPLATE_FALLBACK`). Player sees a generic message. **Mitigation**: `TEMPLATE_FALLBACK` is a safety net; the cascade-engine.md GDD must specify the full NodeId catalog so templates can be written for every combination.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | Staff message system as primary feedback layer | BullMQ post-advance generation → Socket.IO push delivers feedback after every advance |
| game-concept.md | "La calidad del staff determina la granularidad del feedback" | `StaffPerceptionConfig.qualityTier` × `baseThresholdPct` controls what changes are noticed and how specifically they're described |
| game-concept.md | "staff novato → mensajes vagos; staff experto → recomendaciones contextuales precisas" | qualityTier 1/2/3 maps to template variants with increasing specificity |
| game-concept.md | Pilar 1: cascades partially hidden (staff hints, not explains) | Template text hints at causal direction without giving formulas; low-tier templates are intentionally vague |
| game-concept.md | Pilar 3: improving staff expands world visibility | Higher quality staff = lower threshold = more messages = more cascade signals reaching the player |
| game-concept.md | Pilar 4: "el reloj te espera" — no autonomous message generation | Messages are only generated in response to a player-triggered advance, never on a real-time timer |
| game-concept.md | 30-second loop step 4: "leer feedback (informe, noticia IA, rumor, reacción)" | Staff messages implement this step; inbox notification drives the feedback read |

## Performance Implications

- **CPU**: Template lookup + perception loop: O(staff count × domain size). With ~6 staff × ~5 nodes each: 30 operations per advance. Negligible (<1ms).
- **Memory**: Job data payload: thresholdCrossings (typically <10 entries × ~100 bytes) + worldStateDiff (all changed nodes × 24 bytes). For a typical week: <5KB. Well within BullMQ Redis storage.
- **Load Time**: Not applicable.
- **Network**: Socket.IO push payload: array of ~4 messages × ~300 bytes each = ~1.2KB. Negligible.
- **DB**: 1 INSERT batch for generated messages (typically 3–8 rows). 1 SELECT for active staff. Both fast (<10ms each).

## Migration Plan

No existing code to migrate. New tables and worker.

1. Create `staff_messages` Drizzle migration
2. Add partial index SQL to `packages/db/drizzle/custom-indexes.sql`
3. Implement `staff-messages.worker.ts` with the in-process io guard
4. Implement template library skeleton in `packages/shared/src/data/staff-message-templates.ts`
5. Implement `staffMessagesQueue` in `apps/api/src/jobs/queues.ts`
6. Wire `staffMessagesQueue.add()` call at end of `game-clock-service.advance()` (after transaction)
7. Add `staff:messages-ready` Socket.IO event type to `packages/shared/src/types/socket.ts`

Staff FK constraint (staffId references staff table) is added when the staff-system epic begins.

## Validation Criteria

- After `POST /advance`, a `staff:messages-ready` Socket.IO event arrives in the client's `playthrough:{id}` room within 500ms.
- Staff with qualityTier=1 generates messages only for WorldState changes ≥ 3× baseThresholdPct; qualityTier=3 generates for changes ≥ 1× baseThresholdPct.
- No more than `MAX_ROUTINE_MESSAGES_PER_STAFF` (default 2) ROUTINE messages per staff member per week. URGENT messages are not capped.
- If BullMQ worker crashes and retries, no duplicate messages in DB for the same `(playthroughId, finalWeek, staffId, templateKey)`.
- If player is offline when socket push fires, messages are accessible via `GET /api/game/messages?since={week}` on reconnect.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — SimContext provides worldClock; worldStateDiff is derived from tick results
- [ADR-003](ADR-003-cascade-graph-topology.md) — WorldState node catalog; ThresholdCrossings drive URGENT message generation
- [ADR-004](ADR-004-narrative-ai-architecture.md) — llama.cpp pipeline reserved for post-MVP enrichment of high-stakes staff messages
- [ADR-008](ADR-008-world-clock-event-loop.md) — advance() lifecycle; `staffMessagesQueue.add()` fires after advance DB commit
- ADR-010 (future) — Manager-RPG progression: hiring better staff raises their qualityTier, increasing perception sensitivity
- `staff-system.md` GDD (future) — defines staff roles, domains, initial qualityTier per role, baseThresholdPct per role
- `hud-ui.md` GDD (future) — designs the message inbox panel that displays `StaffMessage[]`

# ADR-029: Stadium Upgrades Module — Schema, API, and Worker Architecture

## Status

Proposed (v1.1 design — 2026-05-24 autonomous authoring)

## Date

2026-05-24 — created during stadium-upgrades.md GDD authoring; pending Pablo accept.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Backend (Drizzle schema + Hono routes + BullMQ workers) + Frontend (SvelteKit `/stadium`) |
| **Knowledge Risk** | LOW — uses existing stack patterns |
| **References Consulted** | ADR-005 (WorldState persist), ADR-008 (World Clock), ADR-014 (economy financial flow), ADR-013 (match session pattern as worker model), stadium-upgrades.md (this GDD) |
| **Post-Cutoff APIs Used** | None — stack is pinned in `.claude/docs/technical-preferences.md` |
| **Verification Required** | Migration 0025+ must apply cleanly; F1+F3+F5 deterministic tests; BullMQ worker recoverable on restart |

## Context

`stadium-upgrades.md` (v1.1) introduces a new system that:
- Writes 3 new WorldState fields (`stadium_upgrade_count`, `training_facility_level`, `youth_academy_level`) — and computes 2 more (`stadium_capacity`, `stadium_visual_level`).
- Tracks ~40 catalog items per club with FSM (`Locked` / `Available` / `Queued` / `InProgress` / `Complete` / `Cancelled`).
- Runs 1 active upgrade at a time with N-week duration that counts down on the world clock.
- Supersedes `city-progression.md §4.2` (`infrastructure_level` formula).

Without this ADR, the implementing programmer must invent: where the schema lives, which module owns the catalog, how the world clock ticks the in-progress timer, how the queue is enforced under concurrent POSTs, and how cancellation refunds avoid the income-projection exploit (stadium-upgrades.md §5.16).

## Decision

### D1. Module location & naming

New module: `apps/api/src/modules/stadium-upgrades/`. Mirror of existing economy/league modules:

```
apps/api/src/modules/stadium-upgrades/
├── routes.ts          # Hono router mounted at /api/stadium
├── service.ts         # Domain logic, called by routes + worker
├── repo.ts            # Drizzle queries
└── catalog.ts         # Static catalog loader (reads design/data/stadium-upgrades-catalog.yaml)

packages/shared/src/sim/stadium/
├── formulas.ts        # F1-F6 pure functions
├── visual-level.ts    # F1 stadium_visual_level
├── infrastructure.ts  # F3 infrastructure_level (replaces city-progression formula)
└── types.ts           # Type contracts

packages/db/src/schema/stadium-upgrades.ts  # Drizzle tables
```

### D2. Database schema (Drizzle, migration 0025+)

```typescript
// packages/db/src/schema/stadium-upgrades.ts
export const stadiumUpgradeItems = pgTable('stadium_upgrade_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  itemSlug: text('item_slug').notNull(),    // e.g. "gradas-n2-norte"
  track: text('track').notNull(),            // "gradas" | "pitch" | "servicios" | "training" | "academy"
  tier: integer('tier').notNull(),           // 1..4
  status: text('status').notNull(),          // "queued" | "in_progress" | "complete" | "cancelled"
  costPaidEurK: integer('cost_paid_eur_k').notNull(),
  durationWeeks: integer('duration_weeks').notNull(),
  weeksRemaining: integer('weeks_remaining'),
  directorSkillSnapshot: integer('director_skill_snapshot'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Unique constraint: at most 1 in_progress per club (queue invariant §3.1.4)
// Use partial index: CREATE UNIQUE INDEX ON stadium_upgrade_items (club_id) WHERE status = 'in_progress';
```

WorldState additions (extend `world_state_snapshots` per ADR-005):
- `stadium_upgrade_count` (int): denormalized count, recomputed on each Complete
- `training_facility_level` (int): denormalized count for Training track
- `youth_academy_level` (int): denormalized count for Academy track

These three are stored for cascade-engine read efficiency. `stadium_capacity` and `stadium_visual_level` are computed-on-read (no storage).

### D3. Catalog data file

`design/data/stadium-upgrades-catalog.yaml` is the canonical catalog. Loaded at server boot, validated by Zod schema in `catalog.ts`. Format:

```yaml
items:
  - slug: gradas-n1-norte
    track: gradas
    tier: 1
    name: "Grada Norte hormigón"
    description: "..."
  - slug: gradas-n1-sur
    track: gradas
    tier: 1
    name: "Grada Sur hormigón"
    description: "..."
```

NO costs / durations in YAML — those are computed via F4 / F2 from config-driven constants (per stadium-upgrades.md §7). This separates content from balance.

### D4. API surface (Hono routes mounted at `/api/stadium`)

```
GET    /api/stadium/catalog              → full catalog + state per item for the user's club
POST   /api/stadium/buy                  → { itemSlug } → debit cost, set in_progress
POST   /api/stadium/cancel               → cancel in_progress, refund 50%
POST   /api/stadium/accept-offer         → { eventId, itemSlug } accept STADIUM_OFFER event subsidy
GET    /api/stadium/history              → completed items chronological (feeds trophies-history.md)
```

All routes session-authenticated via existing middleware (ADR-001 / hand-rolled sessions). Server validates: prereqs, balance, queue, all on server side (forbidden pattern: never trust client).

Returns 4xx codes per stadium-upgrades.md §5: `400 INVALID_PREREQ`, `409 SLOT_OCCUPIED`, `402 INSUFFICIENT_BALANCE`, `404 ITEM_NOT_FOUND`.

### D5. World Clock integration (per ADR-008)

The world clock advance loop calls `stadiumUpgradesService.tick(clubId, currentDay)` once per week-tick. Logic:

```typescript
async function tick(clubId: string, currentDay: number) {
  const active = await repo.getActive(clubId);
  if (!active) return;

  // §5.2: bankruptcy pause
  const balance = await economyRepo.getBalance(clubId);
  if (balance < BANKRUPTCY_BALANCE_FLOOR) return;  // pause, don't decrement

  active.weeksRemaining -= 1;
  if (active.weeksRemaining <= 0) {
    await completeUpgrade(active);  // transaction: §3.2 side effects 1-8
  } else {
    await repo.update(active.id, { weeksRemaining: active.weeksRemaining });
  }
}
```

Reuses existing world clock infrastructure (`apps/api/src/modules/advance/`). No new BullMQ worker needed — this is part of the existing advance pipeline.

### D6. Side-effects transaction on `Complete`

Per stadium-upgrades.md §3.2, side effects (8 steps) run in a single DB transaction:

```typescript
await db.transaction(async (tx) => {
  // 1. Mark item complete
  await tx.update(stadiumUpgradeItems).set({ status: 'complete', completedAt: now() }).where(...);
  // 2. Increment denormalized counter on WorldState snapshot
  await tx.update(worldState).set({ stadium_upgrade_count: sql`stadium_upgrade_count + 1` }).where(...);
  // 3. Emit cascade-engine event (cascade-engine subscribes in same tx)
  await cascadeEngine.applyDelta(tx, clubId, nodeId, +1);
  // 4. Re-evaluate tier-up (city-progression doble gate)
  await cityProgressionService.evaluateTierUp(tx, clubId);
  // 5-8. (handled via downstream subscribers)
});

// After transaction commits:
await staffMessageService.publishCompleteMessage(clubId, item);
await realtimeService.broadcast(clubId, 'stadium:item_complete', item);
```

### D7. Cancellation refund classification (§5.16)

Refunds go through a dedicated economy transaction tagged `category: 'stadium_refund_extraordinary'`. The economy module's `weekly_income_projection` query MUST exclude this category to prevent the income-smoothing exploit. Required edit to economy.md `F-revenue-flow` — propagation tracked in Fase 1.3.

### D8. Visual feedback in `/stadium` (immediate)

When item completes, the SvelteKit `/stadium` route subscribes to a Socket.IO event (`stadium:item_complete`) on its own club room. On receive, re-renders the sprite of the new `stadium_visual_level`. NO full page reload required.

Frontend integration:
- `apps/web/src/routes/stadium/+page.svelte` already exists with placeholder UI (asset: `apps/web/src/routes/stadium/+page.svelte:1`)
- Replace placeholder catalog block with live data from `GET /api/stadium/catalog`
- Add Socket.IO subscriber for `stadium:item_complete` event
- Use existing tier sprite lookup pattern (already implemented for HD sprites)

### D9. Migration strategy from city-progression.md §4.2

The old `infrastructure_level` formula is broken with the new item counts (24/8/8 × 5 = 200 instead of 100). Migration path:

1. Migration 0025 creates `stadium_upgrade_items` table.
2. Migration 0026 backfills denormalized counters on `world_state_snapshots`:
   - `UPDATE world_state SET stadium_upgrade_count = 0, training_facility_level = 0, youth_academy_level = 0`
   - Existing players start fresh at counter=0 (they haven't "bought" anything yet under the new system).
3. Code change: replace `infrastructure_level` formula call sites with F3 from `packages/shared/src/sim/stadium/infrastructure.ts`.

City-progression.md visual tier triggers (§3.2 métricas-only) need updating to include the doble gate. The implementation in `apps/api/src/modules/city-progression/tier-evaluator.ts` (if it exists) or wherever currently lives, must call both `metricGateSatisfied()` AND `stadiumUpgradesService.gateSatisfied(level)`.

## Consequences

**Positive:**
- Clean module boundary; stadium-upgrades owns its own state and is the only writer to its tables.
- Reuses existing world clock + advance pipeline (no new BullMQ worker).
- Catalog as YAML decouples content from balance tuning (config drives costs/durations).
- Socket.IO realtime feedback in `/stadium` makes the per-reforma immediate visual feedback (stadium-upgrades.md §1) work without polling.

**Negative:**
- 3 denormalized counters on WorldState introduce minor data duplication (also stored as 3 sums in `stadium_upgrade_items`). Mitigation: invariant test runs on every `Complete` transaction to verify denormalized counter matches actual row count.
- Migration 0026 wipes any in-progress city-progression state — players who had reached tier 4 under old rules now need to grind reformas. Mitigation: this is v1.1 first deploy; no existing player has city-progression state in production.
- Catalog YAML hot-reload not supported in v1.1 — server restart required after catalog edits. Mitigation: catalog should be stable post-MVP; rare edits acceptable.

**Risks:**
- If catalog YAML count differs from `STADIUM_ITEMS_MAX` constant in code, F3 produces wrong infrastructure_level. Mitigation: server boot test validates `catalog.items.filter(track in [gradas,pitch,servicios]).length === STADIUM_ITEMS_MAX` and fails fast.
- Race condition on simultaneous POST `/api/stadium/buy` (two clients): mitigated by partial unique index on `status = 'in_progress'`. Second request fails with `409 SLOT_OCCUPIED` (per stadium-upgrades.md AC-SU-36).

## ADR Dependencies

| ADR | Relation |
|---|---|
| ADR-005 (WorldState persistence) | Extended — adds 3 new fields to snapshot |
| ADR-008 (World Clock) | Reused — week-tick pumps stadium-upgrades.tick() |
| ADR-014 (economy financial flow) | Extended — new transaction category `stadium_refund_extraordinary` |
| ADR-013 (match session pattern) | Pattern reference (FSM with snapshot recoverability) |
| ADR-001 (web stack) | Implementation stack (Drizzle, Hono, BullMQ if needed) |

## GDD Requirements Addressed

| TR-ID (future) | Requirement | GDD source |
|---|---|---|
| TR-SU-001 | 5 tracks defined in catalog | stadium-upgrades.md §3.1.1 |
| TR-SU-002 | ~40 items in catalog | stadium-upgrades.md §3.1.2 |
| TR-SU-003 | Prereqs §3.1.3 (track + balance + queue) | stadium-upgrades.md §3.1.3 |
| TR-SU-004 | Queue max = 1 (slot enforcement) | stadium-upgrades.md §3.1.4 |
| TR-SU-005 | Tier-up doble gate (métricas + reformas) | stadium-upgrades.md §3.1.5 |
| TR-SU-006 | Cancel refund 50% extraordinary | stadium-upgrades.md §3.1.6, §5.16 |
| TR-SU-007 | Bankruptcy pause + visual decay | stadium-upgrades.md §3.1.7, §5.2, §5.7 |
| TR-SU-008 | FSM 6 states + transitions | stadium-upgrades.md §3.2 |
| TR-SU-009 | F1-F6 deterministic formulas | stadium-upgrades.md §4 |
| TR-SU-010 | F3 supersedes city-progression §4.2 | stadium-upgrades.md §4 F3 |
| TR-SU-011 | Realtime feedback on Complete | stadium-upgrades.md §1, §3.2 side effect 7 |
| TR-SU-012 | UX critical-balance warning | stadium-upgrades.md §5.15 |

Full ACs in stadium-upgrades.md §8 (AC-SU-01 through AC-SU-40).

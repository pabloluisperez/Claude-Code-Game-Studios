# Cascada FC (SoccerManagerTotal) — Master Architecture

## Document Status

| Field | Value |
|---|---|
| Version | 1.1 |
| Last Updated | 2026-05-19 |
| Engine | Web — TypeScript full-stack monorepo (SvelteKit 2 + Hono 4 + Drizzle 0.36+ + Socket.IO 4 + BullMQ 5) |
| Engine reference pinned | 2026-05-15 (`docs/engine-reference/web/`) |
| GDDs Covered | 9 MVP GDDs (Approved 2026-05-18) |
| ADRs Referenced | ADR-001 through ADR-018 (17 Accepted; ADR-004 & ADR-006 deferred to v1.1+/v1.2+; ADR-014/015/016/017/018 Accepted 2026-05-19) |
| Technical Director Sign-Off | 2026-05-18 — **APPROVED WITH CONDITIONS** (review-mode: lean — LP-FEASIBILITY skipped per gate protocol) |
| Lead Programmer Feasibility | SKIPPED — lean mode |
| Vertical Slice Validation | CONFIRMED PROCEED (2026-05-18) — full game loop demonstrated end-to-end |

**Conditions on approval**: This document is a synthesis of the 12 Accepted ADRs
and 9 Approved GDDs. Open questions and `Required ADRs` (§ below) must be
resolved before sprints that depend on them begin. The architecture is
authored under **lean** review mode — when entering Production proper, a
`/architecture-review` pass should re-validate the TR matrix and director gates.

---

## Engine Knowledge Gap Summary

The LLM training cutoff predates Svelte 5 runes (Oct 2024), Drizzle 0.36+
relational queries, and Hono 4 final API. The pinned engine reference
(`docs/engine-reference/web/`, 2026-05-15) is authoritative.

### HIGH RISK Domains

| Domain | Risk | Mitigation |
|---|---|---|
| Svelte 5 runes (`$state`, `$derived`, `$effect`) | HIGH | Verified by slice — `bind:value` on inputs has quirks (workaround: rename local `state` variables). See `web/modules/frontend.md`. |
| Drizzle 0.36+ relational queries + `unique().on()` syntax | HIGH | Verified by slice — `drizzle-kit generate` produces migrations correctly when partial indexes use `sql` template literal. See `web/modules/backend.md` + ADR-011 §Engine Compatibility. |
| Hono 4 final API (route signatures, `c.req.json()`) | MEDIUM | Verified by slice — patterns in `apps/api/src/auth/` and slice's match-routes. |
| BullMQ delayed jobs + re-enqueue pattern | MEDIUM | Verified by slice — ADR-013 Option B (persist PRNG state) tested. |

### LOW RISK Domains

`pg`, `socket.io@4`, `seedrandom`, `zod@3`, `@oslojs/*`, `@node-rs/argon2` —
stable APIs, in training data, no significant post-cutoff changes.

### Systems touching HIGH RISK domains

- All UI work (`apps/web/`) — Svelte 5 runes
- All DB schema work (`packages/db/src/schema/`) — Drizzle 0.36+
- All API routes (`apps/api/src/**/*-routes.ts`) — Hono 4

**Rule**: every story touching these domains must reference `docs/engine-reference/web/`
in its acceptance criteria.

---

## System Layer Map

Five-layer architecture aligned with `design/gdd/systems-index.md`:

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                              │
│  ─────────────────────────────────────────────────────────────   │
│  • hud-ui.md (MVP, DOM-only per ADR-012)                          │
│  • isometric-world.md (DEFERRED v1.1+ — ADR-006)                 │
└──────────────────────────────────────────────────────────────────┘
            ▲ (REST + Socket.IO subscriptions)
            │
┌──────────────────────────────────────────────────────────────────┐
│  FEATURE LAYER                                                   │
│  ─────────────────────────────────────────────────────────────   │
│  • event-system.md (MVP)                                          │
│  • league-system.md (MVP, ADR-011)                               │
│  • narrative-ai.md (DEFERRED v1.2+ — ADR-004)                    │
└──────────────────────────────────────────────────────────────────┘
            ▲ (cross-system reads + WorldStateDeltas)
            │
┌──────────────────────────────────────────────────────────────────┐
│  CORE LAYER                                                      │
│  ─────────────────────────────────────────────────────────────   │
│  • manager-rpg.md (MVP, ADR-010)                                 │
│  • staff-system.md (MVP, ADR-009)                                 │
│  • player-management.md (MVP)                                     │
│  • city-progression.md (DEFERRED v1.1+)                          │
└──────────────────────────────────────────────────────────────────┘
            ▲ (reads WorldState, writes via cascade tick)
            │
┌──────────────────────────────────────────────────────────────────┐
│  FOUNDATION LAYER                                                │
│  ─────────────────────────────────────────────────────────────   │
│  • cascade-engine.md (MVP, ADR-003)                              │
│  • match-simulation.md (MVP, ADR-007 + ADR-013)                  │
│  • economy.md (MVP — uses ADR-005 persistence)                   │
│  • world-clock + event-loop (ADR-008)                            │
│  • sim-context + PRNG determinism (ADR-002)                      │
│  • worldstate persistence (ADR-005)                              │
└──────────────────────────────────────────────────────────────────┘
            ▲ (TypeScript types + DB driver)
            │
┌──────────────────────────────────────────────────────────────────┐
│  PLATFORM LAYER                                                  │
│  ─────────────────────────────────────────────────────────────   │
│  • SvelteKit 2 (web app runtime)                                 │
│  • Hono 4 + @hono/node-server (API runtime)                      │
│  • Drizzle ORM 0.36+ over PostgreSQL 16 (data)                   │
│  • BullMQ 5 over Redis 7 (job queue)                             │
│  • Socket.IO 4 (realtime)                                        │
│  • Node.js 22+ LTS                                               │
└──────────────────────────────────────────────────────────────────┘
```

### Monorepo Package → Layer Mapping

| Package | Layers covered | Notes |
|---|---|---|
| `packages/shared/` | Foundation (sim core, types) | Pure TypeScript — no I/O. Determinism guaranteed by ADR-002. |
| `packages/db/` | Foundation (persistence) | Drizzle schemas (ADR-005, ADR-011); session auth (Lucia replaced — `@oslojs/*`). |
| `apps/api/` | Foundation + Core + Feature (server-authoritative) | Hono routes, BullMQ workers, Socket.IO server. All game logic. |
| `apps/web/` | Presentation only | SvelteKit. DOM-only MVP per ADR-012. PixiJS canvas deferred. |

**Strict rule** (from `.claude/docs/technical-preferences.md`): cross-module
direct DB access is forbidden. Each domain module reads/writes only its own
tables. UI clients never mutate state directly — all writes go through the API.

---

## Module Ownership

### Foundation Layer

| Module | Owns | Exposes | Consumes | Engine APIs |
|---|---|---|---|---|
| `packages/shared/src/sim/cascade-engine.ts` | Cascade tick algorithm, DelayedEffectsBuffer semantics | `runTick(args) → TickResult`, `mergeDelayedBuffer()` | `cascade-graph.ts` (data) | None (pure) |
| `packages/shared/src/sim/cascade-graph.ts` | `CascadeEdgeDef[]` data + threshold configs (Rule 10: data, not code) | Edge definitions, threshold table | None | None (pure) |
| `packages/shared/src/sim/sports/football/football-plugin.ts` | `simulateMatch()` pure function (ADR-007 contract) | `simulateMatch(input) → MatchOutcome`, plus interactive variants per ADR-013 | `seedrandom` (PRNG) | None (pure) |
| `packages/shared/src/sim/world-clock.ts` | `advance()` core loop (ADR-008) | `advance(state, decisions) → AdvanceResult` | cascade-engine, match-sim | None (pure) |
| `packages/db/src/schema/*.ts` | All Drizzle table definitions | Exported tables + Relations | Drizzle types | Drizzle 0.36+ (HIGH risk) |
| `apps/api/src/modules/world-state/` | WorldState snapshot persistence (ADR-005) | `saveSnapshot()`, `loadLatestSnapshot()` | `packages/db` | Drizzle |
| `apps/api/src/modules/league/` | Standings + fixture state per ADR-011 | `getStandings()`, `applyMatchToStandings()`, fixture lifecycle | `packages/db` | Drizzle |
| `apps/api/src/modules/match/` | MatchSession FSM + re-enqueue (ADR-013) | `startMatch()`, `decideMatch()`, `MatchSessionSnapshot` | `packages/shared/src/sim`, BullMQ | BullMQ 5 (MEDIUM risk) |
| `apps/api/src/workers/advance-worker.ts` | Weekly tick worker | (BullMQ Worker entry) | world-clock, cascade-engine | BullMQ 5 |
| `apps/api/src/workers/match-worker.ts` | Match simulation worker (non-interactive) | (BullMQ Worker entry) | match-simulation, advance | BullMQ 5 |

### Core Layer

| Module | Owns | Exposes | Consumes | Engine APIs |
|---|---|---|---|---|
| `apps/api/src/modules/manager/` | ManagerState lifecycle, XP curves (ADR-010), skill allocation | `applyXp()`, `allocateSkillPoint()`, `getManagerState()` | world-state | Drizzle |
| `apps/api/src/modules/staff/` | StaffMessage generation pipeline (ADR-009) | `generateMessages(cascadeLog, thresholdCrossings)` | manager (for tier lookup), cascade-engine (for log) | Drizzle |
| `apps/api/src/modules/players/` | Player generation, contracts, form roll | `generateLineup(seed, baseSkill)`, `updateForm(playerId, matchRating)` | match-sim outputs, world-state | Drizzle |

### Feature Layer

| Module | Owns | Exposes | Consumes | Engine APIs |
|---|---|---|---|---|
| `apps/api/src/modules/event-system/` | Calendar events + random event pool | `getEventsForWeek(week, seed)`, `applyEventDecision()` | manager, staff, world-state | Drizzle |
| `apps/api/src/modules/season/` | Season start/end orchestration (ADR-011) | `startSeason()`, `processSeasonEnd()` | league, players | Drizzle (transactional) |

### Presentation Layer

| Module | Owns | Exposes | Consumes | Engine APIs |
|---|---|---|---|---|
| `apps/web/src/routes/` | SvelteKit routes (DOM-only per ADR-012) | UI pages | `+page.server.ts` calls `/api/*` | SvelteKit 2 + Svelte 5 runes (HIGH risk) |
| `apps/web/src/lib/api.ts` | Type-safe API client | Typed wrappers per endpoint | Hono routes | fetch |
| `apps/web/src/lib/format.ts` | Domain-language formatters (post-slice OQ-HUD-10) | `formatFitness()`, `formatFanMomentum()`, ... | None | None |
| `apps/web/src/lib/socket.ts` | Socket.IO client subscription helpers | `subscribeMatch(sessionId)` | Socket.IO 4 client | Socket.IO 4 |

### Dependency Diagram (ASCII)

```
                     ┌──────────────────────┐
                     │   apps/web (UI)      │
                     │   SvelteKit + DOM    │
                     └──────────┬───────────┘
                                │ REST + Socket.IO
                                ▼
                     ┌──────────────────────┐
                     │   apps/api (server)  │
                     │ ┌──────────────────┐ │
                     │ │ Hono routes      │ │
                     │ ├──────────────────┤ │
                     │ │ BullMQ workers   │─┼─► Redis 6379
                     │ ├──────────────────┤ │
                     │ │ Modules:         │ │
                     │ │ manager/staff/   │ │
                     │ │ players/match/   │ │
                     │ │ league/season/   │ │
                     │ │ world-state/     │ │
                     │ │ event-system     │ │
                     │ └──────────────────┘ │
                     └────┬───────┬─────────┘
                          │       │
       imports types ┌────┘       └──► writes via Drizzle
                     ▼                  ┌─────────────────┐
       ┌───────────────────────┐        │ packages/db     │
       │ packages/shared/sim/  │        │ Drizzle schemas │
       │ ─ cascade-engine      │        │ + auth          │
       │ ─ match-simulation    │        └────────┬────────┘
       │ ─ world-clock         │                 │
       │ ─ types               │                 ▼
       └───────────────────────┘         PostgreSQL 5433
              PURE FUNCTIONS
              Determinism by ADR-002
```

**Direction rule**: arrows point from importer to imported. The web app
imports types from `packages/shared/types/` but never imports from `packages/db`
(server-only). The simulation core (`packages/shared/sim/`) has zero
dependencies on `apps/*` or `packages/db` — it's pure.

---

## Data Flow

### 1. Weekly Advance Cycle (the core game loop)

```
User clicks "Avanzar semana" in /apps/web
  │
  ▼
POST /api/advance { playthroughId, decisions } ──► Hono route
  │
  ▼
advance-worker enqueues advanceOneWeek job (BullMQ)
  │
  ▼
[advance-worker]
  1. Load latest WorldStateSnapshot from DB (ADR-005)
  2. Read this week's fixtures (ADR-011)
  3. For each fixture (sequential — deterministic by seed):
       │ simulateMatch(input) → MatchOutcome  (ADR-007 pure function)
       │ markFixturePlayed() + applyMatchToStandings() (ADR-011)
       │ if isPlayerMatch:
       │   prevState.MPI = 50 + outcome.worldStateDeltas.MPI
       │   prevState.injury_risk += outcome.worldStateDeltas.injury_risk
  4. resolveEventsForWeek(week, seed) → SliceEvent[]
  5. runTick(prevState, decisions, rng) → TickResult
       │ Step 1: apply matured delayed effects
       │ Step 2: evaluate edges (read prevState only — Rule 3)
       │ Step 3: apply PlayerDecisions
       │ Step 4: clamp to ranges
       │ Step 5: detect ThresholdCrossings (ADR-008)
  6. applyXp(managerState, gains) → new ManagerState (ADR-010)
  7. maybeGenerateCareerEvent() if conditions met
  8. generateStaffMessages(cascadeLog, crossings) → persist (ADR-009)
  9. saveSnapshot(playthroughId, week, state, buffer, manager)
  10. advancePlaythroughWeek(week + 1)
  │
  ▼
Return AdvanceResult { weekProcessed, playerMatchOutcome, finalState,
                       thresholdCrossings, events, managerState, staffMessages }
  │
  ▼
Client refreshes state + renders UI
```

**Invariant**: all RNG calls in this pipeline use the same seeded `ctx.rng()`
chain (ADR-002). Replay of the same playthrough produces identical AdvanceResult.

### 2. Interactive Match (Match 3 / Match Day with player at the wheel)

Per ADR-013 — re-enqueue pattern with persisted PRNG state.

```
POST /api/matches/start { playthroughId }
  │
  ▼
match-controller:
  1. Validate session lock (partial UNIQUE per ADR-013)
  2. Load lineups + WorldState
  3. startInteractiveMatch(input) → MatchSessionSnapshot (paused at tick 45)
     │ rngState = JSON.stringify(seedrandom().state())
  4. Persist snapshot in match_sessions table
  5. Return { sessionId, pausedAtTick, firstHalfEvents, lineups }
  │
  ▼
Client animates first half + shows pause modal at min 45
  │
  ▼
POST /api/matches/decision { sessionId, decision }
  │
  ▼
match-controller:
  1. Load snapshot from DB
  2. Cancel timeout job (per ADR-013)
  3. resumeInteractiveMatch({ snapshot, decision, input }) → MatchOutcome
     │ Re-hydrate RNG: seedrandom('', { state: JSON.parse(snapshot.rngState) })
     │ Run ticks 46..90
  4. markFixturePlayed + applyMatchToStandings
  5. Apply deltas to WorldState + run cascade tick
  6. Mark session state='completed'
```

### 3. Save / Load (Resume a Playthrough)

Per ADR-005 — append-only world_snapshots table.

```
GET /api/playthroughs/:id
  │
  ▼
playthrough-controller:
  1. SELECT * FROM playthroughs WHERE id = :id
  2. SELECT * FROM world_snapshots
       WHERE playthrough_id = :id
       ORDER BY week DESC LIMIT 1
  3. Return { playthrough, snapshot }
```

**Append-only semantics**: every cascade tick creates a new row.
`worldSnapshots.week` is UNIQUE per playthrough. Resuming = reading the row
with the highest week.

### 4. Initialization Order

For a fresh process (production server boot):

```
1. Process env (DATABASE_URL, REDIS_URL, SESSION_SECRET)
2. Postgres pool (pg.Pool) — connection pool initialized
3. Drizzle client — schema loaded
4. Redis client (ioredis with maxRetriesPerRequest: null for BullMQ)
5. BullMQ queues registered (advance, match)
6. Hono app — routes mounted: /api/auth, /api/playthroughs, /api/advance,
   /api/matches, /api/staff-messages, /api/standings, /api/manager, ...
7. Socket.IO server — namespaces: /match (for live tick streaming)
8. BullMQ workers started (advance-worker, match-worker)
9. HTTP server listens on PORT
```

The SvelteKit web app boots independently and connects to the API server via
the proxied `/api/*` path (configured in `vite.config.ts`).

---

## API Boundaries

### Server-Authoritative Contract

Per `technical-preferences.md` forbidden patterns:
- Client-side game state mutations — forbidden. All state lives server-side.
- The web app is a thin renderer + decision input layer. No simulation runs in
  the browser.

### Public API Surface (Hono routes)

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/playthroughs                       — list user's playthroughs
POST   /api/playthroughs                       — create new
GET    /api/playthroughs/:id                   — load full state
DELETE /api/playthroughs/:id                   — soft delete

POST   /api/advance                            — advance one week (synchronous wrapper or async via BullMQ)
GET    /api/advance/state/:playthroughId       — current state + latest snapshot
GET    /api/advance/standings/:playthroughId
GET    /api/advance/staff-messages/:playthroughId
GET    /api/advance/fixtures/:playthroughId/week/:week
POST   /api/advance/allocate-skill             — spend pending skill point

POST   /api/matches/start                      — start interactive match (ADR-013)
POST   /api/matches/decision                   — apply pause-window decision
GET    /api/matches/:sessionId/feed            — Socket.IO upgrade endpoint
```

### Internal Module Contracts

#### `simulateMatch(input: MatchInput) → MatchOutcome` (ADR-007)

**Contract**: pure function. Given the same `MatchInput`, returns identical
`MatchOutcome`. No I/O. No `Math.random()`. No `Date.now()`.

```typescript
interface MatchInput {
  homeClubId: string;
  awayClubId: string;
  homeLineup: PlayerStats[];   // 11 players, 4-4-2 default
  awayLineup: PlayerStats[];
  worldState: Readonly<WorldState>;
  playerClubSide: "home" | "away";
  seed: string;
}

interface MatchOutcome {
  homeScore: number;
  awayScore: number;
  winner: "home" | "away" | "draw";
  events: MatchEvent[];
  worldStateDeltas: {
    match_performance_index: number;   // F8 — clamped [-30, +30]
    injury_risk: number;               // F9 — clamped [0, +15]
  };
  playerRatings: Record<string, number>; // F10 — only player's club, ≥30min
}
```

Verification: 9/9 determinism tests pass in the slice.

#### `runTick(args) → TickResult` (ADR-003)

**Contract**: pure function. Edges read `prevState` only (Rule 3). Effects
are additive (Rule 4). Cycles are safe by construction.

```typescript
interface RunTickArgs {
  prevState: WorldState;
  delayedBuffer: readonly DelayedEffect[];
  decisions: PlayerDecisions;
  rng: () => number;
  hasMatchThisWeek: boolean;
  currentWeek: number;
}

interface TickResult {
  nextState: WorldState;
  newDelayedEffects: DelayedEffect[];
  log: CascadeLogEntry[];
  thresholdCrossings: ThresholdCrossing[];
  week: number;
}
```

#### `MatchSessionSnapshot` (ADR-013)

**Contract**: JSON-serializable. Round-trip through `JSON.stringify` →
`JSON.parse` must preserve the RNG stream (Option B).

```typescript
interface MatchSessionSnapshot {
  currentTick: number;
  state: MatchState;
  rngState: string;            // serialized seedrandom state — Option B
  pausedAt: number | null;
}
```

Verification: 3/3 interactive-match tests pass in the slice (including
JSON round-trip determinism).

#### `StaffMessage` generation (ADR-009)

**Contract**: tier-keyed templates. The template key format is
`{role}:{nodeId}:{direction}:{tier}` and uses NodeIds from
`cascade-engine.md`'s catalog as the single source of truth.

### Forbidden Patterns at API Boundaries

- ❌ Client-side `Math.random()` for any game state
- ❌ Cross-module direct DB writes (e.g., staff module writing to `clubs` table)
- ❌ Mutable shared state between BullMQ jobs without a DB read-then-write
- ❌ Server returning Maps in JSON payloads (use `Record<>`) — see ADR-007 F10 note

---

## ADR Audit

All 12 ADRs verified Accepted (zero Proposed). Engine Compatibility section
present on all. GDD linkage present on all.

| ADR | Title | Layer | Status | Engine Compat | GDD Linkage | Notes |
|---|---|---|---|---|---|---|
| ADR-001 | Web stack | Platform | Accepted | ✅ | ✅ | Foundation choice; locks SvelteKit + Hono + Drizzle + Socket.IO |
| ADR-002 | Sim determinism | Foundation | Accepted | ✅ | ✅ | `ctx.rng()` discipline; verified by slice |
| ADR-003 | Cascade graph topology | Foundation | Accepted | ✅ | ✅ | DAG vs cyclic — Rule 3 (read prevState only) |
| ADR-004 | Narrative AI architecture | Feature | Accepted (deferred v1.2+) | ✅ | ✅ | llama.cpp — MVP uses fixed templates instead |
| ADR-005 | WorldState persistence | Foundation | Accepted | ✅ | ✅ | Append-only `world_snapshots` |
| ADR-006 | Isometric rendering | Presentation | Accepted (deferred v1.1+) | ✅ | ✅ | PixiJS 8 — MVP uses DOM only |
| ADR-007 | Sport-agnostic match | Foundation | Accepted | ✅ | ✅ | `SportPlugin` interface; football plugin only in MVP |
| ADR-008 | World clock + event loop | Foundation | Accepted | ✅ | ✅ | `advance()` + threshold crossings + `nextEventPreview` |
| ADR-009 | Staff message routing | Core | Accepted | ✅ | ✅ | Tier-keyed template library |
| ADR-010 | Manager-RPG progression | Core | Accepted | ✅ | ✅ | XP curves, 5 skills, career events |
| ADR-011 | League schema | Feature | Accepted | ✅ | ✅ | 20 clubs/division (synced 2026-05-18); 38 matchdays |
| ADR-012 | UI architecture DOM↔Canvas | Presentation | Accepted (MVP: DOM only) | ✅ | ✅ | Canvas frontier documented for v1.1+ |
| ADR-013 | Match session re-enqueue | Foundation | Accepted | ✅ | ✅ | Option B (persist PRNG); verified by slice |

**Circular dependency check**: ADRs do NOT cycle. ADR-013 depends on ADR-007
+ ADR-002 + ADR-005 + ADR-008; ADR-011 depends on ADR-001 + ADR-002 + ADR-005
+ ADR-007 + ADR-008. Foundation → Core → Feature → Presentation flow is
acyclic. ✅

### Traceability Coverage

Coverage of the 9 GDDs by ADRs is high but not complete:

| GDD | Primary ADRs | Coverage gaps |
|---|---|---|
| cascade-engine.md | ADR-002, ADR-003, ADR-005, ADR-008 | None at architecture level. Per-edge formula tuning is GDD-internal. |
| match-simulation.md | ADR-002, ADR-007, ADR-013 | None. |
| economy.md | ADR-005 (persistence) | **Gap**: no dedicated economy ADR. State lives in WorldState (ADR-005) but the revenue/cost flow has no decision document. **Required ADR**: ADR-014 Financial Flow + Bankruptcy Protocol. |
| manager-rpg.md | ADR-010 | None. |
| staff-system.md | ADR-009 | None. |
| event-system.md | ADR-008 | **Gap**: no ADR for the special PlayerDecision types (corruption, scandal, cena de reconciliación). **Required ADR**: ADR-015 Special Event Decision Schema. |
| league-system.md | ADR-011 | None. |
| player-management.md | (relies on ADR-007 for match interface) | **Gap**: no ADR for player generation algorithm, form rolling, contract lifecycle. **Required ADR**: ADR-016 Player Lifecycle. |
| hud-ui.md | ADR-012 | **Gap (post-playtest)**: 5 OQs registered (OQ-HUD-09/10/11/12/13). Some may need ADRs after `/ux-design`. |

---

## Required New ADRs

### Accepted 2026-05-19 (resolved)

| ADR | Title | Status | Resolves |
|---|---|---|---|
| **ADR-014** | Financial Flow + Bankruptcy Protocol | ✅ Accepted | economy epic; OQ-ECO-06 (MAX_TICKET_EUR formula); bankruptcy FSM via ADR-008 ThresholdCrossings |
| **ADR-015** | Special Event Decision Schema | ✅ Accepted | event-system epic; typed PlayerDecisionPayload union (13 MVP variants); HUD modal rendering contract |
| **ADR-016** | Player Lifecycle | ✅ Accepted | player-management epic; world-gen + form rolling F4 + skill drift F12 + aging at season_end + contract renewal pipeline |
| **ADR-017** | UI Input Control Taxonomy | ✅ Accepted | hud-ui epic (partial); OQ-HUD-09 (input control families); OQ-HUD-10 (domain-language formatters) |
| **ADR-018** | Match Event Visual Feedback Library | ✅ Accepted | hud-ui epic (partial); OQ-HUD-11 (pixel-art sprite-in-DOM); OQ-HUD-12 (modal pacing); OQ-HUD-13 (playback timing + fast-forward) |

The 4 previously-blocked epics now have governing ADRs and can write stories.
**Epic status changes (2026-05-19)**:
- `economy` epic: ⚠ → ✅ Ready
- `event-system` epic: ⚠ → ✅ Ready
- `player-management` epic: ⚠ → ✅ Ready
- `hud-ui` epic: ⚠ partial → ✅ Ready (still waits on 5 UX specs + art-bible MVP
  addendum for full readiness, but ADR-level blockers cleared)

### Can defer to implementation

| ADR | Title | Notes |
|---|---|---|
| **ADR-019** | Background Match Sim Concurrency | When simulating 10 other matches per week (non-player) becomes a perf issue, decide batching strategy. Not blocking initial implementation. |

---

## Architecture Principles

These five principles govern every technical decision; conflicts with them
require an ADR.

1. **Server-authoritative state** — all game logic runs on the server. The
   client renders and inputs decisions only. (From `technical-preferences.md`
   Forbidden Patterns + reaffirmed by every ADR.)

2. **Determinism by default** — every simulation function takes a seeded
   `ctx.rng()`. `Math.random()` is forbidden in simulation code. Verified by
   slice. (ADR-002)

3. **Cross-module isolation** — each domain module owns its data; cross-module
   access goes through the module's exposed service, not direct DB queries.
   Slice followed this; production sprints must enforce via control-manifest.

4. **Cascade-engine is the truth for WorldState** — match-sim, event-system,
   manager-rpg all write to WorldState via `worldStateDeltas` that the cascade
   engine applies. No system mutates WorldState by side-effecting another
   system's domain. (ADR-003 + ADR-007 + ADR-008)

5. **Calm Is The Tempo at the architecture level** — no real-time pressure on
   the player at the system level. The world-clock waits for `advance()`. The
   match session waits for `decideMatch()`. Background workers don't push
   decisions; they execute them. (Game pillar 4 + ADR-008 + ADR-013)

---

## Open Questions

| ID | Summary | Priority | Resolution Path |
|---|---|---|---|
| QQ-01 | Match concurrency under load (10 background matches × per-week × N concurrent playthroughs) | Low (MVP is single-player) | ADR-019 if perf concern surfaces; not blocking MVP |
| QQ-02 | Long-tail of historical world_snapshots — when does the append-only history get compacted? | Low | Defer to Polish phase; for MVP, keep everything |
| QQ-03 | Socket.IO scaling beyond 1 server (Redis adapter? clustered?) | Low (single-server MVP) | Already documented in ADR-001; pick up when MMO becomes relevant (v2.0) |
| QQ-04 | Per-club calibration of `MAX_TICKET_EUR` and `MARKET_TICKET_EUR` (post-slice OQ-ECO-06) | Medium | ADR-014 (economy ADR — to be written) |
| QQ-05 | Resolution of 5 hud-ui.md polish OQs (OQ-HUD-09/10/11/12/13) | Medium | ADR-017 + ADR-018 + /ux-design |

---

## Carry-forward from Vertical Slice

The slice (`prototypes/cascada-vertical-slice-mes1/`, verdict CONFIRMED PROCEED)
proved this architecture works end-to-end. Production rebuild references:

- Match sim refactor pattern (extracted `runMatchTick` for ADR-013 compatibility)
- Drizzle partial UNIQUE INDEX with `sql` template literal
- Svelte 5 rune name collision workaround (`state` variable conflicts with rune)
- BullMQ + ioredis `maxRetriesPerRequest: null` requirement
- seedrandom `.state()` requires `{ state: true }` option (else returns undefined)

These are recorded in REPORT.md "Architectural surprises" — feed them into
ADR Engine Compatibility sections as they apply.

---

## Architecture Complete

Document version 1.0 — TD APPROVED WITH CONDITIONS (lean review-mode, LP-FEASIBILITY skipped per gate protocol).

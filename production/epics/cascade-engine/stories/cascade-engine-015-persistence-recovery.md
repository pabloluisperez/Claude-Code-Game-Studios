---
Story: CASCADE-ENGINE-015
Status: Integration
Type: Integration
GDD Requirement: AC-SER-01, AC-SER-02 (note: returns Record not Map per control-manifest), AC-SER-03, AC-SER-04, AC-SER-05
Governing ADR: ADR-005 (append-only world_snapshots), ADR-003 (Rule on serialization), ADR-002 (determinism survives reload)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/cascade-engine/persistence-recovery.test.ts
Engine Reference: docs/engine-reference/web/modules/database.md (Drizzle 0.36+)
---

# Story: WorldState + DelayedEffectsBuffer Persistence (ADR-005 append-only snapshots) + Recovery from Mid-Tick Crash

## Goal

Wire the cascade engine to ADR-005's `world_snapshots` table. Each successful `runTick()` produces a TickResult that is INSERTed as a new `world_snapshots` row (one row per playthrough per week). The serialized payload includes:

- `worldState` (Record<NodeId, number>) — the post-clamp nextState.
- `delayedEffectsBuffer` (DelayedEffect[]) — the buffer carried INTO the NEXT tick (i.e. `remaining + newDelayedEffects` from the current tick).
- `cascadeLog` (CascadeLog[]) — audit trail for the tick (dev-tool readability; production may compress).
- `thresholdCrossings` (ThresholdCrossing[]) — the crossings that fired this tick (consumed by event-system on read).

Plus the recovery path: on advance() startup, the latest snapshot is loaded; the delayed-effects buffer is restored intact; the engine resumes deterministically from there.

This is the FIRST story in this epic that requires the database. Real Postgres on port 5433 (per control-manifest Platform Layer). Drizzle ORM 0.36+. No Map<> in the JSON payload (forbidden per control-manifest).

## Scope

In `packages/db/src/schema/world-snapshots.ts` (new or augmented):

- `world_snapshots` table:
  - `id` (uuid PK)
  - `playthrough_id` (FK)
  - `week` (int, NOT NULL)
  - `world_state` (jsonb) — Record<NodeId, number>
  - `delayed_effects` (jsonb) — DelayedEffect[]
  - `cascade_log` (jsonb) — CascadeLog[] (can be null for old snapshots; the engine doesn't read this back, only writes)
  - `threshold_crossings` (jsonb)
  - `seed_state` (text, NULLABLE) — seedrandom state if applicable (carries over from match-sim pattern per ADR-013)
  - `created_at` (timestamp)
  - Index: `(playthrough_id, week)` — supports "most-recent snapshot" query
  - **No UPDATE semantics**: every tick is an INSERT (per ADR-005 append-only).

In `apps/api/src/modules/world-state/world-state-repo.ts`:

- `saveTickResult(playthroughId, week, tick, nextBuffer, seedState): Promise<void>` — single INSERT. Called by the advance loop (story not in this epic, but the signature is consumed by it).
- `loadCurrentWorldState(playthroughId): Promise<{ worldState, delayedEffects, week, seedState }>` — `ORDER BY week DESC LIMIT 1`.

In `packages/shared/src/sim/world-state-serde.ts`:

- `WorldStateJsonSchema` (Zod) — validates `Record<NodeId, number>`. All 20 nodes required; values are `z.number()` (with finite check); nulls/undefined rejected (AC-SER-03 invariant).
- `serializeWorldState(state): string` — `JSON.stringify`.
- `deserializeWorldState(json): WorldState` — `JSON.parse` + `WorldStateJsonSchema.parse`. Returns Record<NodeId, number> (NOT a Map — control-manifest forbidden pattern).
- Re-uses `DelayedEffectsJsonSchema` from story 003.

## Out of Scope

- The advance loop wiring itself (ADR-008 / event-system epic).
- BullMQ async writes — saveTickResult is sync within the advance loop's `db.transaction(...)` block (per control-manifest "Transactional advance() pipeline").

## Acceptance Criteria

1. **AC-SER-01**: WorldState containing `fan_momentum=58.123456789`, round-trip through `serializeWorldState` → `deserializeWorldState` → value matches to 6 significant decimals. (JS numbers are IEEE-754 doubles; full precision preserved by JSON.)
2. **AC-SER-02 (control-manifest adjusted)**: `deserializeWorldState()` returns a `Record<NodeId, number>` (NOT `instanceof Map`). The original AC-SER-02 in the GDD specifies `Map`, but per control-manifest Foundation Forbidden ❌ ("Map<> in JSON-serialized payloads"), the engine uses Record. **This is an intentional manifest-driven deviation from the GDD AC text**; the AC is satisfied if the deserialized result has all 20 NodeIds as keys and the values match the serialized input. Document this in the test name and as a code comment in `world-state-serde.ts`.
3. **AC-SER-03**: corrupted JSON with `null` value (`{"fan_momentum": null, ...}`) → `WorldStateJsonSchema.parse()` throws a `ZodError`. Verify the error message identifies the offending node.
4. **AC-SER-04**: DelayedEffectsBuffer with 3 effects (including one with `delta=-1.8` for the C15 case) → serialize + parse with `DelayedEffectsJsonSchema` → array length 3, all `applyAt`, `toNode`, `delta`, `edgeId` preserved.
5. **AC-SER-05 (integration with real DB)**: With Postgres running on port 5433, INSERT a TickResult snapshot, then SELECT and reconstruct → identical WorldState + identical delayed buffer. Marked `@integration` (Vitest tag for the slow tier).
6. **Append-only invariant**: writing the same `(playthroughId, week)` twice produces TWO rows (no upsert) — verify with a SQL count after two `saveTickResult` calls for week 3 → row count = 2. (Note: per ADR-005 normal flow, the same week is never re-inserted in production — but the schema must not have a unique constraint that would silently UPDATE.)
7. **Recovery determinism**: advance 5 ticks from a fresh playthrough, persist each. Then load the snapshot from week 3 and re-advance 2 more ticks using the same seed → resulting week-5 worldState is **identical** to the original week-5 snapshot. This is the canonical "recovery is lossless" test.
8. **Buffer mid-flight survives crash**: prevState at W=3 has buffer `[{applyAt:5, delta:-1.8, ...}]`. Save snapshot at W=3 with buffer. Load snapshot, advance W=4, advance W=5. At W=5, the effect from W=3 fires (buffer integrity end-to-end).
9. **Schema validation rejects malformed**: a row inserted via raw SQL with `world_state = '{"foo": 1}'` (missing required nodes) → `loadCurrentWorldState` rejects via Zod with a clear error. Defends against accidental schema drift / manual DB edits.
10. **Drizzle 0.36+ syntax**: per control-manifest, use `sql` template literal in `.where()` clauses, not raw strings (verified by slice). The `index('idx_ws_playthrough_week').on(table.playthroughId, table.week)` syntax is the 0.36+ pattern.
11. **Migration committed**: every `pnpm run db:generate` output is committed (control-manifest required). Story-done requires the migration file to exist under `packages/db/migrations/` and be in git.

## Test Requirements (Logic + Integration, BLOCKING)

- **Logic** (`tests/unit/cascade-engine/world-state-serde.test.ts`): AC #1, #2, #3, #4, #9.
- **Integration** (`tests/integration/cascade-engine/persistence-recovery.test.ts`, real DB on port 5433): AC #5, #6, #7, #8.
- **Schema migration smoke** (manual or in CI): `pnpm run db:migrate` applies cleanly; `pnpm run db:generate` produces no diff after the schema is committed.

## Dependencies

- **Upstream blockers**: 001 (types), 003 (DelayedEffectsBuffer + JSON schemas), 004 (runTick returns TickResult), 005 (Step 2/3 to produce realistic buffers), 014 (thresholdCrossings field in TickResult).
- **Downstream**: ADR-008 advance loop epic (consumes `saveTickResult` and `loadCurrentWorldState` signatures).

## Estimate

**2 days.** The Drizzle schema + repo is small but the integration test setup (real DB, migration, transactional wrappers) is the time sink. Story 015 is the only one in this epic with `Type: Integration` requiring the real DB; treat as a fixed cost.

## Notes / Gotchas

- **Control-manifest deviation from GDD AC-SER-02**: explicitly call out in the test and in `world-state-serde.ts`. The GDD says "result instanceof Map === true"; control-manifest forbids Map in JSON payloads; production uses Record. The test asserts on Record shape, not Map type. If future story regenerates `Map<>` (e.g. for cascade-engine internals), serialization layer MUST convert at the boundary.
- **Postgres port is 5433, NOT 5432** (control-manifest Platform Layer). Integration tests' connection string must respect this. The slice's `docker-compose.yml` is the reference.
- **Transactional advance() pipeline** (control-manifest Foundation Required): a single advance call that fails partway must roll back the snapshot insert. This story implements `saveTickResult` as a sync function callable inside a `db.transaction(...)`; the advance loop in ADR-008 wraps the full pipeline (match outcome + standings + cascade tick + snapshot + manager state + staff messages + currentWeek bump) in one transaction. Story 015 ensures `saveTickResult` is transaction-compatible (uses the `tx` parameter, not the global db client).
- **seedrandom persistence (ADR-013 Option B)**: if the playthrough uses match-sim PRNG state, `seed_state` is `JSON.stringify(seedrandom().state())`. Seedrandom must be constructed with `{ state: true }` (else `.state()` returns undefined — verified by slice). This story's schema allows `seed_state` nullable; only match weeks populate it. For cascade-only ticks, null is fine.
- **Append-only without unique constraint**: don't add `unique(playthrough_id, week)`. The advance loop never re-runs the same week (ADR-008), but defending against accidental UPDATE semantics is cheap. If the user wants a unique constraint LATER for paranoia, that's an ADR amendment, not silent schema drift.

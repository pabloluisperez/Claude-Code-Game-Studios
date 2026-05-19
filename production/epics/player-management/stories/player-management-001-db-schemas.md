---
Story: PLAYER-MANAGEMENT-001
Status: Ready
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: N/A — architectural prerequisite (ADR-005 playthroughs + ADR-016 world_snapshots)
Governing ADR: ADR-005 (WorldState persistence)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/ (smoke check — no integration test runs without DB)
---

# Story 001: playthroughs + world_snapshots Drizzle Schemas (ADR-005)

> **Epic**: player-management
> **Layer**: Foundation (DB)
> **Type**: Integration
> **Estimate**: 0.5 days
> **Manifest Version**: 2026-05-19

## Context

**ADR Governing Implementation**: ADR-005 — WorldState Persistence
**ADR Decision Summary**: Players, match_sessions, and world_snapshots all reference `playthroughs.id` as a FK. The `playthroughs` and `world_snapshots` tables are defined in ADR-005 but have NOT yet been created as Drizzle schema files. player-management is the first epic to require them; creating them here unblocks MATCH-SIM-015.

**Control Manifest Rules (Foundation layer)**:
- Required: Drizzle partial UNIQUE syntax via `sql` template literal in `.where()` clauses
- Required: `xxxRelations` export alongside every table definition (Drizzle relational API)
- Required: Drizzle migrations checked in (run `pnpm run db:generate` after adding schema)
- Forbidden: Mutating WorldState — snapshots are append-only

## Acceptance Criteria

- [ ] `packages/db/src/schema/playthroughs.ts` created with `playthroughs` table matching ADR-005 spec: `id` (uuid PK), `userId` (uuid FK → users), `clubId` (uuid FK → clubs), `currentWeek` (int default 0), `lastTickAt` (timestamp), `createdAt`, `updatedAt`. Plus `playthroughsRelations` export.
- [ ] `packages/db/src/schema/playthroughs.ts` includes `world_snapshots` table: `id`, `playthroughId` (FK → playthroughs), `week`, `worldState` (jsonb), `delayedEffectsBuffer` (jsonb), `createdAt`. UNIQUE index on `(playthroughId, week)`.
- [ ] `packages/db/src/schema/index.ts` exports both new tables.
- [ ] `packages/db/src/schema/sessions.ts` (existing auth sessions) has NO conflict with the new tables.
- [ ] `pnpm run db:generate` in `packages/db/` produces a migration file. Migration committed.
- [ ] TypeScript compiles clean (`tsc --noEmit`) after adding schema.

## Implementation Notes (from ADR-005)

```typescript
// packages/db/src/schema/playthroughs.ts
export const playthroughs = pgTable('playthroughs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  clubId: uuid('club_id').notNull().references(() => clubs.id),
  currentWeek: integer('current_week').notNull().default(0),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const worldSnapshots = pgTable('world_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull().references(() => playthroughs.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  worldState: jsonb('world_state').notNull(),
  delayedEffectsBuffer: jsonb('delayed_effects_buffer').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePerWeek: uniqueIndex('world_snapshots_playthrough_week').on(t.playthroughId, t.week),
}));
```

## Out of Scope

- Story 002: `players` table (separate story)
- MATCH-SIM-015: `match_sessions` table (depends on this story)

## QA Test Cases

**Type**: Integration (run with real Postgres on port 5433)

- **AC-1**: Run `pnpm run db:generate` → migration file produced. `pnpm run db:migrate` applies it cleanly without error.
- **AC-2**: Insert a playthrough row; insert a world_snapshot row with `playthroughId` = the playthrough. Passes FK constraint.
- **AC-3**: Attempt to insert two world_snapshots with the same `(playthroughId, week)` → unique constraint violation.
- **AC-4**: Delete a playthrough → cascade-deletes all associated world_snapshots.
- **AC-5**: `tsc --noEmit` in packages/db — 0 errors after schema addition.

## Test Evidence

**Story Type**: Integration
**Required evidence**: Migration applies cleanly on Postgres port 5433. `tsc --noEmit` passes.

## Dependencies

- Depends on: clubs table (exists), users table (exists)
- Unlocks: Story 002 (players schema), MATCH-SIM-015 (match_sessions schema)

---
Story: PLAYER-MANAGEMENT-002
Status: Complete
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-PM-001 — players table + PlayersRepo
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/player-management/players-repo.test.ts
---

# Story 002: players Drizzle Schema + PlayersRepo

> **Epic**: player-management
> **Layer**: Core
> **Type**: Integration
> **Estimate**: 1 day
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-001` — players are stored per-row in a normalised Drizzle table with composite index on `(playthroughId, clubId)` for fast per-club lineup lookup.

**ADR Governing Implementation**: ADR-016 — Player Lifecycle
**ADR Decision Summary**: Players live in a dedicated `players` table (normalised, per-row). Expected size: ~800 rows × ~250 bytes per playthrough. Indexed by `(playthroughId, clubId)`.

**Control Manifest Rules (Core layer)**:
- Required: `xxxRelations` export alongside table definition
- Required: Drizzle migrations checked in after `db:generate`
- Forbidden: Cross-module direct DB access — only `players/repo.ts` reads/writes `players` table

## Acceptance Criteria

- [ ] `packages/db/src/schema/players.ts` created with all columns from ADR-016: `id`, `clubId`, `playthroughId`, `firstName`, `lastName`, `nationality`, `birthWeek`, `position`, `skill`, `fitness`, `morale`, `form`, `stamina`, position-specific stats (`reflexes`, `handling`, `strength`, `tackling`, `passing`, `vision`, `speed`, `finishing`), `salaryEurK`, `contractStartWeek`, `contractEndWeek`, `availability`, `injuredUntilWeek`, `recentRatings` (jsonb), `createdAt`.
- [ ] Composite index `(playthroughId, clubId)` + index `(playthroughId)` present.
- [ ] `playersRelations` exported alongside the table.
- [ ] `packages/db/src/schema/index.ts` exports `players`.
- [ ] `apps/api/src/modules/players/repo.ts` created with: `createPlayers(tx, rows[])`, `findByClub(playthroughId, clubId) → Player[]`, `findById(id) → Player | null`, `updatePlayer(tx, id, patch)`, `getSquadAvailabilityCount(playthroughId, clubId) → { available: number; total: number }`.
- [ ] Migration generated and committed.
- [ ] `tsc --noEmit` clean.

## Implementation Notes (from ADR-016)

```typescript
// packages/db/src/schema/players.ts
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  playthroughId: text('playthrough_id').notNull().references(() => playthroughs.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nationality: text('nationality').notNull().default('ES'),
  birthWeek: integer('birth_week').notNull(),
  position: text('position').notNull(), // 'GK' | 'DEF' | 'MID' | 'FWD'
  skill: integer('skill').notNull(),
  fitness: integer('fitness').notNull().default(90),
  morale: integer('morale').notNull().default(60),
  form: integer('form').notNull().default(60),
  stamina: integer('stamina').notNull().default(75),
  reflexes: integer('reflexes'), handling: integer('handling'),
  strength: integer('strength'), tackling: integer('tackling'),
  passing: integer('passing'), vision: integer('vision'),
  speed: integer('speed'), finishing: integer('finishing'),
  salaryEurK: integer('salary_eur_k').notNull(),
  contractStartWeek: integer('contract_start_week').notNull(),
  contractEndWeek: integer('contract_end_week').notNull(),
  availability: text('availability').notNull().default('available'),
  injuredUntilWeek: integer('injured_until_week'),
  recentRatings: jsonb('recent_ratings').$type<number[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byClub: index('players_by_club').on(t.playthroughId, t.clubId),
  byPlaythrough: index('players_by_playthrough').on(t.playthroughId),
}));
```

`getSquadAvailabilityCount` uses the constant `SQUAD_REGISTERED_SIZE = 25` as denominator for `squad_available_pct` calculation per AC-PM-11 (F8).

## Out of Scope

- Story 003: world-gen (generateRoster uses this schema to INSERT players)
- Story 006: squad_available_pct cascade update

## QA Test Cases

- **AC-1**: `createPlayers` inserts 40 players for a club; `findByClub` returns exactly 40.
- **AC-2**: `updatePlayer` sets `availability='injured'`; subsequent `findById` returns `availability='injured'`.
- **AC-3**: `getSquadAvailabilityCount` with 14 available + 4 injured + 1 suspended + 6 other = total 25: returns `{ available: 14, total: 25 }`.
- **AC-4**: Delete a club → cascade deletes all its players.
- **AC-5**: `tsc --noEmit` passes in both `packages/db` and `apps/api`.

## Test Evidence

**Story Type**: Integration
**Required evidence**: Integration tests in `tests/integration/player-management/players-repo.test.ts` against real Postgres (port 5433).

## Dependencies

- Depends on: Story 001 (playthroughs table FK target)
- Unlocks: Story 003 (world-gen needs to INSERT players), MATCH-SIM-015 (match_sessions FK to playthroughs — now exists)

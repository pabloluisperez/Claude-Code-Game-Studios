---
Story: STADIUM-UPGRADES-001
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Logic
GDD Requirement: AC-SU-04/05/06/07/08 (FSM preconditions — schema shape)
Governing ADR: ADR-029 §D2, ADR-005
Control Manifest: 2026-05-19
Test Evidence: packages/db/tests/stadium-upgrades-schema.test.ts (8/8 passing)
ImplementedAt: packages/db/src/schema/stadium-upgrades.ts + packages/db/drizzle/0027_stadium_upgrades.sql + packages/db/drizzle/0028_stadium_world_state_backfill.sql
---

# Story: Drizzle schema + migration 0025 (stadium_upgrade_items + WorldState extends)

## Goal

Create the canonical Drizzle table and migration for stadium upgrades, plus the 3 new fields on `world_state_snapshots`. This is the foundation every other story compiles against.

## Scope

In `packages/db/src/schema/stadium-upgrades.ts` (new file):

- `stadiumUpgradeItems` pgTable with columns per ADR-029 §D2: `id`, `clubId`, `itemSlug`, `track`, `tier`, `status`, `costPaidEurK`, `durationWeeks`, `weeksRemaining`, `directorSkillSnapshot`, `startedAt`, `completedAt`, `cancelledAt`, `createdAt`
- Foreign key: `clubId → clubs.id`
- Status enum: `'queued' | 'in_progress' | 'complete' | 'cancelled'` (TypeScript) — DB column is `text` validated by Drizzle check constraint

In `packages/db/migrations/0025_stadium_upgrades.sql` (generated):

- CREATE TABLE statement
- **PARTIAL UNIQUE INDEX**: `CREATE UNIQUE INDEX stadium_upgrade_one_active_per_club ON stadium_upgrade_items (club_id) WHERE status = 'in_progress'` — enforces queue invariant (§3.1.4 of GDD)
- ALTER TABLE `world_state_snapshots` ADD COLUMN `stadium_upgrade_count INTEGER NOT NULL DEFAULT 0`
- ALTER TABLE `world_state_snapshots` ADD COLUMN `training_facility_level INTEGER NOT NULL DEFAULT 0`
- ALTER TABLE `world_state_snapshots` ADD COLUMN `youth_academy_level INTEGER NOT NULL DEFAULT 0`

In `packages/db/migrations/0026_world_state_backfill.sql` (separate migration):

- `UPDATE world_state_snapshots SET stadium_upgrade_count = 0, training_facility_level = 0, youth_academy_level = 0 WHERE stadium_upgrade_count IS NULL`
- (Idempotent — safe to re-run)

## Out of Scope

- Catalog YAML schema (story 002)
- Domain types in `packages/shared` (story 003)
- Service logic (story 005)

## Acceptance Criteria

1. `stadium_upgrade_items` table exists with all 12 columns per ADR-029 §D2
2. Foreign key constraint `club_id → clubs.id` enforced
3. Partial unique index prevents 2 in_progress items per club (insert violates constraint)
4. `world_state_snapshots` has 3 new columns with default 0
5. Migration applies cleanly on fresh DB (`drizzle-kit push` succeeds)
6. Migration applies cleanly on existing DB with WorldState data (backfill 0026 idempotent)
7. Drizzle types compile: `import { stadiumUpgradeItems } from '@smt/db'` works in apps/api

## Test Requirements (Logic, BLOCKING)

`packages/db/tests/stadium-upgrades-schema.test.ts`:

- INSERT row, SELECT row, verify shape
- INSERT 2nd row with same `club_id` + `status='in_progress'` → expect constraint violation
- INSERT 1st row `in_progress`, UPDATE to `complete`, then INSERT 2nd `in_progress` → succeeds (constraint only blocks parallel `in_progress`)
- Verify `world_state_snapshots` has new columns + default 0 on freshly created row

## QA Test Cases

Source: `production/qa/qa-plan-sprint-22-2026-05-25.md §22-1`.

**Test file**: `packages/db/tests/stadium-upgrades-schema.test.ts` (~8 tests)

Cases:
1. INSERT + SELECT round-trip on `stadium_upgrade_items` — verify shape matches Drizzle types
2. FK violation: INSERT with non-existent `club_id` → expect FK error
3. Partial unique index: INSERT 2 `in_progress` rows for same club → expect constraint violation
4. Sequential lifecycle OK: INSERT A `in_progress`, UPDATE A to `complete`, INSERT B `in_progress` for same club → succeeds
5. `world_state_snapshots`: 3 new columns exist with default 0 on freshly-inserted row
6. Backfill migration 0026 idempotent — run twice, no errors
7. Edge: `status='cancelled'` does NOT block unique index (only `in_progress` blocks)
8. Edge: 2 different clubs each `in_progress` → both succeed (per-club constraint)

**Manual evidence**:
- [ ] Migration replay against local-dev DB copy: `drizzle-kit push --dry-run` shows expected diff
- [ ] Output captured in `production/qa/evidence/22-1-migration-replay.txt`

## Dependencies

- **Upstream**: none — Foundation first-mover
- **Downstream**: 002, 003, 005 (all import the schema)

## Estimate

**0.5 day.** Pure schema + migration + small test.

## Notes / Gotchas

- Use Drizzle's `text` not `pgEnum` for status (more flexible for future states)
- Migration filenames continue numbering from latest existing migration in `packages/db/migrations/` — verify before writing
- The partial unique index is the **DB-level guard** for queue invariant; service code MUST handle the unique violation error (story 006 will translate to HTTP 409)

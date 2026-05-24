---
Story: LEAGUE-SYSTEM-001
Status: Complete
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-LGS-001 (5 Drizzle tables: leagues, divisions, seasons, fixtures, standings)
Governing ADR: ADR-011 (League / Competition Schema)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/league-system/db-schema.test.ts
---

# Story 001: leagues / divisions / seasons / fixtures / standings Drizzle Schemas

> **Epic**: league-system | **Layer**: Foundation | **Type**: Integration | **Estimate**: 1 day

## Context

**Note**: `fixtures` is the FK target MATCH-SIM-015 needs. This story unblocks it.

**ADR-011 §Drizzle Schema Addition** defines 5 new tables (clubs already exists):
- `leagues` (id, name, country, playthrough_id FK)
- `divisions` (id, league_id FK, tier int [1-5], name)
- `seasons` (id, division_id FK, year_start int, status text)
- `fixtures` (id, season_id FK, home_club_id FK, away_club_id FK, week int, status, home_score, away_score, played_at)
- `standings` (id, season_id FK, club_id FK, points int, played int, won int, drawn int, lost int, goals_for int, goals_against int)

All tables include `xxxRelations` exports + composite indexes per ADR.

## Acceptance Criteria

- [ ] `packages/db/src/schema/leagues.ts` + `divisions.ts` + `seasons.ts` + `fixtures.ts` + `standings.ts` (5 files).
- [ ] All exported from `packages/db/src/schema/index.ts`.
- [ ] `pnpm run db:generate` produces migration; migration applies cleanly to Postgres :5433.
- [ ] FK constraints verified: deleting a season cascades to its fixtures + standings.
- [ ] UNIQUE constraint on `(season_id, week, home_club_id)` for fixtures (no double-booking).
- [ ] Indexes per ADR-011 on `(playthrough_id, league_id)`, `(season_id, week)` for query patterns.
- [ ] `tsc --noEmit` clean on db package (other pre-existing tech debt errors acceptable).

## QA Test Cases (Integration)

- AC-1: All 5 tables visible in `\dt` after migration.
- AC-2: Insert a fixture → FK to season + 2 clubs verified.
- AC-3: Delete a season → cascading delete of fixtures + standings.
- AC-4: Duplicate (season, week, home_club) → UNIQUE violation.

## Dependencies

- Depends on: clubs table (exists), playthroughs (player-mgmt PM-001 ✓)
- Unlocks: MATCH-SIM-015 (match_sessions FK to fixtures), all other league-system stories

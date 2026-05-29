# 25-2 — Free-agent contractStatus in players + migration 0030

**Sprint:** 25 | **Owner:** web-backend | **Est:** 0.5d | **Dependencies:** 25-1 | **Status:** Done

## Problem

The `players` schema already has `contractStatus`, `weeksUnsigned`,
`wageExpectationEurKWeek`, and `transferListed` columns (hand-added in
Sprint 24/25). Migration 0030 (`0030_player_contract_status.sql`) exists
and is registered in `_journal.json`.

This story verifies the migration is applied and the schema is in sync
with the DB, and that existing players get proper backfill.

## Acceptance Criteria

- [x] `pnpm db:migrate` completes without errors (migration 0030 applied)
- [x] Schema columns match migration DDL (contract_status, weeks_unsigned, wage_expectation_eur_k_week)
- [x] Existing players have `contract_status = 'in_contract'` (backfill verified)
- [x] Players with `contract_end_week - current_week <= 8` have `contract_status = 'expiring'`
- [x] Players with `club_id IS NULL` have `contract_status = 'free_agent'`
- [x] `idx_players_contract_status` index exists
- [x] Unit tests for contract status classification logic in `@smt/shared` (11 tests)

## Implementation Notes

### Schema already exists
- `players.ts` already defines all columns with correct defaults
- `0030_player_contract_status.sql` hand-authored
- The `makeOffer` service in `scouting-market/service.ts` already reads `contractStatus`
- The `getMarket` service already classifies `free_agent` / `expiring` / `in_contract`

### What's needed
1. After 25-1 (drizzle generate works), run migration against the test DB
2. Verify backfill logic in the migration SQL matches expected behavior
3. Add unit tests for `contractStatus` classification in `@smt/shared`
4. Verify `transferListed` column is also in schema + migration 0031

### Related migrations
- 0031 `0031_transfer_listed.sql` — adds `transfer_listed` column
- 0032 `0032_backfill_player_variance.sql` — variance backfill

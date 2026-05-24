# Smoke check — Sprint 11 (2026-05-21)

**Verdict**: ✅ **PASS**

**Run by**: autopilot session (Sprint 11 closeout)
**Date**: 2026-05-21
**Sprint**: 11 — Polish (orchestrator full + tick diario foundation + A11y P1)

---

## Automated test suite

| Package | Test files | Tests | Status |
|---------|-----------|-------|--------|
| `@smt/shared` | 63 | 953 | ✅ PASS |
| `@smt/api` | 6 | 44 | ✅ PASS |
| `@smt/web` | 4 | 49 (+ 4 todo) | ✅ PASS |
| **Total** | **73** | **1046** | ✅ **PASS** |

`+ 4 todo` are deliberate Sprint 12+ deferrals from `advance-days.test.ts`
documenting ADR-020 §"Implementation Plan (deliberately deferred)" items
(STOP event mid-day, match-on-Saturday, day-6 rollover, cascade decay
Option A revisit).

Net change from Sprint 10 close baseline (998 tests): **+48 tests** across
the 4 stories shipped this sprint (+14 orchestrator extraction +21 A11y P1
+17 advance-days; -4 deferred to Sprint 12).

Runtime: ~2.3s total (turbo cached). All packages green on first run after
the schema migration (no fixture drift from the new `current_day_of_season`
column).

---

## Schema migration (11-4)

- `packages/db/drizzle/0021_confused_next_avengers.sql` applied successfully
  to local Postgres (port 5433).
- `playthroughs.current_day_of_season` column verified via `\d playthroughs`:
  - Type: `integer`, `not null`, `default 0`
- Backfill verified: `UPDATE playthroughs SET current_day_of_season = current_week * 7`
  ran without error.
- Drizzle TypeScript types regenerated; `Playthrough.currentDayOfSeason`
  required in all `db.insert(playthroughs).values(...)` call sites (verified
  by `svelte-check`: 0 errors).

---

## Critical path verification (static)

| # | Path | Verified via | Result |
|---|------|--------------|--------|
| 1 | Dashboard advance action delegates to `runAdvanceTickFull` | `apps/web/tests/advance-orchestrator-extraction.test.ts` (14 grep-based tests) | ✅ PASS |
| 2 | `runAdvanceTickFull` writes `currentDayOfSeason` atomically with `currentWeek` | Source inspection — both fields in same `tx.update(playthroughs)` call | ✅ PASS |
| 3 | `advanceDays({ daysToAdvance: 0 })` no-op idempotency | `advance-days.test.ts` test_advance_days_zero_days_is_no_op_idempotent | ✅ PASS |
| 4 | `currentWeek === floor(currentDayOfSeason / 7)` invariant | `advance-days.test.ts` math invariants (6 tests) | ✅ PASS |
| 5 | A11y P1 confirm-dialog focus trap + return | `a11y-p1-batch.test.ts` (5 tests) | ✅ PASS |
| 6 | A11y P1 advance-transition focus management | `a11y-p1-batch.test.ts` (4 tests) | ✅ PASS |
| 7 | A11y P1 tab aria attributes (/finance, /league, /inbox) | `a11y-p1-batch.test.ts` (5 tests) | ✅ PASS |
| 8 | A11y P1 match aria-live region | `a11y-p1-batch.test.ts` (3 tests) | ✅ PASS |
| 9 | A11y P1 balance icon/prefix | `a11y-p1-batch.test.ts` (4 tests) | ✅ PASS |
| 10 | Type checking: 0 errors across apps/web | `pnpm exec svelte-check` (920 files) | ✅ PASS |

---

## What was NOT verified by this smoke

- **Browser e2e flow**: dashboard → advance → next week. Requires manual
  walkthrough by Pablo. The structural regression net (14 grep-based tests +
  998 simulation regression tests) is high confidence that the extraction
  did not introduce behavioral drift, but the full end-to-end button click
  has not been exercised in this session.
- **A11y screen reader behavior**: aria attributes are declared (verified by
  21 tests); the actual VoiceOver/NVDA announcement requires manual ear
  test by Pablo (~5 min keyboard pass — checklist in
  `production/qa/evidence/a11y-p1-sprint-11.md`).
- **Playtest #1 (11-5)**: deferred to Pablo's availability — not a Sprint 11
  blocker per the sprint plan's Nice-to-Have classification.

These items are **CONDITIONAL** in the QA sign-off below.

---

## Smoke verdict

✅ **PASS** — Sprint 11 build is ready for QA hand-off. 1046 automated
tests green, 0 type errors, all 4 must/should-have stories delivered.

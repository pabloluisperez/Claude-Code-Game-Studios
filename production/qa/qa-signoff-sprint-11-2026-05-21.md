# QA Sign-Off Report — Sprint 11 (2026-05-21)

**Verdict**: ✅ **APPROVED WITH CONDITIONS**

**Sprint**: 11 — Polish (orchestrator full extraction + tick diario foundation + A11y P1 batch)
**Window**: 2026-09-23 → 2026-10-06 (per plan) · actual delivery 2026-05-21 (autopilot)
**Phase**: Polish
**Review Mode**: lean

---

## Stories delivered

| ID | Story | Priority | Status | Evidence |
|----|-------|----------|--------|----------|
| 11-1 | Aceptar ADR-020 | Must Have | ✅ Done | ADR Status = Accepted, Decision Log stamped 2026-05-21 |
| 11-2 | Orchestrator DB-write extraction | Must Have | ✅ Done | `runAdvanceTickFull` in `apps/web/src/lib/server/advance-orchestrator.ts` + 14 grep-based regression tests + README update at `apps/api/src/modules/advance/README.md` documenting the deviation |
| 11-3 | A11y P1 batch (6 findings) | Must Have | ✅ Done | 21 automated aria tests + `production/qa/evidence/a11y-p1-sprint-11.md` walkthrough checklist |
| 11-4 | Day-by-day tick foundation | Should Have | ✅ Done | Schema migration 0021 + `advanceDays` API + 17 tests + Drizzle types |
| 11-5 | Playtest Polish #1 | Nice to Have | ⏸ Blocked | Pablo solo session — deferred to availability window |

**Delivered: 4 of 5 stories (3 Must Have + 1 Should Have).** Nice-to-have
playtest is blocked on Pablo only, not on a dev gap.

---

## Definition of Done check

| Criterion | Status | Notes |
|-----------|--------|-------|
| 11-1, 11-2, 11-3 completed (Must Have) | ✅ | All three closed with tests + evidence |
| 11-4 completed (Should Have, optional) | ✅ | Foundation landed; partial-day decomposition deferred to Sprint 12+ per ADR-020 §"Option B" |
| QA plan exists | ✅ | `production/qa/qa-plan-sprint-11-2026-05-21.md` |
| All acceptance criteria superados | ✅ with deviation flag (11-2) | See "Deviations" below |
| Smoke check pasado | ✅ | `production/qa/smoke-sprint-11-2026-05-21.md` PASS — 1046 tests green |
| QA sign-off report APPROVED or APPROVED WITH CONDITIONS | ✅ | This document |
| `dashboard/+page.server.ts` advance action sin pipeline | ✅ | 14 grep-negative tests assert no inline pipeline calls; action collapsed from ~340 LOC to ~30 LOC |
| ADR-020 en estado Accepted | ✅ | Decision Log updated 2026-05-21 |
| 6 hallazgos A11y P1 cerrados con evidencia | ✅ con condición | All 6 wired and tested; manual walkthrough sign-off pending (Pablo ~5 min) |
| Sin bugs S1/S2 nuevos | ✅ | None observed in tests or type check |
| Design docs actualizados para desviaciones | ✅ | `apps/api/src/modules/advance/README.md` documents the HTTP-route deferral |

---

## Deviations from Sprint 11 plan

### Deviation 1: Orchestrator location (11-2)

**Plan said**: `apps/api/src/modules/advance/orchestrator.ts` + Hono route
`POST /api/advance` + cross-process HTTP call from dashboard form action.

**Delivered**: `apps/web/src/lib/server/advance-orchestrator.ts` —
`runAdvanceTickFull` lives in `apps/web` next to its 7 helper dependencies.
Dashboard form action calls it directly (no HTTP boundary). The Hono
`POST /api/advance` route was NOT created.

**Reason**:
1. `apps/web` cannot import from `apps/api` (sibling workspace constraint).
   The 7 server-side helpers (match-day-runner, economy-tick, season-rollover,
   etc.) live in `apps/web/src/lib/server/`. Moving the orchestrator to
   `apps/api` would have required moving 7 helpers first — outside Sprint 11
   scope.
2. Cross-process HTTP introduces session-cookie forwarding + atomicity
   loss without buying value for the current MVP (no MMO yet).
3. The Sprint 11 architectural intent — *single isolated orchestrator, thin
   form action, full test coverage* — is delivered ~90% by the current
   extraction. The remaining ~10% (the HTTP boundary) is scoped to Sprint
   12+ when realtime-multiplayer-specialist designs the MMO migration.

**Impact**: low. The extraction is a single-function call site refactor away
from the planned location. The future move is a file-relocation +
dependency-port, not a behavioral refactor — and this is explicitly
documented in `apps/api/src/modules/advance/README.md`.

### Deviation 2: Day-by-day decomposition (11-4)

**Plan said**: `advanceDays(playthroughId, n)` with per-day loop, STOP event
mid-day halt, match on Saturday, end-of-week rollover on day 6.

**Delivered**: `advanceDays({ ctx, daysToAdvance, redirectMode })` accepts
only `daysToAdvance ∈ {0, 7}` (no-op + weekly batch). Per-day decomposition
is throw-on-unsupported. ADR-020 §"Implementation Plan (deliberately
deferred)" Option B is locked: weekly batches preserve all existing test
fixtures; partial-day work moves to Sprint 12+.

**Reason**: ADR-020 itself explicitly defers per-day decomposition because
(a) cascade decay timing has to be played-tested before committing
Option A vs Option B, and (b) the migration risk on the 998 existing tests
is high if STOP events / match-day-timing change semantics simultaneously.

**Impact**: low. The schema column lands now (additive, non-breaking).
The `advanceDays` public API is the right shape for future expansion —
Sprint 12+ relaxes the `daysToAdvance % 7` constraint when mid-week pause
needs it. 4 `it.todo` items in `advance-days.test.ts` mark the deferred
work so the next agent picks them up.

---

## Conditions (action items before next gate)

1. **Pablo manual walkthrough — A11y P1 (~5 min keyboard pass)**: Verify
   confirm-dialog focus, advance-transition focus, tab keyboard nav,
   match aria-live with VoiceOver, balance icon visibility in reduced-color
   mode. Checklist: `production/qa/evidence/a11y-p1-sprint-11.md`. Once
   complete, A11y audit moves from CONDITIONAL PASS to PASS for P0+P1
   scope.

2. **Playtest Polish #1 (11-5)**: ~45 min session against post-Sprint-11
   build. Foco: does the cleaner advance action feel any different? Is the
   foundation right for the day-by-day work in Sprint 12+? Report at
   `production/playtests/YYYY-MM-DD-polish-sprint-11.md`.

3. **Browser e2e of dashboard advance flow**: Manual click-through to
   confirm the form action HTTP-302 still works after the extraction. The
   14 structural tests are high confidence, but the integration was not
   exercised via real browser this session.

4. **Sprint 12 carry-forward backlog** (auto-built from this sign-off):
   - Mid-week pause feature (ADR-020 §"Enables") — true per-day decomposition
   - STOP event scheduledDayOfSeason support in calendar_events schema
   - Cascade decay Option A vs Option B revisit (driven by playtest data)
   - Cross-app HTTP route migration (`POST /api/advance` Hono route) if
     MMO realtime work begins in Sprint 12

---

## Carry-forward to Sprint 12

| Item | Source | Type |
|------|--------|------|
| Mid-week pause feature | ADR-020 + Sprint 9 playtest finding E | Implementation |
| Per-day decomposition in `advanceDays` | ADR-020 deferred items + 4 `it.todo` in advance-days.test.ts | Implementation |
| `POST /api/advance` Hono route + cross-app HTTP migration | 11-2 deviation | Architectural |
| 3 A11y P2 findings (skip-link, heading levels, sponsor form labels) | A11y audit | Polish |
| Playtest #1 follow-up (if 11-5 surfaces findings) | This sprint | TBD |
| Playtest #2 + #3 (rounding out Polish-phase 3-session minimum) | Polish phase requirement | Validation |

---

## Verdict summary

✅ **APPROVED WITH CONDITIONS** — Sprint 11 delivered all 3 Must Have
stories + 1 Should Have story with 1046 automated tests green and 0 type
errors. The 2 deviations (orchestrator location, day-by-day decomposition
scope) are documented and have a clear Sprint 12+ path. The 3 conditions
are owner-side action items (Pablo walkthrough + playtest + e2e check) —
none blocks merge.

The Polish phase remains on track. Sprint 11 reduces architectural debt
(thin dashboard action, isolated pipeline, accepted ADR), expands a11y
coverage (P0 + P1 closed; only P2 backlog left), and lays foundation for
mid-week pause in Sprint 12.

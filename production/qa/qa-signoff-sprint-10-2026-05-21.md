# QA Sign-Off — Sprint 10 (2026-05-21)

> First Polish-phase sprint. Solo-dev autopilot sign-off; QA-lead role
> fulfilled by Pablo + synthesis of the smoke check at
> `production/qa/smoke-sprint-10-2026-05-21.md`.

## Sprint 10 Goal Recap

Address every carry-forward condition from the Production → Polish gate report
so the project enters Polish with no architectural debt blocking later feature
work.

## Story-by-Story Verdict

| Story | Type | Test Evidence | Verdict |
|---|---|---|---|
| 10-1 Day-by-day tick model ADR | Design | `docs/architecture/ADR-020-day-by-day-tick.md` — Engine Compat + ADR Deps + GDD Reqs + Implementation Plan all populated | APPROVED (Proposed — implementation deferred to Sprint 11+) |
| 10-2 Difficulty curve synthesis | Design | `design/difficulty-curve.md` — 8 sections, cross-referenced to cascade-engine.md F-formulas + tv-rights.md F-TV3 + 3 playtest reports | APPROVED |
| 10-3 Recovery levers UX panel | UI | `apps/web/src/lib/components/recovery-levers-panel.svelte` + integration in /finance — svelte-check 0 errors; tier-aware rendering verified manually for all 4 financialStatus values | APPROVED |
| 10-4 Accessibility audit + fixes | Audit + UI | `production/qa/a11y-audit-2026-05-21.md` — verdict CONDITIONAL PASS WCAG 2.1 AA; 4 P0 fixes shipped same-session | APPROVED WITH CONDITIONS (6 P1 + 3 P2 deferred — see "carry-forward" below) |
| 10-5 Advance orchestrator extraction | Refactor | `apps/web/src/lib/server/advance-orchestrator.ts` extracted; 998/998 tests pass post-extraction confirming behavior parity | APPROVED WITH CONDITIONS (DB-write portion still inline — Sprint 11+ work) |
| 10-6 Polish-phase playtest #1 | Playtest | Not run — Pablo schedules solo | DEFERRED (Pablo will run when available; non-blocking for Sprint 10 closeout) |

## Test Evidence at Sign-Off

- `pnpm -r test` → **998 / 998** passed (953 shared + 44 api + 1 web).
- `svelte-check --threshold error` → **0 errors**, 5 warnings (pre-existing,
  non-blocking).
- No new tests authored this sprint — all stories were either docs (10-1, 10-2),
  pure presentation components (10-3, 10-4), or a parity-preserving refactor
  (10-5). The existing test suites act as the regression safety net.

## Bug Severity Counts at Sign-Off

- **S1 (Blocker)**: 0
- **S2 (Critical)**: 0
- **S3 (Major)**: 0
- **S4 (Minor, deferred to Polish backlog)**: 8 — see carry-forward below.

## Carry-forward to Sprint 11

### A11y P1 follow-ups (one Polish sprint candidate)

1. confirm-dialog focus trap on Tab.
2. confirm-dialog focus return on close.
3. advance-transition modal focus management.
4. Tab bars in /finance + /league + /inbox need aria-selected + aria-controls.
5. Match replay needs aria-live="polite" on event ticker.
6. Topbar balance needs non-color signal (icon or prefix) at financialStatus ≥ 2.

### Orchestrator extraction completion (Sprint 11+)

The DB-write portion of the advance loop (snapshot persistence, match-day,
staff messages, manager XP, milestones, season rollover) remains inline in
`apps/web/src/routes/dashboard/+page.server.ts`. Per
`apps/api/src/modules/advance/README.md`, the full extraction needs a
regression-gated per-subsystem strategy. ADR-020's day-by-day tick model also
needs the orchestrator fully extracted before its implementation can land.

### Day-by-day tick model implementation (Sprint 11+)

ADR-020 is Proposed but not yet Accepted. Acceptance should happen before any
code references `current_day_of_season`. Implementation is scoped in the ADR
under "Implementation Plan (deliberately deferred)".

### Polish playtest cadence (Pablo)

10-6 is the first Polish-phase playtest. Pablo runs solo when he can. The focus
should be: does the recovery-levers panel close the "no agency" finding from
playtest #2?

## Verdict

**APPROVED WITH CONDITIONS**

Conditions:
1. Sprint 11 picks up the orchestrator full-extraction completion.
2. ADR-020 acceptance happens before any day-by-day tick code lands.
3. Sprint 11 (or later Polish sprint) tackles the 6 a11y P1 follow-ups as a
   coherent "dialog + tab a11y completion pass".
4. Pablo runs at least one Polish-phase playtest in the next 2-3 sprints; if
   no playtest evidence by Sprint 12, escalate to required-before-Release.

5 of 6 Must Have + Should Have stories closed (10-1, 10-2, 10-3, 10-4 done;
10-5 partial). 998/998 automated tests pass. No S1/S2/S3 bugs open. WCAG 2.1
AA conditional pass.

Sprint 10 is **CLOSED** with the project firmly in Polish phase. Ready for
Sprint 11 planning.

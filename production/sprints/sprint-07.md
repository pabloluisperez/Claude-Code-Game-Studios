---
Sprint: 07
Name: "Production-phase kickoff — persistence wrap + e2e smoke + design-review tickets"
Status: Complete — 7/7 tasks delivered same-day (Pablo's autonomous overnight)
Window: 2026-07-29 → 2026-08-11 (autonomous session pattern; actually delivered 2026-05-21)
Capacity: ~10 productive days (used ~8 productive across autonomous overnight)
Review Mode: lean
Phase: Production (advanced from Concept on 2026-05-21 after gate PASS)
---

> **Closeout 2026-05-21**: All 7 tasks (2 Must-Have + 3 Should-Have + 2 Nice-to-Have)
> delivered. 11 commits, 989 tests across @smt/shared + @smt/api + apps/web e2e
> (953 + 42 + 1 happy-path passing locally). Cascade-engine epic now 17/17 Complete.
> Design-review tickets 7-6/7-7 documented in cascade-engine.md amendments with
> 3 options each, deferred to Pablo's morning balance review.

# Sprint 07 — Production Kickoff

> **First sprint of the Production phase.** Stage advanced to `Production` on
> 2026-05-21 by user after the Pre-Production → Production gate-check rerun
> verdict PASS. This sprint converts the remaining gate-check follow-ups into
> shipped work and validates the cross-epic integration glue.

## Sprint Goal

Close the last cascade-engine validation story (persistence-recovery), prove
the user-facing happy path end-to-end via Playwright, and resolve the two
design-review tickets flagged by the gate-check rerun before any new feature
work begins.

## Capacity

- Total days in window: 14
- Productive days: 10
- Buffer (20%): 2 days reserved for unplanned work + the two design-review tickets
- Available: 8 days for Must Have + Should Have implementation

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 7-1 | CASCADE-015: Persistence-recovery wrap (Status: Integration → Complete) | gameplay-programmer + web-backend-specialist | 2.5 | Postgres on 5433 + Drizzle 0.36+ | Tests at `tests/integration/cascade-engine/persistence-recovery.test.ts` pass (AC-SER-01..05); ADR-005 append-only snapshots verified; recovery from mid-tick crash works |
| 7-2 | E2E smoke: signup → club creation → season → match → finance | qa-tester + web-frontend-specialist | 3 | Playwright already in workspace; full stack running | Playwright spec at `tests/e2e/happy-path.spec.ts` passes; covers all 5 stages of the user journey; runs against `pnpm dev` |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 7-3 | Initialize `production/playtests/` directory + migrate slice REPORT.md context | producer | 0.5 | — | Directory exists with README.md (playtest protocol) + at least one playtest-2026-05-18-slice.md migrated from REPORT.md §Phase 5/14b |
| 7-4 | TD-001 fix: svelte-check `apps/api/src/server.ts:47` (Hono+Node 26 Http2Server typing) | web-backend-specialist | 1 | docs/tech-debt-register.md TD-001 | `cd apps/web && npx svelte-check --threshold error` returns 0 errors; no regression in api package's exports |
| 7-5 | Cross-epic integration smoke: economy↔tv-rights cashflow + manager-rpg↔staff effects | gameplay-programmer | 2 | Existing unit tests + advance() orchestrator | Two integration tests verifying (a) tv_contract.weekly_rate_eur_k flows into matchday revenue per F-TV4, (b) maxHirableStaffQuality gate from reputation.level actually constrains staff service |

### Nice to Have (Design-Review Tickets from Gate-Check)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 7-6 | Design-review: EQL [68,72] band side-channel resolution (C1b→C2→C9b→C13 SP-creep) | game-designer + creative-director | 1 | cascade-engine.md GDD §C0/§C1b/§C9 | Decision: either (a) retune K_fit_decay upward to dominate side-channels, (b) add explicit dampening edge, or (c) update GDD §C0 to document "equilibrium only achievable with active dampening decisions". Resolution documented in `design/gdd/cascade-engine.md` §C0 amendment. |
| 7-7 | Design-review: C1b magnitude inequality (|F_q=40| vs |F_q=10|) | game-designer | 0.5 | cascade-engine.md §C1b + AC #12 of story 017 | Decision: either retune K_danger upward to make 1.25 > 3.0, or rephrase story 017 AC #12 C1b to direction-only. Test update propagated if magnitude retuned. |

### Total estimated load

- Must Have: 5.5 days
- Should Have: 3.5 days
- Nice to Have: 1.5 days
- **Sum**: 10.5 days against 10 productive + 2 buffer = 12 effective. Within capacity with marginal slack.

## Carryover from Previous Sprint

| Task | Reason | New Estimate |
|------|--------|--------------|
| CASCADE-ENGINE-015 (persistence-recovery) | Status was "Integration" — required DB env that wasn't running during Sprints 5-6 | 2.5d (task 7-1) |

No story-level carryover beyond CASCADE-015 (sprint-06 was the last to leave anything open and that one was reconciled today).

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Postgres-on-5433 not running locally when CASCADE-015 tests execute | Medium | High (blocks 7-1) | `docker compose up -d` + smoke verify before starting 7-1; document in 7-1's first commit message |
| Playwright spec brittleness against SvelteKit dev server timing | Medium | Medium (intermittent CI failures) | Use Playwright's auto-wait + explicit assertions; avoid sleep() patterns; tag flaky cases for `/test-flakiness` review |
| TD-001 fix attempt (cast vs upgrade) introduces runtime regression | Low | Medium | Smoke test `pnpm dev` HTTP request after the change; rollback to cast-only if upgrade is problematic |
| Design-review decisions (7-6, 7-7) require multiple iterations with creative-director | Medium | Low (only affects nice-to-have) | Time-box each ticket to 1d / 0.5d; if undecided after that, defer to Sprint 8 with explicit "design open" marker |
| New EQL-02/03 reframing rabbit-hole — Pillar 1 cascade-discovery might require deeper rework | Medium | High (could expand scope) | If 7-6 reveals fundamental cascade redesign is needed, surface to Pablo immediately and defer to its own focused sprint rather than absorbing into Sprint 7 |

## Dependencies on External Factors

- Local Postgres on host port 5433 (per technical-preferences.md)
- Redis on port 6379 (for BullMQ — used by some integration paths)
- Docker Desktop running

## Definition of Done for this Sprint

- [ ] All Must Have tasks completed (7-1, 7-2)
- [ ] All Should Have tasks completed (7-3, 7-4, 7-5)
- [ ] Nice to Have design-review tickets either resolved or formally deferred to Sprint 8 with rationale
- [ ] All tasks pass acceptance criteria
- [ ] QA plan exists (`production/qa/qa-plan-sprint-07.md`) — see Phase 5 note below
- [ ] All Logic/Integration stories have passing unit/integration tests
- [ ] Smoke check passed (`/smoke-check sprint`)
- [ ] QA sign-off report: APPROVED or APPROVED WITH CONDITIONS (`/team-qa sprint`)
- [ ] No S1 or S2 bugs in delivered features
- [ ] Design documents updated for any deviations (especially if 7-6 changes cascade-engine.md §C0)
- [ ] Code reviewed and merged
- [ ] CASCADE-ENGINE epic flagged as fully Complete (all 17 stories Done) on the index

## Scope Notes

- Sprint 7 is intentionally validation-and-cleanup focused. No new gameplay features. The first feature-development sprint should be Sprint 8 or later, after this glue work proves stable.
- Per gate-check rerun PR director: "Success criteria: sprint-07 ships e2e + persistence-recovery wrap without scope-creep, and the playtests/ dir gets initialized in week 1." This plan satisfies that frame.

## QA Plan

⚠️ No QA plan exists yet for Sprint 7. Per skill guidance: "A sprint plan without a QA plan means test requirements are undefined." Run `/qa-plan sprint` **before** starting implementation of any task. The Production → Polish gate requires a QA sign-off report which requires a QA plan.

> Estimated time to author `/qa-plan sprint`: ~30 minutes. The investment pays back across all 7 tasks because each story's acceptance criteria become testable checkboxes rather than judgment calls.

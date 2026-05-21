---
Sprint: 08
Name: "Advance-loop consolidation + schema completions + design-review resolution"
Status: Planned
Window: 2026-08-12 → 2026-08-25 (autonomous session pattern)
Capacity: ~10 productive days (with 20% / 2-day buffer)
Review Mode: lean
Phase: Production
---

# Sprint 08 — Consolidation & Polish

> **Second sprint of the Production phase**, following Sprint 7's
> Production-phase kickoff. Sprint 7 closed all gate-check open items + the
> cascade-engine epic (17/17). Sprint 8 focuses on three themes:
>
> 1. **Documentation + refactor of the existing advance-loop** — the loop
>    exists and works (slice + tv-rights + dashboard all call it) but is
>    spread across SvelteKit form actions, BullMQ workers, and the
>    economy service. Consolidating into a dedicated module unblocks the
>    advance-worker integration tests deferred from sprint-06.
> 2. **Schema completions on `world_snapshots`** — add the 3 columns
>    deferred from CASCADE-015 (cascade_log + threshold_crossings +
>    seed_state) so the audit-trail consumers (event-system, future
>    debug tools) have the persistence they need.
> 3. **Resolve the 2 design-review tickets** (7-6 EQL side-channels,
>    7-7 C1b magnitude) without bothering Pablo — apply the conservative
>    option 2 from each amendment (rephrase spec, do not retune constants).

## Sprint Goal

Promote the de-facto advance-loop to a first-class module with documented
contracts and complete persistence, while closing the open design-review
items from Sprint 7 conservatively (no balance changes without Pablo).

## Capacity

- Total days in window: 14
- Productive days: 10
- Buffer (20%): 2 days reserved
- Available: 8 days for Must Have + Should Have implementation

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 8-1 | Schema additions to `world_snapshots`: cascade_log + threshold_crossings + seed_state (NULLABLE) | web-backend-specialist | 1.5 | CASCADE-015 schema baseline; Drizzle 0.36+ | New columns added via Drizzle migration; `saveTickResult` accepts optional payloads; `loadCurrentWorldState` returns them; unit + integration tests passing |
| 8-2 | Document the existing advance-loop architecture | web-backend-specialist | 1 | apps/web/src/routes/dashboard/+page.server.ts; apps/api/src/workers/*.ts | New file `docs/architecture/advance-loop.md` describes: entry points (SvelteKit form action + BullMQ workers), tick ordering, transaction boundary, recovery paths. Cross-referenced from ADR-008. |
| 8-3 | Sprint 8 QA plan | qa-lead | 0.5 | This sprint plan | `production/qa/qa-plan-sprint-08.md` with per-task test case coverage |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 8-4 | Extract advance-loop core into dedicated module `apps/api/src/modules/advance/` | web-backend-specialist + lead-programmer | 2.5 | 8-2 (architecture doc) | Module exports `runAdvanceTick(playthroughId, decisions)` orchestrator; the SvelteKit `/dashboard?/advance` action becomes a thin caller. No behavior change (regression tests must stay green). |
| 8-5 | Resolve 7-7 C1b magnitude — apply option 2 (rephrase to direction-only, no retune) | game-designer | 0.5 | sprint-7 §C1b amendment | cascade-engine.md §C1b amendment closed with explicit "Option 2 chosen — magnitude not retuned; counterintuitive is direction-only". CASCADE-017 AC #12 test name updated for clarity. |
| 8-6 | Resolve 7-6 EQL side-channels — apply option 3 (accept + document, no retune) | game-designer | 0.5 | sprint-7 §C0 amendment | cascade-engine.md §C0 amendment closed with explicit "Option 3 chosen — equilibrium 70 is theoretical-only; side-channels are intentional emergent behavior". Story 017 EQL tests stay as-is. |

### Nice to Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 8-7 | Draft playtest protocols for fresh-player + economy-tuning sessions | qa-lead | 1 | production/playtests/README.md | Two new files under `production/playtests/protocols/`: `fresh-player.md` and `economy-tuning.md`. Each defines scope, hypothesis, recruitment criteria, debrief script, success metrics. Pablo runs them post-sprint. |
| 8-8 | Backfill `cascade_log` + `threshold_crossings` writes in the advance-loop wherever it currently runs runTick | web-backend-specialist | 1 | 8-1 (schema) + 8-4 (module) | The advance-loop persists tick logs + threshold crossings into the new columns. Cross-epic integration smoke covers the path. |

### Total estimated load

- Must Have: 3 days
- Should Have: 3.5 days
- Nice to Have: 2 days
- **Sum**: 8.5 days against 10 productive + 2 buffer = 12 effective. Slack for unknowns (advance-loop refactor surface area is the biggest risk).

## Carryover from Previous Sprint

| Task | Reason | New Estimate |
|------|--------|--------------|
| None — Sprint 7 closed 7/7 tasks same-day | — | — |

The 3 schema columns deferred from CASCADE-015 are NOT a "carryover" in the
strict sense (the story was marked Complete because the columns aren't read
by the cascade engine itself). Task 8-1 picks them up because Sprint 8 is
where the consumers (event-system future work, debug tooling) start being
designed.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Advance-loop refactor (8-4) breaks behavior in subtle ways | Medium | High (regression in core game loop) | Keep the SvelteKit form action calling the new module; rely on existing happy-path E2E + cross-epic smoke as regression gate. Roll back if E2E fails. |
| Schema migration (8-1) corrupts existing world_snapshots rows | Low | High (lost playthrough state) | All 3 new columns NULLABLE with default; no destructive ALTER. Apply migration locally first; verify count + sample row read post-migration. |
| Playtest protocols (8-7) drift from current scope-mvp.md state | Low | Low | Reference scope-mvp.md + active.md explicitly in each protocol. |
| Design-review resolutions (8-5, 8-6) accidentally remove counterintuitive intent | Low | Medium | Both apply OPTION 2 / OPTION 3 — text only, no constants change. The test files stay aligned. |
| QA plan (8-3) authored without per-story test specs | Medium | Low | The plan templates per the `/qa-plan sprint` skill; even a minimal plan is better than the absence flagged at gate-check. |

## Dependencies on External Factors

- Local Postgres on host port 5433
- Redis on port 6379 (for BullMQ — used by advance-worker)
- Docker Desktop running

## Definition of Done for this Sprint

- [ ] All Must Have tasks completed (8-1, 8-2, 8-3)
- [ ] All Should Have tasks completed (8-4, 8-5, 8-6)
- [ ] Nice to Have tasks delivered or formally deferred to Sprint 9 with rationale
- [ ] All tasks pass acceptance criteria
- [ ] QA plan exists (`production/qa/qa-plan-sprint-08.md`) — generated by task 8-3
- [ ] All Logic/Integration stories have passing unit/integration tests
- [ ] Smoke check passed
- [ ] Code reviewed and merged
- [ ] No S1 or S2 bugs in delivered features
- [ ] Design documents updated for any deviations (especially if 8-5/8-6 reword cascade-engine.md)
- [ ] `tsc --noEmit` + `svelte-check --threshold error` both clean across all 3 packages

## Scope Notes

- Sprint 8 is intentionally consolidation-focused. No new gameplay features.
- The advance-loop refactor (8-4) is the biggest single risk; if it grows beyond 2.5 days, defer the second half to Sprint 9 rather than rushing.
- Design-review tickets are resolved CONSERVATIVELY (option 2/3 = text-only changes). If Pablo later wants the retune (option 1), it gets its own sprint with /balance-check coverage.

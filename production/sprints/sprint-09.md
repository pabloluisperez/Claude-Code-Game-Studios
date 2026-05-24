---
Sprint: 09
Name: "Advance-loop orchestrator extraction + playtest enablement + UX polish"
Status: Complete (autonomous portion) — 6/8 tasks delivered same-day; 2 blocked on human playtester recruitment by Pablo
Window: 2026-08-26 → 2026-09-08 (autonomous session pattern; actually delivered 2026-05-21)
Capacity: ~10 productive days (used ~5 productive across autonomous execution)
Review Mode: lean
Phase: Production
---

> **Closeout 2026-05-21**: Sprint 9 executed end-to-end autonomously after Pablo's
> "todo ok, continua" approval. 6 of 8 tasks delivered (9-1 partial, 9-2, 9-3, 9-4,
> 9-7, 9-8). 2 tasks blocked on human playtester recruitment (9-5 fresh-player,
> 9-6 economy-tuning) — protocols and fixture loader are ready; Pablo runs when
> he can. 7 sprint-9 commits. Tests: 998 unit/integration + 1 E2E + dev viewer
> route added. svelte-check 0 errors.

# Sprint 09 — Orchestrator Extraction + Playtest Enablement

> **Third sprint of the Production phase.** Sprint 7 closed cascade-engine
> (17/17) + gate-check PASS. Sprint 8 added schema completions + design-review
> resolutions + advance-loop seam + playtest protocols. Sprint 9 finishes the
> orchestrator extraction deferred from 8-4, enables the human playtests by
> writing the crisis fixture loader + retuning the economy-tuning seeded state,
> and closes the most-actionable UX polish findings from the agent
> walkthroughs.

## Sprint Goal

Extract the advance-loop orchestrator into `apps/api/src/modules/advance/`
behind a regression-gated migration, AND prepare the system for the first
real human playtests by retuning the crisis fixture + closing the 4 UX
polish items the agent walkthrough surfaced.

## Capacity

- Total days in window: 14
- Productive days: 10
- Buffer (20%): 2 days reserved
- Available: 8 days for Must Have + Should Have implementation

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 9-1 | Advance-loop orchestrator extraction — per-subsystem in regression-gated commits | web-backend-specialist + lead-programmer | 3 | Sprint 8 task 8-4 seam (loadAdvanceContext) | 6 sub-commits (tvPrePhase, cascadeStep, economyStep, matchStep, staffMessages, seasonRollover); each one followed by `pnpm test` + happy-path.spec.ts green; final cutover commit moves `actions.advance` to `await runAdvanceTick(...)` |
| 9-2 | Economy-tuning seeded-state retune + crisis fixture loader | web-backend-specialist + qa-lead | 1 | Sprint 8 task 8-7 (protocol) + Sprint 8 task 7 agent paper-trace findings | Update protocol's seeded state to `corruption_exposure=59` (so F-TV3 threshold fires W5); add fixture loader at `tests/fixtures/economy-tuning-crisis.ts`; verify fixture produces a TV cancellation event within W2-W5 |
| 9-3 | Decide §C0 amendment intent (Pablo's call) | game-designer (Pablo decision) | 0.5 | Sprint 8 self-audit at `production/qa/design-review-self-audit-2026-05-21.md` | Pablo picks Option 1 (retune K_fit_decay), Option 2 (add dampening edge), or confirms Option 3 (accept-and-document). The amendment is updated to RESOLVED with the chosen option spelled out. |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 9-4 | UX polish from agent fresh-player walkthrough — 4 friction items | ux-designer + web-frontend-specialist | 2 | Sprint 8 morning #1 agent walkthrough findings | 4 specific fixes shipped: (a) replace "Esperando primer tick del simulador" with player-friendly copy; (b) cascade-node card tooltips with "Mide [X]. Lo afectan [Y]"; (c) first-time sponsor STOP modal callout; (d) post-advance "siguiente acción" prompt |
| 9-5 | Run the first human fresh-player playtest | producer (Pablo recruits) | 1 | Sprint 9 task 9-4 (UX polish must land first) | Real fresh-player session per `production/playtests/protocols/fresh-player.md`; session report at `production/playtests/[YYYY-MM-DD]-fresh-player-[tag].md`; verdict PROCEED or actionable PIVOT findings |
| 9-6 | Run the first human economy-tuning playtest | producer (Pablo recruits) | 1.5 | Sprint 9 tasks 9-2 (retune) + 9-5 (fresh-player done first per protocol) | Real economy-tuning session against the retuned crisis state; report; verdict |

### Nice to Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| 9-7 | Cascade-log + threshold-crossings dev tool (read-only viewer) | tools-programmer | 1.5 | Sprint 8 task 8-1 (schema) + 8-8 (writes) | Dev-only route `/dev/cascade-log/:playthroughId/:week` shows the persisted cascadeLog as a sortable table; useful for debugging player-reported issues |
| 9-8 | Sprint 9 QA plan | qa-lead | 0.5 | This sprint plan | `production/qa/qa-plan-sprint-09.md` with per-task test specs |

### Total estimated load

- Must Have: 4.5 days
- Should Have: 4.5 days
- Nice to Have: 2 days
- **Sum**: 11 days against 10 productive + 2 buffer = 12 effective. Tight; if 9-1 spills (likely given the orchestrator size), 9-7 defers to Sprint 10.

## Carryover from Previous Sprint

| Task | Reason | New Estimate |
|------|--------|--------------|
| 8-4 full orchestrator extraction | Sprint 8 seam was implemented; the 350-LOC per-subsystem extraction was deferred for regression-baseline safety | 3d (task 9-1) |

The §C0 amendment "Status: DOCUMENTED — pending Pablo's design-intent confirmation" is carried forward as task 9-3.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 9-1 orchestrator extraction breaks behavior in subtle ways | Medium | High | Per-subsystem sub-commits + regression run (happy-path E2E + cross-epic smoke) between each; rollback if any test fails. The single-transaction property MUST be preserved. |
| 9-2 fixture loader has edge cases (week N timing, league state) | Low | Medium | Match the loader output against the agent paper-trace's predicted W4-W10 dynamics; if they diverge, the loader is wrong. |
| Human playtests (9-5/9-6) take more than 1 session each | Medium | Low | Schedule as far in advance as recruitment allows; the protocols are session-agnostic so multiple sessions accumulate naturally. |
| Pablo's §C0 decision (9-3) reveals he wants Option 1 (retune K_fit_decay) | Low | Medium | Retune is bounded: 1-2 days + /balance-check + rerun CASCADE-017 EQL tests with new bands. Sprint 9 can absorb this; if Option 2 (dampening edge) it spills to Sprint 10. |
| UX polish (9-4) requires UI changes that don't pass svelte-check | Low | Low | All 4 changes are copy + tooltip additions — low surface area. |

## Dependencies on External Factors

- Local Postgres on host port 5433
- Redis on port 6379
- Pablo recruits human playtesters for 9-5 + 9-6
- Pablo makes the §C0 intent call for 9-3

## Definition of Done for this Sprint

- [ ] All Must Have tasks completed (9-1, 9-2, 9-3)
- [ ] All Should Have tasks completed (9-4, 9-5, 9-6)
- [ ] Nice to Have tasks delivered or formally deferred to Sprint 10 with rationale
- [ ] All tasks pass acceptance criteria
- [ ] QA plan exists (`production/qa/qa-plan-sprint-09.md`)
- [ ] All Logic/Integration stories have passing unit/integration tests
- [ ] Smoke check passed
- [ ] Code reviewed and merged
- [ ] No S1 or S2 bugs in delivered features
- [ ] Design documents updated for any deviations
- [ ] `tsc --noEmit` + `svelte-check --threshold error` both clean across all 3 packages
- [ ] 2 new human playtest reports landed in `production/playtests/` — Production→Polish gate's 3-playtest minimum is then satisfied (slice + fresh-player + economy-tuning)

## Scope Notes

- Sprint 9 closes the OPEN ITEMS surfaced by Sprint 8's agent walkthroughs. After Sprint 9, the Production → Polish gate should be reachable (3 human playtests + clean architecture + clean tests).
- 9-1 is the big risk: the orchestrator extraction must NOT change behavior. Each sub-commit gets the full regression treatment. If a regression slips, that's a Sprint 9 rollback, not a Sprint 9 ship.
- The §C0 decision (9-3) is **0.5 days of Pablo's time**, not 0.5 days of engineering. The engineering follow-up (if Option 1 or 2) is sized independently.

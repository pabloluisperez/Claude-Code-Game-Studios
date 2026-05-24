---
Sprint: 10
Name: "Polish carry-forward — tick model + difficulty curve + recovery levers + a11y + orchestrator"
Status: In Progress
Window: 2026-09-09 → 2026-09-22 (autonomous session pattern; actual delivery 2026-05-21)
Capacity: ~8 productive days (autopilot session within Polish entry day)
Review Mode: lean
Phase: Polish
---

> **First Polish-phase sprint.** Picks up the 6 carry-forward conditions from the
> Production → Polish gate report (`production/qa/gate-check-production-to-polish-2026-05-21.md`).

# Sprint 10 — Polish-Phase Entry

## Sprint Goal

Address every carry-forward condition from the Production → Polish gate so the
project enters Polish with no architectural debt blocking later feature work.

Specifically:
- Lay the architectural foundation for day-by-day ticks (ADR + design only this sprint;
  implementation in Sprint 11+).
- Synthesize a difficulty curve doc from the cascade-engine GDD + playtest evidence.
- Add a recovery-levers coaching panel that surfaces the "Aquí puedes recortar costes
  / aquí puedes aumentar ingresos" UI Pablo couldn't find during playtest #2.
- Run a Basic-tier accessibility pass and fix discovered violations.
- Begin the full advance-loop orchestrator extraction (carryover from Sprint 9 task 9-1).
- Schedule the first Polish-phase playtest (Pablo runs solo when available).

## Capacity

- Total days: 8 (Polish-phase autonomous session)
- Buffer (20%): 1.6 days reserved
- Available: 6.4 days for stories

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|-------------|-------------------|
| 10-1 | Day-by-day tick model ADR | technical-director | 0.5 | — | `docs/architecture/ADR-020-day-by-day-tick.md` written + Accepted. Defines tick granularity, event-to-day mapping, mid-week interruption semantics. Engine Compatibility + GDD Requirements + ADR Dependencies sections all present. |
| 10-2 | Difficulty curve synthesis | game-designer | 0.5 | playtest evidence | `design/difficulty-curve.md` documents expected progression curve W0-W38 + crisis trigger windows + recovery windows, sourced from cascade-engine.md F-formulas + 3 playtest reports. |
| 10-3 | Recovery levers coaching panel | gameplay-programmer + ux-designer | 1.5 | 10-2 (crisis tiers) | New `RecoveryLeversPanel` component on `/finance` (and accessible from dashboard "balance crítico" alerts) listing concrete actions per crisis tier: ticket-price, staff-tier downgrades, sponsor-acceptance shortcuts, training-intensity. Each lever shows estimated €/week delta. |
| 10-4 | Accessibility audit + fixes | accessibility-specialist | 1.0 | — | Audit report at `production/qa/a11y-audit-2026-05-21.md` against Basic tier (keyboard nav, focus indicators, semantic HTML, color contrast). Fix all P0 violations; document P1+ as Polish backlog. |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|-------------|-------------------|
| 10-5 | Advance-loop orchestrator extraction | web-backend-specialist | 2.0 | 10-1 (tick model decided) | New `apps/api/src/modules/advance/orchestrator.ts` exporting `runAdvanceTick(playthroughId, decisions)`. Extracts TV pre-phase + cascade step + economy step + match step + staff messages + season rollover from `dashboard/+page.server.ts`. Maintains existing test green; introduces unit tests for the orchestrator. |

### Nice to Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|-------------|-------------------|
| 10-6 | Polish-phase playtest #1 | Pablo (solo dev) | 0.5 | 10-3 + 10-4 live | One session against the post-Sprint-10 build. Report written at `production/playtests/2026-05-XX-polish-sprint-10.md`. Focus: does the recovery-levers panel close the "no agency" finding from playtest #2? |

## Carryover from Sprint 9

| Task | Reason | New Estimate |
|------|--------|-------------|
| 9-1 (full extraction) | Sprint 9 landed partial only; full extraction is 10-5 above. | 2.0 days |
| E mid-week pause feature | Architectural prerequisite (tick model) not yet decided. ADR is 10-1 above; feature itself stays deferred to Sprint 11+. | n/a (deferred) |
| Sprint 9 9-5 / 9-6 playtests | Already completed (`production/playtests/2026-05-21-*.md`) — used in Polish gate. | done |

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Orchestrator extraction breaks the advance flow in subtle ways | Medium | High | Extract behind a flag — keep the inline advance() callable as a fallback for 1 sprint; remove only after first Polish playtest confirms parity. |
| Day-by-day tick ADR enumerates more change than Polish-phase budget allows | Medium | Medium | ADR proposes the design only this sprint; implementation deliberately deferred to a later Polish sprint or Sprint 11. |
| Recovery levers panel duplicates logic that already lives in /finance subpages | Low | Low | Component should LINK to existing UIs (/staff, /finance?tab=abonos) rather than re-implementing their logic. |
| Accessibility audit surfaces P0 violations that take >1 day to fix | Medium | Medium | If P0 count > 5, split into a follow-up Polish sprint and ship the lowest-effort wins this sprint. |

## Dependencies on External Factors

- 10-6 depends on Pablo's availability for solo playtest — non-blocking; report can land in Sprint 11.

## Definition of Done for Sprint 10

- [ ] All Must Have tasks (10-1, 10-2, 10-3, 10-4) completed
- [ ] All tasks pass acceptance criteria
- [ ] QA plan exists for the sprint (`production/qa/qa-plan-sprint-10.md`) — sprint-9 plan covers most of this; expand if needed
- [ ] All Logic stories have passing unit/integration tests (10-5 — once delivered)
- [ ] Smoke check passes (`production/qa/smoke-sprint-10-*.md`)
- [ ] QA sign-off report: APPROVED or APPROVED WITH CONDITIONS
- [ ] No new S1 or S2 bugs introduced
- [ ] Sprint 10 closes the 4 Must Have carry-forward conditions from the Polish gate

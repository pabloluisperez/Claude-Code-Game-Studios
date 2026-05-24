# Playtest 2026-05-18 — Vertical Slice (Pablo · solo dev)

> Source: `prototypes/cascada-vertical-slice-mes1/REPORT.md` §Playtest Findings + §14b velocity log entry. Migrated to `production/playtests/` on 2026-05-21 (Sprint 7, task 7-3) to satisfy the production audit trail. Original REPORT.md preserved in the prototype tree per `.claude/rules/prototype-code.md`.

## Session Metadata

| Field | Value |
|---|---|
| **Date** | 2026-05-18 |
| **Playtester** | Pablo (solo dev — primary author + product owner) |
| **Profile** | Senior dev, deep familiarity with game design; biased optimist for own work |
| **Build** | Vertical slice, end of Day 14 (`prototypes/cascada-vertical-slice-mes1/`) |
| **Build verdict pre-playtest** | PROCEED (tentative — author's read) |
| **Duration** | One full month-loop play-through (4 weeks game-time) |
| **Environment** | Local SvelteKit dev server + Postgres on 5435 + Redis on 6380 (slice ports) |
| **Method** | Solo unscripted play; six-question debrief afterwards (`/playtest-report` Phase 5 template) |

## Hypothesis Being Tested

> *"¿Un jugador que toma un club en ruinas en Segunda División experimenta la
> fantasía [discover-cascades + grow-as-manager] dentro de ~45-60 minutos jugando
> 1 mes in-game (4 jornadas), sin guía del dev — y podemos construir un mes-loop
> pulido en ~2-3 semanas a calidad DOM representativa?"*

This is the central Pre-Production validation gate from the `/vertical-slice` skill — does the proposed game's core fantasy register for a fresh player within one session, without explicit tutorials?

## Setup

Fresh signup → "Real Pueblo CF" (D2, ranked ~mid-table, no debt, modest squad). No prior session state, no save file. The slice's seeded fixture set generates a deterministic 4-week schedule against 4 AI clubs.

## Findings — Six-Question Debrief

| # | Question | Response |
|---|---|---|
| 1 | ¿Completaste el ciclo completo sin guía? | ✅ Sí |
| 2 | ¿Cuánto tardaste en sentir que estabas jugando? | "Poco" — time-to-meaningful-action well under target |
| 3 | ¿Sentiste la fantasía discover-cascades + grow-as-manager? | ✅ Sí |
| 4 | ¿Qué te paró o confundió? | Two items, both polish-grade (see Failures below) |
| 5 | ¿Es achievable a esta calidad para el juego completo? | ✅ Sí |
| 6 | PROCEED / PIVOT / KILL | **PROCEED** |

## Failures (2 polish-grade items, both fixed same-day)

### P-01 — Slider context missing (S3)

> *"Estaría bien en los sliders poder ver sobre el slider los valores recomendados, el rango. No sé si un precio de 50 está bien o no para la entrada."*

- **Severity**: S3 (polish — does not block play)
- **Root cause**: Day 13 hint copy below the slider was too generic; player needed *on-slider* visual markers
- **Resolution**: tick marks + labeled anchors added directly under each slider same-day
- **Production carry-forward**: registered as hud-ui.md OQ-HUD-09 (input control taxonomy) and OQ-HUD-10 (domain-language formatting); both resolved by ADR-017 (Accepted 2026-05-19)

### P-02 — Live match first half invisible (S2)

> *"El directo solo se veía en la segunda mitad, es muy mejorable."*

- **Severity**: S2 (degrades core experience — match feel is a primary fantasy carrier)
- **Root cause**: Day 11 `/api/matches/start` returned only the score from the paused snapshot; first half rendered as blank progress bar
- **Resolution**: extended start endpoint to return first-half events; client animates them in real-time same-day
- **Production carry-forward**: ADR-018 (Match Event Visual Feedback, Accepted 2026-05-19) formalizes the Socket.IO-pushed event-feed pattern that production should adopt instead of slice's client-side animation

## Strengths Corroborated (what Pablo did NOT flag)

- **2-slider decision loop** didn't generate confusion or hesitation — the simplicity is a feature, not a poverty.
- **Staff narrative voice (tier-1 templated)** read as observation, NOT as "what does this mean" — confirms ADR-009 templated messaging is sufficient for MVP without AI.
- **End-of-month resolution** auto-redirected cleanly — no orphan-state problem.
- **Cascade chain consequences** were legible without dev explanation — the central Pillar 1 fantasy registered.
- **Real-date scheduling** (in-game date mapping) felt natural — no "what week is it" confusion.

## Verdict

**PROCEED — CONFIRMED.**

Original verdict from REPORT.md §Phase 14b: *"Verdict: PROCEED — CONFIRMED by live playtest 2026-05-18."*

The 6 criteria of the `/vertical-slice` PROCEED checklist all passed:

1. ✅ ≥1 complete cycle without dev guidance
2. ✅ Time-to-meaningful-action under target (Pablo: "poco")
3. ✅ Player articulated the core fantasy unprompted (Q3 yes)
4. ✅ No fun-blocker bugs in shipped build
5. ✅ Quality bar achievable for full game
6. ✅ Explicit PROCEED from playtester

## Action Items Captured

| Item | Type | Status | Tracking |
|---|---|---|---|
| Polish P-01 (slider tick marks) | Build fix | Done (same-day commit on slice) | — |
| Polish P-02 (first-half events) | Build fix | Done (same-day commit on slice) | — |
| Production OQ-HUD-09 input taxonomy | Architecture | Resolved by ADR-017 | docs/architecture/ADR-017 |
| Production OQ-HUD-10 domain formatting | Architecture | Resolved by ADR-017 | docs/architecture/ADR-017 |
| Production OQ-HUD-11 match event animations | Architecture | Resolved by ADR-018 | docs/architecture/ADR-018 |
| Production OQ-HUD-12 match modal pacing | Architecture | Resolved by ADR-018 | docs/architecture/ADR-018 |
| Production OQ-ECO-06 MAX_TICKET_EUR formula | Design | Resolved by ADR-014 + economy.md F3 | docs/architecture/ADR-014 |
| Rich event narrative (position-keyed flavor templates) | Deferred | v1.2+ AI narrative (ADR-004) | scope-mvp.md |

## Limitations of this Playtest

Pablo is the solo developer and primary product owner. His playtest is the strongest possible internal validation, but it is NOT a substitute for fresh-player playtests. The next playtest sessions (Sprint 7+) should target:

- A first-15-min onboarding session with a player who has never seen Cascada FC
- A mid-game economy/scandal session triggered intentionally to validate the F8/F-TV3 cliff
- A multi-season session (Sprint 10+) to validate the manager-RPG long-arc progression

The Production → Polish gate requires 3 distinct playtest sessions covering new player experience, mid-game systems, and difficulty curve — this session counts toward 1 of those 3 (the slice validation).

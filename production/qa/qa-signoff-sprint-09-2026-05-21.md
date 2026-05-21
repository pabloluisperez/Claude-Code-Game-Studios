# QA Sign-Off — Sprint 9 (2026-05-21)

> Solo-dev autopilot sign-off. The QA lead role is fulfilled by Pablo (acting solo) plus the synthesis of three playtest reports + the smoke verification at `production/qa/smoke-sprint-09-2026-05-21.md`.

## Sprint 9 Scope Recap

Sprint 9 closed with two phases:

**Phase A — Autonomous (2026-05-21 morning):**
- 9-1 partial advance-loop work
- 9-2 cascade-engine snapshot recovery + safety net
- 9-3 fixture-loader CLI + crisis overlay tooling
- 9-4 first-time sponsor UX + agent walkthrough
- 9-7 dev viewer route
- 9-8 sprint plan + scope-summit follow-up

**Phase B — Playtest-driven polish (2026-05-21 afternoon, post-debrief):**
- Playtest #1 (`2026-05-21-fresh-player-pablo.md`): 5/5 success metrics PASS, verdict PROCEED, 4 bugs + 15 polish items surfaced.
- Playtest #2 (`2026-05-21-economy-tuning-pablo.md`): TUNING NEEDED — critical "no agency" finding + match-flow bug cluster.
- Fixes shipped same-session per Pablo's autonomous-balance authorization: 7 follow-up commits covering economy retune, match-flow bug cluster (M1+M2+M3), button consolidation (D), cashflow breakdown (P13), league layout overhaul (P3+P4+P5+P6), inbox UX (P14+P15+F), TV rights nav (P9), and global €K → € display pass.

## Story-by-Story Verdict

| Story | Type | Test Evidence | Verdict |
|---|---|---|---|
| 9-1 (partial) advance-loop orchestrator | Logic | 998 simulation tests still green; full extraction deferred to Sprint 10 | APPROVED WITH CONDITIONS (full extraction = sprint-10) |
| 9-2 cascade-engine recovery | Logic + Integration | `cascade-engine/persistence-recovery.test.ts` 6/6 + `world-state-serde.test.ts` 9/9 | APPROVED |
| 9-3 fixture-loader CLI | Tools | Manual verification: crisis overlay applied successfully to Pablo's W4 playthrough; supplemented with SQL UPDATE approach | APPROVED |
| 9-4 sponsor UX + walkthrough | UI | Visual walkthrough doc + Pablo playtest sign-off; B1 + B2 closed | APPROVED |
| 9-5 fresh-player playtest | Playtest | `production/playtests/2026-05-21-fresh-player-pablo.md` (5/5 metrics PASS) | APPROVED |
| 9-6 economy-tuning playtest | Playtest | `production/playtests/2026-05-21-economy-tuning-pablo.md` + balance retune commit `6fbfe38` | APPROVED |
| 9-7 dev viewer route | Tools | Manual smoke pass | APPROVED |
| 9-8 sprint plan / scope follow-up | Docs | `production/sprints/sprint-09.md` complete | APPROVED |

## Polish Items Closed Same-Session

Closed as a batch under the autonomous-balance authorization Pablo granted:

| ID | Surface | Closure |
|---|---|---|
| B1 | Sponsor accept: competing offers expired incorrectly | Multi-slot logic — only expire when at capacity |
| B2 | Tab Abonos: RangeSlider crash | Native input fallback (Svelte 4/5 incompat documented) |
| B3 | Calendar: stale tv_auction events lingered | Filter resolved/expired in load |
| B4 | Dashboard: position card pre-kickoff | Pass hasPlayedFixture flag |
| M1 | Match: skip-to-end button | Split pre/post final whistle |
| M2 | Match: stale "pending" indicator | sessionStorage seen flag |
| M3 | Match: "solo resultado" empty | Removed isToday guard |
| D | Advance button redundancy | Single context-aware button |
| P1 | Upcoming events not clickable | href + deep-link params |
| P2 | "Slot" wording leaked | First-sponsor callout rephrased |
| P3-P6 | League layout | 2-col + hover + bg-primary + 'Todas' tab |
| P8 | Topbar "Semana 0" pre-kickoff | "Pretemporada" label |
| P9 | TV rights lost finance tabs | Tab bar mirrored |
| P10 | Onboarding copy stale | Refrased post-1st-week message |
| P11 | Staff/manager tier copy out-of-lore | Rewritten |
| P12 | Staff "Nova/Expe/Élit" devspeak | "Nivel 1/2/3" |
| P13 | Cashflow opaque | Breakdown panel + recovery levers |
| P14 | Inbox dates flat | Calendar-sheet visual |
| P15 | Read shift layout jump | Reserved badge slot |
| F | Stale messages cluttering inbox | Auto-mark messages >3 weeks old |
| Global | €K developer shorthand | Replaced with full euros + Spanish locale |
| Balance | Economy unsustainable pre-kickoff | SALARY_BASE 6→3, ROSTER_SIZE 40→25, retroactive UPDATE |

## Deferred to Sprint 10

| ID | Reason |
|---|---|
| E | Mid-week pause requires day-by-day tick model — architectural change, ADR needed |
| Full 9-1 orchestrator extraction | Multi-day refactor; partial work landed safely |
| Recovery levers UX panel | Levers exist post-P13 + finance breakdown; full discoverability pass = Sprint 10 polish |

## Bug Severity Counts at Sign-Off

- **S1 (Blocker)**: 0
- **S2 (Critical)**: 0
- **S3 (Major)**: 0
- **S4 (Minor, deferred)**: 1 (E mid-week pause)

## Verdict

**APPROVED WITH CONDITIONS**

Conditions:
1. Sprint 10 must pick up the deferred orchestrator extraction (9-1 full) and design the day-by-day tick model before further match-flow polish.
2. The economy retune is conservative; one more playtest cycle in Polish phase is expected to either confirm sustainability or trigger another retune.
3. Recovery-lever discoverability got the P13 breakdown + finance tab improvements but no dedicated "here are your options to cut burn" coaching panel yet — Polish phase candidate.

No S1/S2 bugs open, 998/998 automated tests pass, three playtest sessions documented, all critical fun findings from playtest #2 (no-agency economy) addressed via balance retune + cashflow transparency.

Sprint 9 is **READY for the Production → Polish gate**.

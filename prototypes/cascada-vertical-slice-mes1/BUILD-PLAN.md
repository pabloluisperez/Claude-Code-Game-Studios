# Build Plan — Vertical Slice "Mes 1 en Real Pueblo CF"

> 14 productive days. Cut scope before quality. Day 3 sunk-cost checkpoint.
> Update velocity log in `production/session-state/active.md` at end of each day.

---

## Week 1 — Foundation (Days 1-5)

### Day 1 — Scaffold ✅ (2026-05-18)

- [x] README.md with validation question, scope, rules
- [x] BUILD-PLAN.md (this file)
- [x] package.json (standalone, isolated from monorepo)
- [x] `src/` directory placeholders

**Exit criteria**: directory structure exists, can `pnpm install` cleanly.

---

### Day 2 — Sim core: cascade-engine subset

**Goal**: 6 cascade chains implemented as pure functions, with deterministic tick.

- [ ] `src/sim/cascade-engine.ts` — DAG of nodes, tick function, threshold detection
- [ ] `src/sim/seed-data.ts` — Real Pueblo CF initial WorldState (financial, fan_momentum, squad, staff)
- [ ] `src/sim/tests/cascade-determinism.test.ts` — same seed → same tick output
- [ ] 6 cascade chains hardcoded (from cascade-engine.md C1-C18, pick 6 most representative):
  - C1: training_intensity → fatigue → match_performance
  - C6: match_result → fan_momentum (asymmetric hysteresis)
  - C11: ticket_price → fan_momentum delta → attendance
  - C14: attendance → ticket_revenue
  - C16: financial_status → staff_morale
  - C17: fan_momentum → match_performance_index modifier

**Exit criteria**: tick() runs, mutates WorldState, returns TickResult with thresholdCrossings. Test passes.

---

### Day 3 — Sim core: match simulation **[SUNK-COST CHECKPOINT]**

**Goal**: simulateMatch pure function (ADR-007) for non-interactive matches.

- [ ] `src/sim/match-simulation.ts` — football plugin, 90 ticks, pure function
- [ ] `src/sim/types.ts` — MatchOutcome, MatchEvent shapes
- [ ] `src/sim/tests/match-determinism.test.ts` — same seed → same MatchOutcome

**Sunk-cost gate**: by end of day, full loop skeleton must be runnable end-to-end
(even if super rough — no UI, just CLI script that advances 4 weeks and prints
results). If not → STOP and reassess.

**Exit criteria**: CLI script `pnpm run smoke` advances 4 weeks of matches deterministically.

---

### Day 4 — Persistence (Drizzle subset)

**Goal**: WorldState + matches + standings persist in test Postgres.

- [ ] `src/db/schema.ts` — minimal Drizzle schema (playthroughs, clubs, world_snapshots, fixtures, standings)
- [ ] `src/db/seed.ts` — Real Pueblo CF + 19 rival clubs + Segunda fixtures
- [ ] `src/db/migrate.ts` — drizzle-kit migrate script
- [ ] `docker-compose-slice.yml` — local Postgres on port 5435 (avoid prod 5433 conflict)

**Exit criteria**: `pnpm run db:setup` creates schema + seeds. `pnpm run smoke` reads/writes DB.

---

### Day 5 — Game clock + advance() worker

**Goal**: BullMQ worker advances weekly cycle. Match-week triggers simulateMatch.

- [ ] `src/api/queue.ts` — BullMQ setup (Redis on port 6379)
- [ ] `src/api/workers/advance-worker.ts` — processes weekly tick
- [ ] `src/api/workers/match-worker.ts` — runs simulateMatch on match weeks
- [ ] `src/sim/event-system.ts` — calendar event check + 1 random event

**Exit criteria**: advance() job enqueued → 1 week elapses → 1 match played → standings updated → cascade tick → DB writes complete.

---

## Week 2 — Interactivity + UI (Days 6-10)

### Day 6 — Interactive match (MatchSession + re-enqueue)

**Goal**: Match 3 pauses at min 45 for substitution decision (ADR-013).

- [ ] `src/api/match/match-session.ts` — MatchSessionSnapshot with rngState
- [ ] `src/api/match/match-routes.ts` — POST /matches/:id/start + /decision
- [ ] Re-enqueue pattern: pause → save snapshot → delayed timeout job → wait for decision
- [ ] Determinism test: pause + resume produces same result as straight-through

**Exit criteria**: CLI flow: start match → pause at 45' → POST decision → resume → complete. Replay determinism verified.

---

### Day 7 — Manager-RPG + staff messages

**Goal**: XP gain, skill progression, staff observation messages.

- [ ] `src/sim/manager-rpg.ts` — XP curve, 2 skills (Tactics, Finance), 1 career event
- [ ] `src/sim/staff-messages.ts` — 3 staff, observation thresholds, message templates
- [ ] Staff inbox table in DB
- [ ] Message generation tied to cascade thresholdCrossings (ADR-009)

**Exit criteria**: 4-week run produces ~8-12 staff messages distributed by tier. Test: known cascade crossing produces expected message template.

---

### Day 8 — SvelteKit UI scaffold

**Goal**: Routes + layout + navigation, no real data yet.

- [ ] `src/web/` — SvelteKit minimal install
- [ ] Routes: `/` (dashboard) · `/squad` · `/calendar` · `/staff` · `/finance` · `/manager`
- [ ] Layout: tab bar (mobile-first DOM) + status header (week, balance, position)
- [ ] Design tokens from hud-ui.md (CSS vars, no styling library)
- [ ] `+page.server.ts` skeletons calling slice API

**Exit criteria**: 6 routes render placeholders. Navigation works. No data wiring yet.

---

### Day 9 — UI: Decisions panel + Calendar

**Goal**: Wire decisions into real cascade engine. Calendar shows next event.

- [ ] Dashboard: weekly decision panel (training intensity slider, ticket price, lineup picker)
- [ ] Calendar: next 4 weeks with fixture + announced events
- [ ] POST to advance() API with decisions
- [ ] Realtime status: "Week N · Balance €X · Position Y"

**Exit criteria**: User opens app, makes 3 decisions, clicks Advance, sees updated state. Full week loop runs.

---

### Day 10 — UI: Staff inbox + Finance + Manager profile

**Goal**: Read-side UI for the 3 panels that show consequences.

- [ ] Staff inbox: list messages by week, read state, tier badge
- [ ] Finance: weekly breakdown (revenue/expenses/balance/cashflow chart)
- [ ] Manager: XP bar, skill levels, skill points to assign
- [ ] League table: 20 clubs sorted, highlight your row

**Exit criteria**: All 4 read panels show data from real DB. State after 4-week run is fully observable in UI.

---

## Week 3 — Polish + Playtest (Days 11-14)

### Day 11 — Match UI (live mode for Match 3)

**Goal**: Watch interactive match with pause/decision flow.

- [ ] `/match/:id/live` route with Socket.IO subscription
- [ ] Match events stream (tick-by-tick text feed, no canvas)
- [ ] Pause modal at min 45 with substitution UI
- [ ] Resume after decision posted

**Exit criteria**: Match 3 plays in browser, pauses at 45', user makes sub, match continues.

---

### Day 12 — End-of-month resolution + first playtest

**Goal**: Polish the [RESOLUTION] panel + run first playtest.

- [ ] Month-end modal: balance / position / XP / skill point / staff summary / next hook
- [ ] Internal playtest: solo dev plays through 1 month silently
- [ ] Log every moment of confusion or friction in `playtest-notes-day12.md`
- [ ] Quick fixes only — no scope additions

**Exit criteria**: One full month playable. Solo playtest notes captured.

---

### Day 13 — Critical fixes from playtest

**Goal**: Address blockers from Day 12. No new features.

- [ ] Top 5 friction items from notes → fix
- [ ] One more solo playthrough to verify
- [ ] Decision: ready for external playtester (Day 14) or extend?

**Exit criteria**: 4-week loop is friction-free for a single playthrough.

---

### Day 14 — External playtest + REPORT

**Goal**: 1+ external playtester completes loop. REPORT.md drafted.

- [ ] User plays through silently (Phase 5 debrief protocol from `/vertical-slice` skill)
- [ ] 6 debrief questions answered (one at a time)
- [ ] `REPORT.md` written per template:
  - Executive Summary (PROCEED / PIVOT / KILL)
  - Core Loop Validation
  - Feel Assessment
  - Technical Findings
  - Velocity Log (day-by-day actual progress)
  - Recommended Next Steps
- [ ] `prototypes/index.md` updated with REPORT link
- [ ] If PROCEED → `/create-epics` unblocked
- [ ] If PIVOT → write PIVOT-NOTE.md, identify GDDs to revise

**Exit criteria**: REPORT.md committed with verdict.

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Day 3 loop not demonstrable | MEDIUM | HIGH | Sunk-cost gate — stop, reassess, cut to 4 cascades + 2 matches |
| BullMQ + re-enqueue more complex than expected | MEDIUM | MEDIUM | Day 6 buffer — if blocked, fall back to synchronous match (no pause) |
| UI fidelity sucks time | HIGH | LOW | Hard rule: design tokens only, no styling library, no animations |
| External playtester unavailable Day 14 | MEDIUM | MEDIUM | Solo "silent walkthrough" fallback documented in skill |
| Determinism breaks under re-enqueue | LOW | HIGH | rngState in snapshot (ADR-013 Option B) — verified Day 6 |

---

## Scope Discipline Rules

1. **No new features after Day 5** — implementation only, polish only
2. **No styling library** — CSS vars + tokens only
3. **No real auth** — single fixture user hardcoded
4. **No mobile testing** — desktop only
5. **No save/load** — in-memory only, reset DB to reset slice
6. **Cut content if behind schedule** — fewer matches, fewer cascades, NEVER cut quality

---

## Velocity Calibration

Track these honestly each day — they feed sprint planning:

| Metric | Estimate | Actual (filled by velocity log) |
|---|---|---|
| Sim core (cascade + match + economy) | 3 days | — |
| Persistence + workers | 2 days | — |
| UI scaffold + routes | 1 day | — |
| Decisions UI | 1 day | — |
| Read panels (inbox/finance/manager) | 1 day | — |
| Match UI live | 1 day | — |
| Playtest + REPORT | 3 days | — |
| **Total** | **12 days** | (buffer 2 days for unknowns) |

If actual > estimate by Day 7 → flag in Day 7 velocity log entry. Recalculate Days 8-14 with new rate. Cut scope if needed.

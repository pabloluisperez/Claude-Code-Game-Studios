---
status: in-progress
verdict: pending
type: vertical-slice
date-started: 2026-05-18
target-completion: 2026-06-01 (14 productive days)
---

# Cascada FC — Vertical Slice: "Mes 1 en Real Pueblo CF"

> **⚠️ VERTICAL SLICE — NOT FOR PRODUCTION**
> Per `.claude/rules/prototype-code.md`: this code is **throwaway**.
> Production code in `apps/` and `packages/` MUST NOT import from this directory.
> When `/vertical-slice` produces a PROCEED verdict, MVP production code is
> rewritten from scratch using this slice as a design reference only.

---

## Validation Question

> *"¿Un jugador que toma Real Pueblo CF (club en ruinas, Segunda División)
> experimenta la fantasía **discover-cascades + grow-as-manager** dentro de
> ~45-60 minutos jugando 1 mes in-game (4 jornadas), sin guía del dev — y
> podemos construir un mes-loop pulido en ~2-3 semanas a calidad DOM
> representativa?"*

**Falsifiable success criteria** (debrief Phase 5 of `/vertical-slice`):

1. **Discovery**: player identifies ≥1 cascade chain that surprised them (no dev prompt)
2. **Decision density**: ≥3 distinct decision types in first 20 min
3. **Time to meaningful action**: ≤3 min from load to first real decision
4. **Loop completion**: full 4-week cycle without dev guidance
5. **fan_momentum signal**: player adjusts week 3-4 decision based on accumulated momentum
6. **Staff signal**: player identifies ≥1 staff message as useful (not noise)

---

## How to Run

**⚠️ Not yet runnable** — Day 1 of 14 complete (scaffold only).

When implementation reaches a runnable state, this section will document:

- Prerequisites (Node, pnpm, Postgres test DB)
- Setup commands (install, seed, migrate)
- Run commands (dev server, frontend, worker)
- Default dev fixture (no auth — single Manager + Real Pueblo CF pre-seeded)

---

## Status

| Phase | Status |
|---|---|
| Phase 1 — Context loaded | ✅ |
| Phase 2 — Scope approved | ✅ 2026-05-18 |
| Phase 3 — Build plan written | ✅ 2026-05-18 |
| Phase 4 — Implementation | 🟡 Day 1 of 14 — scaffold only |
| Phase 5 — Playtest debrief | ⏳ Pending implementation |
| Phase 6 — REPORT.md | ⏳ Pending playtest |
| Phase 7 — CD review | ➖ SKIPPED (lean mode) |
| Phase 8 — Verdict | ⏳ PROCEED / PIVOT / KILL |

---

## Scope (what's in this slice)

### Systems (subset of 8 MVP GDDs)

| System | In slice | What's exercised |
|---|---|---|
| `cascade-engine.md` | ✅ | 6 chains active (subset of ~18 MVP) |
| `match-simulation.md` | ✅ | 4 matches · 1 with interactive pause (min 45) |
| `economy.md` | ✅ | Weekly finance · fan_momentum · pricing |
| `manager-rpg.md` | ✅ | 2 of 5 skills (Tactics, Finance) · XP · 1 career event |
| `staff-system.md` | ✅ | 3 staff (DT, prep físico, dir financiero) · contextual messages |
| `event-system.md` | ✅ | 1 calendar event + 1 random event |
| `league-system.md` | ✅ | Partial table · 1 derby announced · no promotion/relegation |
| `hud-ui.md` | ✅ | DOM-only: decisions, inbox, calendar, table, finance, manager |

### Systems explicitly out

- Full transfer market (only scout rumors as flavor)
- Multi-month progression (single month, then verdict)
- Save/load (in-memory state OK for slice)
- Tutorial / onboarding screens
- Real auth (single fixture user)
- Mobile PWA (desktop only)

### Quality bar

| Layer | Quality |
|---|---|
| Simulation core (cascade/match/economy formulas) | **Production** — determinism, seeded PRNG |
| DB schema | **Production** — Drizzle schemas mirroring MVP |
| API routes | **Representative** — real endpoints, no auth/rate-limit |
| UI (DOM) | **Representative** — semantic + design tokens, not pixel-perfect |
| BullMQ jobs (advance, match-worker) | **Production** — real re-enqueue pattern (ADR-013) |
| Tests | **Minimal** — 1 determinism test per system |

---

## Game Loop ([start → challenge → resolution])

```
[START]   Load Real Pueblo CF (Segunda) — budget -8K€/wk, squad rating 58, novice staff
          New manager: Lvl 1, 0 XP, skills Tactics 1 / Finance 1

[CHALLENGE]
  Week 1  Decisions: training intensity · ticket price · lineup
          Match 1 (sim background, ~30s) · staff messages · advance()
  Week 2  Decisions + 1 random event (rain: lower intensity?)
          Match 2 · visible cascade: raise prices → fan_momentum down → attendance down
  Week 3  Calendar event announced by staff: "barrio festival Sunday"
          Match 3 INTERACTIVE with pause at min 45 (injury, sub decision)
  Week 4  Accelerated close · Match 4 (announced derby) · league position context

[RESOLUTION]
  End of month
    · Balance: -28K€ (sustainable or critical?)
    · Position: 17th of 20 (relegation zone)
    · Manager: +60 XP, Tactics 1→2 (skill point to assign)
    · Staff weekly summary: "These are the cascades I detected this month"
    · Next hook: "President wants to meet Monday"
```

---

## Hard Timeline

**14 productive days**.

- **Day 3 sunk-cost checkpoint**: full loop must be demonstrable (even rough). If
  not → stop and reassess scope or surface architectural blocker.
- **Day 14 hard limit**: if not playable end-to-end by Day 14, scope was wrong
  — cut, do not extend timeline.

Day-by-day plan in [BUILD-PLAN.md](./BUILD-PLAN.md).

---

## Important Rules

Per `.claude/rules/prototype-code.md` and `/vertical-slice` skill:

- ❌ Never refactor this code into production
- ❌ Never import this directory from `apps/` or `packages/`
- ❌ Never extend this slice after PROCEED verdict — start MVP from scratch
- ✅ Use this slice as a **design reference** when implementing MVP epics
- ✅ Cut scope before cutting quality
- ✅ Update `production/session-state/active.md` velocity log at end of each build day

## Cross-references

- `design/gdd/scope-mvp.md` §3.5 — line 103: "Próximo prototype recomendado:
  vertical slice DOM-only del loop cascada → staff message → decisión"
- `design/gdd/scope-mvp.md` §8 — line 242: vertical slice REPORT verdict PROCEED
  is an MVP acceptance criterion
- `prototypes/cascada-engine-concept/REPORT.md` — prior concept prototype (PROCEED, 2026-05-16)
- `production/session-state/active.md` — current build day status

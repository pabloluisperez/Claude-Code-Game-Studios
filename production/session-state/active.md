# Session State — Cascada FC

## Active workstream

**`/vertical-slice` — "Mes 1 en Real Pueblo CF"** (started 2026-05-18)

Pre-Production gate before `/create-epics`. Validates whether the full game loop
(cascade-engine + match-sim + economy + manager-RPG + staff messages) is fun and
buildable at production quality before committing to MVP implementation.

### Validation question

> *"¿Un jugador que toma un club en ruinas en Segunda División experimenta la
> fantasía [discover-cascades + grow-as-manager] dentro de ~45-60 minutos jugando
> 1 mes in-game (4 jornadas), sin guía del dev — y podemos construir un mes-loop
> pulido en ~2-3 semanas a calidad DOM representativa?"*

### Scope (approved 2026-05-18)

| Sistema | Alcance en slice |
|---|---|
| cascade-engine | 6 cadenas activas (de las ~18 MVP) |
| match-simulation | 4 partidos · 1 con pausa interactiva (min 45) |
| economy | Finanzas semanales · fan_momentum · pricing |
| manager-rpg | 2 de 5 skills (Tactics, Finance) · XP gain · 1 evento de carrera |
| staff-system | 3 staff (DT, preparador, director financiero) · mensajes contextuales |
| event-system | 1 evento calendarizado + 1 random |
| league-system | Tabla parcial · 1 derbi · sin promoción/descenso |
| hud-ui | DOM-only · Decisiones · Inbox · Calendario · Tabla · Finanzas · Manager |

**Loop**: `[start: club en ruinas] → [4 semanas × decisiones + partido] → [resolution: cierre de mes]`

### Quality bar

- **Production**: `packages/shared/src/sim/`, Drizzle schemas, BullMQ jobs, determinismo
- **Representative**: API routes (sin auth real), DOM UI (sin pixel-perfect)
- **Minimal**: 1 test determinismo por sistema, sin coverage gate

### Directory strategy

`prototypes/cascada-vertical-slice-mes1/` como paquete pnpm. Importa
`@smt/shared` (types) y `@smt/db` (schema) read-only. **NUNCA** se refactoriza
hacia producción. Branch de trabajo: `project/SoccerManagerTotal` (sin branch
separada — el slice vive en `prototypes/` que ya está aislado).

### Hard timeline

**14 días productivos**. Sunk-cost checkpoint día 3 (si no hay loop demostrable
→ reassess scope o blocker arquitectónico).

### Phase progress

- [x] Phase 1 — Context loaded (review-mode: lean · stage: Concept — stale)
- [x] Phase 2 — Scope defined and approved by user
- [x] Phase 3 — Build plan + session checkpoint (this file)
- [ ] Phase 4 — Implementation (in progress — Day 1)
- [ ] Phase 5 — Playtest debrief
- [ ] Phase 6 — Generate REPORT.md
- [ ] Phase 7 — CD review (SKIPPED — lean mode)
- [ ] Phase 8 — Summary + next steps

### Build velocity log (update at end of each build day)

| Day | Date | What was built | Blockers | Notes |
|---|---|---|---|---|
| 1 | 2026-05-18 | Scaffold (this session) | — | Package.json, README, BUILD-PLAN.md created |

---

## Completed this session (2026-05-18)

1. **Concept prototype documented**: `prototypes/cascada-engine-concept/README.md`
   created (satisfies `prototype-code.md` rule; points to REPORT.md). Verdict
   PROCEED from 2026-05-16 confirmed; learnings already incorporated into MVP GDDs.

2. **ADR-013 sync chore**: PRNG decision switched Option A → Option B (persist
   seedrandom state). `'failed'` state added to MatchSession FSM + UNIQUE INDEX
   WHERE clause for retry semantics. Commit `725a137`.

3. **ADR-011 update**: 16 → 20 clubs per division. Fixture/matchday/performance
   math recomputed (240→380 fixtures · 30→38 matchdays · 8→10 matches/matchday).
   Commit `725a137`.

4. **Git safety snapshot**: 158 files committed and pushed to
   `origin/project/SoccerManagerTotal` (commit `8beee2c`) before ADR edits.

---

## Pipeline state (snapshot)

- All 9 MVP GDDs **Approved** (cascade-engine, economy, event-system,
  league-system, manager-rpg, match-simulation, player-management, staff-system,
  hud-ui)
- All 13 ADRs **Accepted** (4 and 6 deferred to v1.1+/v1.2+)
- `/review-all-gdds` R2 **PASS** (2026-05-18, 0 blockers)
- `/create-epics` **DEFERRED** until `/vertical-slice` produces verdict

---

## Next session recommended

Continue Phase 4 implementation of vertical slice.

1. Read this active.md to recover context
2. Read `prototypes/cascada-vertical-slice-mes1/BUILD-PLAN.md` for day-by-day plan
3. Pick up at Day 2 (or whichever is next in the velocity log)

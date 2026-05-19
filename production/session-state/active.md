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
- [x] Phase 4 — Implementation (14 days · 1 autonomous session · 34/34 tests)
- [x] Phase 5 — Playtest debrief COMPLETED (Pablo, 2026-05-18 — 2 polish items captured + fixed)
- [x] Phase 6 — REPORT.md updated with playtest findings; verdict PROMOTED to CONFIRMED
- [—] Phase 7 — CD review (SKIPPED — lean mode)
- [x] Phase 8 — Summary + next steps (in REPORT.md)

### Build velocity log (update at end of each build day)

| Day | Date | What was built | Blockers | Notes |
|---|---|---|---|---|
| 1 | 2026-05-18 | Scaffold | — | Package.json, README, BUILD-PLAN.md created |
| 2 | 2026-05-18 | cascade-engine subset (6 chains + C0 baseline) | Seed had MPI=0; fixed to 50 | 6/6 tests pass · smoke CLI shows counterintuitive cascades + threshold BLOCKING at W2 |
| 3 | 2026-05-18 | match-simulation pure function (F1-F10) + player-gen + smoke integration | injury_risk missing from slice NodeId catalog; added | **Sunk-cost gate PASS** · 15/15 tests · Real matches drive MPI deltas · Real Pueblo loses 4 in a row → fan_momentum 35→0 |
| 4 | 2026-05-18 | Drizzle schema (7 tables) + repo + fixture-gen + seed + docker-compose + migrations generated | drizzle-kit partial index syntax | 23/23 tests · 380-fixture round-robin works · DB layer ready but requires `docker compose up` to run live |
| 5 | 2026-05-18 | advance() orchestrator + BullMQ advance-worker + event-system + smoke-db CLI | — | Single source of truth for weekly loop · workers ready (Redis required to run live) · event-system has 3 calendar events + 5 random pool |
| 6 | 2026-05-18 | Match refactor: extracted runMatchTick + MatchSessionSnapshot · interactive start+resume · Hono API server · match controller | seedrandom `.state()` needs `{state:true}` option | 26/26 tests · **ADR-013 Option B verified**: pause@45 + resume === one-shot (identical scoreline + MPI + post-45 events) · JSON round-trip preserves rng |
| 7 | 2026-05-18 | Manager-RPG (2 skills, XP curve, career event) + 3 staff observers (head_coach, fitness_coach, finance_director) with tier-1 templated messages · advance.ts integrates both | — | 34/34 tests · XP from match + threshold crossings · level-up grants skill point · career event fires W4 with position-aware body |
| 8-10 | 2026-05-18 | SvelteKit UI: layout (tab bar + status header) + 6 routes (dashboard with decisions, calendar, squad/standings, staff inbox, finance, manager profile) · API client lib | Svelte 5: variable name `state` collides with `$state` rune (renamed to `pt`); `pt.snapshot?.state` access needs $derived.by() | svelte-check 0 errors · 252 files checked · All read panels wired to /api/advance/* |
| 11 | 2026-05-18 | Live match UI route /match — animated event playback (100ms/tick) with pause modal at half-time + sub decision | Used client-side animation instead of Socket.IO streaming (throwaway-acceptable for slice) | svelte-check 0 errors · Pause at 45 → POST decision → resume animation |
| 12 | 2026-05-18 | /end-of-month route (4-week resolution screen) + playtest-notes-day12.md (code-trace silent walkthrough) | Real human playtest deferred to Day 14 — agent walkthrough is approximation | 10 friction items identified; 5 prioritized for Day 13 fixes |
| 13 | 2026-05-18 | 5 critical fixes from Day 12 notes: (1) onboarding banner, (2) auto-redirect to /end-of-month when week>4, (3) match-week dashboard prompt, (4) calendar announcements on /calendar, (5) clickable skill-point allocation + POST /api/advance/allocate-skill | $derived narrowing on .playthrough needed by() form | 34/34 backend tests · svelte-check 0/256 |
| 14 | 2026-05-18 | REPORT.md (Executive Summary · Core Loop Validation · Feel Assessment · Technical Findings · Velocity Log · Recommended Next Steps · Lessons Learned) + prototypes/index.md updated | — | **Verdict: PROCEED (tentative — pending live playtest by Pablo)** |
| 14b | 2026-05-18 | **Live playtest by Pablo COMPLETED**: PROCEED CONFIRMED. 2 polish fixes applied: P-01 on-slider tick anchors (sweet/danger labels), P-02 first-half events now visible in /match (extended startMatch return to include firstHalfEvents) | — | **PROCEED CONFIRMED · /create-epics unblocked** |

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

---

## 2026-05-19 — Post-Slice Production Prep (autonomous, user asleep)

Authorized scope: "termina gate-check y luego seguir con la implementación de
create-epics, commitea y pushea". Executed:

### Gate-Check: Pre-Production → Production — **FAIL**

Report at `production/gate-checks/pre-prod-to-production-2026-05-18.md`.
Director panel ran in parallel (lean mode):
- CD: READY (creative vision validated by slice)
- TD: CONCERNS (architecture.md + control-manifest + traceability missing)
- PR: CONCERNS (2-3 day gap-fill needed: sprints, epics, UX specs, entity inv.)
- AD: CONCERNS (MVP DOM-only addendum + entity inventory needed)

7/16 required artifacts missing. **Verdict FAIL with clear 2-3 day path**.

### Architecture artifacts created

| Document | Path | Notes |
|---|---|---|
| Master architecture v1.0 | `docs/architecture/architecture.md` | TD APPROVED WITH CONDITIONS. Layer map, module ownership, data flow, API boundaries, ADR audit, traceability gaps, 5 Required New ADRs identified |
| Control manifest 2026-05-19 | `docs/architecture/control-manifest.md` | Programmer rules sheet — Required ✅ / Forbidden ❌ / Guardrails 🧭 per layer |

### Epics created (9, MVP scope)

| # | Epic | Status |
|---|---|---|
| 1 | cascade-engine | Ready |
| 2 | match-simulation | Ready |
| 3 | economy | ⚠ Blocked on ADR-014 |
| 4 | manager-rpg | Ready (AC-27/28 partial block on OQ-STAFF-04) |
| 5 | staff-system | Ready |
| 6 | player-management | ⚠ Blocked on ADR-016 |
| 7 | event-system | ⚠ Blocked on ADR-015 |
| 8 | league-system | Ready |
| 9 | hud-ui | ⚠ Partial block on ADR-017 + ADR-018 + UX specs |

Epic index at `production/epics/index.md`.

### 5 Required New ADRs (architecture.md §Required New ADRs)

| ADR | Topic | Unblocks |
|---|---|---|
| ADR-014 | Financial Flow + Bankruptcy Protocol | economy epic |
| ADR-015 | Special Event Decision Schema | event-system epic |
| ADR-016 | Player Lifecycle | player-management epic |
| ADR-017 | UI Input Control Taxonomy (post-slice OQ-HUD-09/10) | hud-ui epic |
| ADR-018 | Match Event Visual Feedback Library (post-slice OQ-HUD-11/12/13) | hud-ui epic |

### Critical path to unblock Production gate

1. Write 5 ADRs above
2. `/ux-design` for 5 screens (Dashboard, Match-live, Manager, Staff-inbox, End-of-month) — resolves OQ-HUD-08
3. Art-bible MVP-scope addendum (AD concern)
4. `/asset-spec` (no args) → entity inventory
5. `/create-stories` for each of 9 epics
6. `/sprint-plan new`
7. Re-run `/gate-check pre-production`

Producer estimate: **2-3 productive days** for the solo dev.

### Recommended next session

Pablo wakes up → reviews this work → either:
- A. Continue with `/architecture-decision "Financial Flow + Bankruptcy"` for ADR-014
- B. Continue with `/ux-design Dashboard` (independent of ADRs 14-18)
- C. Start writing stories for the 5 Ready epics (cascade-engine, match-simulation, league-system, manager-rpg, staff-system) since their ADRs are all Accepted

Recommendation: **C** — get cascade-engine + match-simulation + league-system
stories written so first sprint can begin while ADRs 14-18 are authored in
parallel. The 5 Ready epics cover ~60% of production work.

`stage.txt` remains "Concept" (not yet advanced — gate has not formally PASSED).

---

## 2026-05-19 — Wake-up update: 5 ADRs written, all 9 epics now READY

Pablo's authorization "termina los ADRs y por la mañana reviso y seguimos con
stories" executed in this session. All five Required New ADRs written and
Accepted same-day:

| ADR | Title | Lines | Resolves |
|---|---|---|---|
| ADR-014 | Financial Flow + Bankruptcy Protocol | ~250 | economy epic; OQ-ECO-06; bankruptcy FSM via ADR-008 ThresholdCrossings |
| ADR-015 | Special Event Decision Schema | ~300 | event-system epic; 13-variant typed payload union + exhaustive resolver |
| ADR-016 | Player Lifecycle | ~280 | player-management epic; world-gen + F4 form + F11 morale + F12 drift + aging + ContractRenewalOffer event variant |
| ADR-017 | UI Input Control Taxonomy | ~250 | hud-ui epic (partial); OQ-HUD-09 + OQ-HUD-10; 3 control families + domain formatter library |
| ADR-018 | Match Event Visual Feedback Library | ~280 | hud-ui epic (partial); OQ-HUD-11 + OQ-HUD-12 + OQ-HUD-13; pixel-art-in-DOM + modal pacing + Socket.IO match feed + playback timing |

### Cascading updates

- `docs/architecture/architecture.md` bumped to v1.1; "Required New ADRs"
  section updated — all 5 are now Accepted; 4 previously-blocked epics
  flipped to Ready.
- `production/epics/economy/EPIC.md` → status Ready
- `production/epics/event-system/EPIC.md` → status Ready
- `production/epics/player-management/EPIC.md` → status Ready
- `production/epics/hud-ui/EPIC.md` → status Ready (UX specs + art-bible
  addendum remain recommended but don't block story authoring; component-
  library stories can start immediately per ADR-017+018 specs)
- `production/epics/index.md` updated with recommended Sprint 0-4 sequence

### What this unlocks

ALL 9 epics are now in **Ready** status. Story authoring can begin on any of
them. The critical path to the Pre-Production → Production gate is:

1. `/create-stories` for the 9 epics (rough sprint order: cascade-engine,
   match-simulation, league-system → economy, player-management →
   manager-rpg, staff-system, event-system → hud-ui)
2. `/ux-design` for 5 screens (Dashboard, Match-live, Manager, Staff-inbox,
   End-of-month) — resolves OQ-HUD-08 empty states, gives stories acceptance
   criteria
3. Art-bible MVP-scope addendum (~30 min — AD gate-check concern)
4. `/asset-spec` (no args) → `design/assets/entity-inventory.md`
5. `/sprint-plan new`
6. Re-run `/gate-check pre-production`

Producer's 2-3 productive day estimate from 2026-05-18 stands. ADR writing
took the chunk of overnight time; UX specs + entity inventory + sprint plan
+ stories are next.

### Recommended next session (morning of 2026-05-19)

**Option A (recommended)**: Start `/create-stories cascade-engine` — the
foundational epic. The slice provides 6/18 chains as test templates;
production rewrites with the full set. This is the most leverage per hour of
work because cascade-engine is the dependency of 5 other systems.

**Option B**: Start `/ux-design Dashboard` — orthogonal track. The Dashboard
spec resolves OQ-HUD-08 empty states + grounds the input-control taxonomy
(ADR-017) in concrete copy + layout. Useful to do BEFORE writing hud-ui
stories so stories have UX specs to point at.

**Option C**: Both A and B in parallel — write cascade-engine stories first,
then switch context to dashboard UX spec while the cascade-engine stories
are in review.

Whichever option Pablo picks, the work is now unblocked on every front.

`stage.txt` still "Concept" (gate not yet passed formally — needs stories +
sprint-plan + gate re-run).

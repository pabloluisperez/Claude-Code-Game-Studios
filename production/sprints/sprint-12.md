---
Sprint: 12
Name: "Polish — mid-week pause + A11y P2 + Pablo validation pass"
Status: In Progress
Window: 2026-10-07 → 2026-10-20
Capacity: ~8 productive days (Polish phase)
Review Mode: lean
Phase: Polish
---

# Sprint 12 — 2026-10-07 to 2026-10-20

## Sprint Goal

Cerrar la feature crítica de MVP — mid-week pause real con STOP events
en día arbitrario — más el batch A11y P2 y la pasada de validación
manual (Pablo) que desbloquea el Polish→Release gate.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved for unplanned work
- Available: 8 days

## Tasks

### Must Have (Critical Path)

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 12-1 | STOP event con `scheduledDayOfSeason` — per-day loop en `advanceDays` con halt mid-week | web-backend-specialist | 2.0 | — | Schema: `calendar_events.scheduledDayOfSeason` (nullable, additive). `advanceDays(7)` loop día-a-día; al alcanzar día con STOP event activo halts y devuelve `{ stopped: { reason: 'stop_event', day, eventId } }`. Tests: STOP en día 3 → daysAdvanced=3. Determinismo: sin STOP events, `advanceDays(7)` produce mismo state que el camino weekly. |
| 12-2 | Wire advance-transition modal a resume-from-day | gameplay-programmer | 1.0 | 12-1 | Cuando `advanceDays` halts mid-week, el modal abre con el evento; tras decisión, `advanceDays(remainingDays)` continúa hasta día 7 (o siguiente STOP). `localStorage` resume key extendido con `daysRemaining`. UI muestra día actual (no sólo semana). |
| 12-3 | A11y P2 batch (3 hallazgos) | accessibility-specialist | 1.0 | — | P2-1 skip-link al main content (Tab desde topbar → "Saltar al contenido"). P2-2 heading levels coherentes (h1→h2→h3 sin saltos en /dashboard, /finance, /league, /squad, /staff, /inbox). P2-3 form labels en sponsor offer Accept/Reject buttons. +automated aria tests. |

### Should Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 12-4 | Manual validation pass (Pablo) | Pablo (solo dev) | 1.0 | 12-1, 12-2, 12-3 live | (a) A11y P1+P2 keyboard pass — ~10 min siguiendo checklist en `production/qa/evidence/a11y-p1-sprint-11.md` + nuevo `a11y-p2-sprint-12.md`. (b) Browser e2e dashboard → advance → next week (~10 min). (c) Playtest Polish #1 ~45 min con foco en mid-week pause feel. Reporte único en `production/playtests/2026-10-XX-polish-sprint-12.md` con: hallazgos de feel, bugs S1/S2, ¿el mid-week pause cierra el finding E del playtest 2026-05-21? |

### Nice to Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 12-5 | Soak test protocol scaffolding | qa-lead | 0.5 | — | `production/qa/soak-test-protocol.md` define: duración objetivo (10 sesiones consecutivas o ~3h continuas), métricas a observar (memory growth, balance drift entre tick semanal y batch de 10 ticks, tick latency P99), trigger conditions para abort (memory > 512MB, balance NaN, exception en advance). Implementación del runner queda para Sprint 13. |

## Carryover from Sprint 11

| Task | Reason | New Estimate |
|------|--------|-------------|
| Mid-week pause (ADR-020 §"Enables") | Foundation landed Sprint 11 (schema + advanceDays(7) wrapper); feature implementation lands Sprint 12. | 3.0d → 12-1 + 12-2 |
| A11y P2 findings | Audit identificó 3 P2 items; P0+P1 cerrados Sprint 10+11. | 1.0d → 12-3 |
| Playtest Polish #1 + Pablo walkthroughs Sprint 11 | Bloqueados en disponibilidad de Pablo. | 1.0d → 12-4 |
| `POST /api/advance` Hono route + cross-app HTTP migration | Sprint 11 deviation 1 — sólo lo arrancamos si arranca MMO. Sprint 12 NO toca. | n/a (v1.1+ unless MMO triggered) |

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Per-day loop introduce regressions en cascade/economy (Option A vs B tension) | Media | Alta | Lock Option B: cascade decay + end-of-week side effects siguen en día 6. El loop sólo añade STOP-check por día. Determinismo test bloquea cambios accidentales. |
| Schema migration `scheduledDayOfSeason` afecta calendar_events queries existentes | Baja | Media | Nullable + DEFAULT NULL — backfill no necesario; eventos viejos siguen funcionando con `week` granularity. |
| 12-2 resume-from-day requiere refactor del advance-transition modal | Media | Baja | Modal ya tiene `RESUME_KEY` en localStorage (Sprint 9); extender en lugar de reescribir. |
| Playtest 12-4 surfaces blocker para Polish→Release | Media | Alta | Si bloquea: triage inmediato + Sprint 13 hotfix. Si no: Sprint 13 = soak + balance review. |
| Mid-week pause introduce confusion en UX (jugador no entiende por qué para) | Baja | Media | El advance-transition modal ya muestra el evento que dispara la pausa (mecanismo "Cancelar y actuar" existente). Sólo cambia el día en que ocurre. |

## Dependencies on External Factors

- 12-4 requiere ~1h continuo de Pablo (walkthrough + playtest). No-blocking del sprint en sí, pero blocking del Polish→Release gate.

## Definition of Done for Sprint 12

- [ ] 12-1, 12-2, 12-3 completados (Must Have)
- [ ] 12-4 completado si Pablo dispone del tiempo (Should Have, blocking de Release gate)
- [ ] QA plan existe (`production/qa/qa-plan-sprint-12.md`)
- [ ] Todos los criterios de aceptación superados
- [ ] Smoke check pasado (`production/qa/smoke-sprint-12-*.md`)
- [ ] QA sign-off report: APPROVED o APPROVED WITH CONDITIONS
- [ ] `dashboard/+page.server.ts` + `advance-transition.svelte` no contienen lógica duplicada (la única fuente de verdad para mid-week halt es el orchestrator)
- [ ] STOP event con `scheduledDayOfSeason` mid-week halts correctamente (test determinismo + integration)
- [ ] 3 hallazgos A11y P2 cerrados con evidencia en `production/qa/evidence/a11y-p2-sprint-12.md`
- [ ] Sin bugs S1 o S2 nuevos introducidos
- [ ] (12-4) Manual validation pass completado → desbloquea Polish→Release gate
- [ ] Design documents actualizados para cualquier desviación del plan

---

## QA Test Cases

> Back-filled by /qa-plan 2026-05-21. Plan inline (no archivo separado a petición de Pablo).

### 12-1: STOP event scheduledDayOfSeason + per-day halt — Integration + Logic

**Test files**:
- `apps/web/tests/advance-stop-events.test.ts` (unit — semantics + determinismo)
- `apps/api/tests/advance/scheduled-day-integration.test.ts` (integration — DB roundtrip)

Pruebas:
- Schema: `calendar_events.scheduledDayOfSeason` (integer nullable, DEFAULT NULL — sin backfill)
- Determinismo: `advanceDays(7)` sin STOP events → resultado idéntico al weekly Sprint 11 baseline
- STOP día 3 → `{ daysAdvanced: 3, stopped: { reason: 'stop_event', day, eventId } }`; currentDayOfSeason=día3; currentWeek no incrementa; WorldState NO actualizado (Option B atómico)
- STOP día 6 → halts ANTES del end-of-week rollover (sponsor, wages, snapshot, ticket drip)
- Resume: `advanceDays(remainingDays)` después del halt completa la semana; eventos marcados `resolved`
- Múltiples STOPs misma semana (día 2 + día 5) → halts secuenciales con resume entre cada uno
- Legacy events sin `scheduledDayOfSeason` (week-based) siguen funcionando — no regresión
- Edge: STOP en pasado → ignored; STOP > día 7 → no halt este tick; 0 STOPs → flujo normal

ADR-020 §6 cubre la spec completa. ~10 unit + ~3 integration tests.

### 12-2: Advance-transition modal resume — UI + Integration

**Test file**: `apps/web/tests/advance-transition-resume.test.ts`

Pruebas:
- Modal abre en día correcto cuando resume key tiene `dayIndex` mid-week
- Resume key extendida con `daysRemaining`; form action lee y pasa a `advanceDays`
- Clear resume key cuando dayIndex llega a 7
- Backward compat: resume key sin `daysRemaining` defaults a 7
- Grep negativo: `+page.server.ts` no contiene lógica de día duplicada

~5 tests.

### 12-3: A11y P2 batch — UI

**Test file**: `apps/web/tests/a11y-p2-batch.test.ts`

Pruebas:
- **P2-1 skip-link**: `+layout.svelte` tiene `<a href="#main-content">` antes del topbar; `<main id="main-content">`; CSS sr-only + focus-visible
- **P2-2 heading levels**: para cada `/dashboard`, `/finance`, `/league`, `/squad`, `/staff`, `/inbox` — un solo `<h1>`, no skips h1→h3 sin h2
- **P2-3 sponsor labels**: botones Accept/Reject con `aria-label="Aceptar oferta de [sponsor name]"` o `aria-labelledby` apuntando al nombre

~9 tests (1 skip + 6 heading + 2 sponsor).

### 12-4: Manual validation pass (Pablo) — Visual/Feel

**Evidence file**: `production/playtests/YYYY-MM-DD-polish-sprint-12.md`

Three-part protocol en una sola sesión:
- **Part A (~10 min)**: A11y P1+P2 keyboard pass — checklist en `production/qa/evidence/a11y-p1-sprint-11.md` + nuevo `a11y-p2-sprint-12.md`
- **Part B (~10 min)**: Browser e2e dashboard → advance → next week; incluir caso STOP event mid-week
- **Part C (~45 min)**: Playtest Polonia #1 con foco: ¿mid-week pause cierra finding E? ¿foundation suficiente para Polish→Release?

Reporte único con verdict + S1/S2 bugs.

### 12-5: Soak test protocol — Config/Data

**File**: `production/qa/soak-test-protocol.md`

Sección obligatorias:
- Duración objetivo (10 sesiones consecutivas o ~3h)
- Métricas (memory growth, balance drift, tick latency P99)
- Trigger conditions abort (memory > 512MB, NaN, exception)
- Runner implementation diferida a Sprint 13

Static check: archivo existe + secciones presentes.

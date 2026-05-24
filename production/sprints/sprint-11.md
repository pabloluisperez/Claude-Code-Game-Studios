---
Sprint: 11
Name: "Polish — orchestrator completo + tick diario + A11y P1"
Status: In Progress
Window: 2026-09-23 → 2026-10-06
Capacity: ~8 productive days (Polish phase)
Review Mode: lean
Phase: Polish
---

# Sprint 11 — 2026-09-23 to 2026-10-06

## Sprint Goal

Completar la extracción del advance orchestrator al 100%, aceptar ADR-020,
implementar el tick diario, y cerrar el batch de A11y P1 — dejando la base
de día-a-día lista para la implementación de la pausa mid-week en Sprint 12+.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved for unplanned work
- Available: 8 days

## Tasks

### Must Have (Critical Path)

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 11-1 | Aceptar ADR-020 (tick diario) | technical-director + Pablo | 0.5 | — | `docs/architecture/ADR-020-day-by-day-tick.md` Status → Accepted; fecha de aceptación registrada. |
| 11-2 | Orchestrator extraction — DB-write completo | web-backend-specialist | 2.5 | — | `apps/api/src/modules/advance/orchestrator.ts` exporta `runAdvanceTick(playthroughId, decisions)` manejando pipeline completo (snapshot persist, match-day, staff messages, season rollover). `dashboard/+page.server.ts` action delega a `POST /api/advance`. Todos los tests existentes en verde. Nuevos unit tests del orchestrator. |
| 11-3 | A11y P1 batch (6 hallazgos) | accessibility-specialist | 1.5 | — | P1-1+P1-2 confirm-dialog (focus trap + focus return). P1-3 advance-transition focus. P1-4 tab bars (aria-selected + aria-controls). P1-5 match aria-live region. P1-6 balance signal (icon/prefix en topbar). Smoke sigue en verde. |

### Should Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 11-4 | Day-by-day tick implementation | web-backend-specialist | 2.5 | 11-1 + 11-2 | Schema: columna `current_day_of_season` añadida (migration con DEFAULT 1). `advanceDays(playthroughId, n)` implementado en orchestrator. Batch de 7 días produce WorldState idéntico al tick semanal — test de determinismo pasa. STOP event mid-day detiene advance en el día correcto con cascade-engine en estado consistente. |

### Nice to Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 11-5 | Playtest Polish #1 (diferido de 10-6) | Pablo (solo dev) | 0.5 | 11-2 (orchestrator funcionando) | Sesión de ~45 min contra build post-Sprint-11. Reporte en `production/playtests/2026-10-XX-polish-sprint-11.md`. Foco: ¿se siente más granular el avance con tick diario? ¿El orchestrator separado cambia el flujo percibido? |

## Carryover from Sprint 10

| Task | Reason | New Estimate |
|------|--------|-------------|
| 10-5 (DB-write portion) | Sprint 10 entregó extracción pura-compute; porción DB-write sigue inline en `dashboard/+page.server.ts`. | 2.5 days → 11-2 |
| 10-6 (Playtest Polish #1) | Diferido por disponibilidad Pablo. | 0.5 days → 11-5 |

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Refactor del advance pipeline rompe flujo en producción de forma sutil | Media | Alta | Mantener `advance()` inline como fallback 1 sprint; eliminar sólo tras smoke post-11-2. |
| Schema migration `current_day_of_season` requiere backfill complejo | Baja | Media | Columna con DEFAULT 1 (inicio de semana); backfill trivial — no requiere backfill de datos históricos en dev. |
| A11y P1 focus-trap requiere Svelte action nueva — complejidad subestimada | Baja | Baja | Si >1 day, split en dos commits: dialogs (P1-1/2/3) y tab+aria (P1-4/5/6). |
| ADR-020 acceptance se demora — bloquea 11-4 pero no 11-1/11-2/11-3 | Baja | Media | 11-1, 11-2, 11-3 arrancan de todos modos. 11-4 espera el verde de ADR. |

## Dependencies on External Factors

- 11-5 depende de disponibilidad de Pablo para sesión de playtest — no bloquea el sprint.

## Definition of Done for Sprint 11

- [ ] 11-1, 11-2, 11-3 completados (Must Have)
- [ ] 11-4 completado si la capacidad lo permite (Should Have)
- [ ] QA plan existe (`production/qa/qa-plan-sprint-11.md`)
- [ ] Todos los criterios de aceptación superados
- [ ] Smoke check pasado (`production/qa/smoke-sprint-11-*.md`)
- [ ] QA sign-off report: APPROVED o APPROVED WITH CONDITIONS (`/team-qa sprint`)
- [ ] `dashboard/+page.server.ts` advance action no contiene lógica de pipeline (sólo HTTP call al orchestrator)
- [ ] ADR-020 en estado Accepted
- [ ] 6 hallazgos A11y P1 cerrados con evidencia en `production/qa/evidence/`
- [ ] Sin bugs S1 o S2 nuevos introducidos
- [ ] Design documents actualizados para cualquier desviación del plan

---

## QA Test Cases

> Back-filled by /qa-plan 2026-05-21. Full plan: `production/qa/qa-plan-sprint-11-2026-05-21.md`

### 11-2: Orchestrator DB-write — Integration

**Test file**: `tests/integration/advance/orchestrator-full-pipeline.test.ts`

- `POST /api/advance` happy path → 200, snapshot persisted, `currentWeek` +1
- Grep negativo: `+page.server.ts` sin `runTVPrePhase`, `runTick`, `applyEconomyTick`, `db.insert(worldSnapshots)`
- Paridad de WorldState: mismos `financial_balance`, `corruption_exposure`, `fan_loyalty` que el inline action
- Economy tick incluido: sponsor payment + wages + ticket drip reflejados en balance
- Error: `playthroughId` inválido → 404; sin sesión → 401
- Atomicidad: fallo mid-transaction → rollback completo (sin estado parcial)
- Regresión baseline: ≥ 998 tests en verde antes y después

### 11-3: A11y P1 batch — UI (Playwright)

**Test file**: `tests/integration/a11y/a11y-p1-batch.test.ts`

- **P1-4**: `/finance`, `/league`, `/inbox` tabs — `aria-selected="true"` en activo, `aria-selected="false"` en demás, `aria-controls` apunta a `role="tabpanel"` con `id` coincidente
- **P1-5**: Contenedor match-event-log tiene `aria-live="polite"` y `aria-atomic="false"`
- **P1-6**: Balance negativo → topbar contiene ⚠ o prefijo "−"; balance en 0 → sin icono
- Edge: tab activo en posición 1, 2 y 3 (todos correctos)

Manual (evidence: `production/qa/evidence/a11y-p1-sprint-11.md`):
- P1-1: Tab no escapa del confirm-dialog (cicla entre botones)
- P1-2: Foco vuelve al elemento que abrió el dialog
- P1-3: advance-transition no pierde lugar del screen reader

### 11-4: Day-by-day tick — Logic (unit) + Integration

**Test files**: `tests/unit/advance/advance-days.test.ts` + `tests/integration/advance/advance-days-migration.test.ts`

Unit tests:
1. Determinismo: `advanceDays(7)` produce WorldState idéntico a `advance()` — mismos `financial_balance`, `corruption_exposure`, `fan_loyalty` (ADR-020 Verification #1)
2. Idempotencia: `advanceDays(0)` → no-op; `currentDayOfSeason` sin cambio; sin snapshot insertado (ADR-020 Verification #2)
3. STOP event day 3: `advanceDays(7)` → `{ daysAdvanced: 3, stopped: { reason: 'stop_event' } }` (ADR-020 Verification #3)
4. End-of-week rollover sólo en day 6: sponsor + wages + drip + snapshot → exactamente una vez, no en días 0–5
5. Match-day en Saturday (day 5): fixture `scheduledDayOfSeason + 5` corre en día 5
6. Invariante: `currentWeek === Math.floor(currentDayOfSeason / 7)` tras cada advance
7. STOP en day 0: `daysAdvanced = 0`, sin substep ejecutado
8. `maxDays > 265`: no excede `currentDayOfSeason = 265`

Integration tests:
- Schema: `current_day_of_season INTEGER NOT NULL DEFAULT 0` existe en `playthroughs`
- Backfill: fila con `current_week = 5` → `current_day_of_season = 35`
- Regresión: ≥ 998 tests en verde post-migration

### 11-5: Playtest Polish #1 — Visual/Feel

No hay tests automatizados. Evidence requerida:
- Reporte en `production/playtests/YYYY-MM-DD-polish-sprint-11.md`
- Pregunta foco: ¿tick diario mejora la percepción de granularidad? ¿Mid-week pause es intuitivo?
- Cualquier S1/S2 bug → `production/qa/bugs/`

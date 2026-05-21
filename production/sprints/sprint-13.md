---
Sprint: 13
Name: "Polish — suspensión roja + match polish + soak runner + gate-check Release"
Status: In Progress
Window: 2026-10-21 → 2026-11-03
Capacity: ~8 productive days (Polish phase)
Review Mode: lean
Phase: Polish
---

# Sprint 13 — 2026-10-21 to 2026-11-03

## Sprint Goal

Cerrar los 2 gaps de realismo que bloquean el Release (suspensión por roja +
match live polish + bug estado financiero), lanzar el soak test runner para
validar estabilidad prolongada, y ejecutar el Polish→Release gate-check que
da el visto bueno al último sprint de producción antes de publicar.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved for unplanned work
- Available: 8 days

## Tasks

### Must Have (Critical Path)

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 13-1 | BUG-PT-5: Suspensión por tarjeta roja | web-backend-specialist | 2.0 | — | Schema `players.suspended_until_week` (nullable). Match-sim emite `suspensionWeeks` en MatchOutcome. Match-day runner persiste en players. /squad muestra badge "Suspendido N partidos". Lineup selector filtra suspendidos. Staff message "El árbitro expulsó a [Player]. Se pierde N partido(s)." Fórmula: roja directa grave→3, roja directa→2, doble amarilla→1. Tests: unit (fórmula) + integration (lineup excluye suspendido). |
| 13-2 | BUG-FIN-1: Estado financiero incorrecto — muestra "Sano" con balance negativo | web-backend-specialist | 0.5 | — | El estado financiero debe derivarse de `financial_balance` + `cashflow_weekly` del WorldState, NO de otra fuente. Cuando `balance < 0` → "En quiebra" (status 4) independientemente de `cashflow`. Cuando `balance ≥ 0` y `cashflow < -X` → "En riesgo" o "Crisis" según thresholds del GDD economy.md. Actualizar la función de cálculo. Prueba manual: balance −1M€ + cashflow −64k€/sem → debe mostrar "En quiebra" (rojo). |
| 13-3 | Soak test runner CLI | qa-lead | 1.5 | — | `pnpm soak-test --season-count=5` ejecutable desde monorepo root. Synthetic playthrough (seed clubs + league + staff). Loop tick a tick + log métricas por tick. Aborta si RSS >512MB, NaN en WorldState, exception, o balance drift vs baseline determinístico. Output en `production/qa/soak-runs/[date]/summary.md`. Nightly CI wired. |
| 13-4 | Polish→Release gate-check | `/gate-check polish` | 0.5 | 13-1 + 13-2 + 13-3 done | Ejecutar `/gate-check polish` al final del sprint. Requisito: 0 S1/S2 abiertos (BUG-PT-5 + BUG-FIN-1 cerrados), soak pass, QA sign-off, 3+ playtests documentados. Resultado: PASS → Sprint 14 = release prep. CONCERNS → Sprint 14 = hotfix + gate retry. |

### Should Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 13-5 | BUG-PT-4: Match live polish (parada + confeti + VAR) | gameplay-programmer | 1.8 | — | Pre-event pause (~1s) antes de gol/roja/penalti con hint "algo importante...". Confeti CSS burst (1-2s) al gol del club local. VAR: ~8% de goles → "VAR checking..." (2s) → confirmar o disallowed. Toda la lógica vía `MatchOutcome.events` extension — sin cambio al core sim. Tests: static que comprueban los 3 branches en el componente. |
| 13-6 | Live DB integration tests STOP halt | web-backend-specialist | 1.0 | — | `apps/api/tests/advance/scheduled-day-integration.test.ts` — 3 test cases: STOP en día 3 → persiste currentDayOfSeason=day3 + currentWeek NO incrementa. Resume tras halt → completa semana. STOP legacy (scheduledDayOfSeason=null) → week*7 fallback. Real DB via seeded playthrough + calendar_event rows. |

### Nice to Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 13-7 | Release checklist draft | release-manager | 0.5 | 13-4 PASS | Primer borrador de `production/releases/release-checklist.md` con secciones: build verification, store metadata, legal/privacy, performance final, changelog para el player. |

## Carryover from Sprint 12

| Task | Reason | New Estimate |
|------|--------|-------------|
| BUG-PT-5 (red-card suspension) | S2 — playtest 12-4. Gameplay rule gap. | 2.0d → 13-1 |
| BUG-FIN-1 (estado financiero incorrecto) | S1 — encontrado Pablo post-playtest. Balance −1M€ + cashflow −64k€/sem muestra "Sano". | 0.5d → 13-2 |
| Soak test runner | 12-5 definió el protocolo; CLI faltaba. | 1.5d → 13-3 |
| Live DB integration tests STOP | 5 it.todo flags en advance-days.test.ts. | 1.0d → 13-6 |
| Polish→Release gate-check | Polish phase requirement, bloqueado hasta S2 cerrados + soak. | 0.5d → 13-4 |
| BUG-PT-4 (match live polish) | S3 — playtest 12-4. | 1.8d → 13-5 |

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| BUG-FIN-1 más complejo de lo esperado — afecta múltiples fórmulas | Media | Alta | Auditar economy.md §F5 (financial status thresholds) antes de tocar código. |
| match-sim extension VAR/confeti toca rutas de test existentes | Media | Alta | BUG-PT-4 usa sólo MatchOutcome.events extension — sin cambiar la sim core ni los 953 tests de @smt/shared. |
| Soak test tarda >1h por run — nightly CI problemático | Media | Media | Primero medir sin CI; añadir nightly sólo si <20min. |
| Polish→Release gate falla por BUG-FIN-1 si scope subestimado | Baja | Alta | BUG-FIN-1 es S1 — sale de Must Have en Sprint 13. |

## Dependencies on External Factors

- 13-4 (gate-check) requiere 13-1 + 13-2 + 13-3 done (gate necesita 0 S1/S2 abiertos + soak pass).
- 13-7 empieza sólo si el gate da PASS.

## Definition of Done for Sprint 13

- [ ] 13-1 BUG-PT-5 cerrado: schema + match-day + squad + staff msg + tests
- [ ] 13-2 BUG-FIN-1 cerrado: financial status correcto en todos los casos (balance negativo → quiebra)
- [ ] 13-3 Soak test runner: `pnpm soak-test` sin abort en 5 temporadas; summary.md producido
- [ ] 13-4 Polish→Release gate-check ejecutado: PASS o CONCERNS con action-plan
- [ ] QA plan existe (`production/qa/qa-plan-sprint-13.md`)
- [ ] Todos los AC verificados
- [ ] Smoke check pasado
- [ ] QA sign-off APPROVED o APPROVED WITH CONDITIONS
- [ ] Sin S1 o S2 nuevos introducidos
- [ ] Design documents actualizados para cualquier desviación

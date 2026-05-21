---
Sprint: 14
Name: "Release — rate limiting + legal pages + build verification + go/no-go"
Status: In Progress
Window: 2026-11-04 → 2026-11-17
Capacity: ~8 productive days (Release phase)
Review Mode: lean
Phase: Release
---

# Sprint 14 — 2026-11-04 to 2026-11-17

## Sprint Goal

Completar todos los artefactos de release necesarios para el go-live de Cascada FC
MVP v1.0: legal pages, rate limiting, build final verification, copy & onboarding
review, y go/no-go sign-off.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reservados para imprevistos
- Available: 8 days

## Tasks

### Must Have (Critical Path — release blockers)

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 14-1 | Rate limiting — `/api/advance` + `/api/match` | web-backend-specialist | 1.5 | — | Middleware Hono que limita a N req/min por IP/sesión en ambas rutas (valores en config, no hardcoded). Tests: rate limit retorna 429 cuando se supera. Sin impacto en Playwright e2e. |
| 14-2 | Legal pages — /terms + /privacy | web-frontend-specialist | 1.5 | — | Rutas `/terms` y `/privacy` accesibles sin auth. Contenido real: ToS cubre auth sessions + responsabilidad. Privacy Policy cubre qué datos se almacenan (session cookie, hashed password, playthrough data) — sin tracking externo MVP. Enlazadas desde footer. A11y OK (landmark, heading structure). |
| 14-3 | Build verification final | qa-lead | 1.0 | 14-1 done | Checklist sección §1 + §4 completa: `pnpm install` limpio OK, `pnpm turbo run test` ≥ 1143 verdes, `pnpm turbo run build` sin errores, `pnpm playwright test` PASS, `pnpm soak-test --season-count=5` PASS, svelte-check 0 errors, bundle < 500KB, Lighthouse ≥ 80 en dashboard/finance/squad, EXPLAIN ANALYZE avance pipeline (ninguna query > 100ms), API p95 < 200ms, cold-start < 2s Fast 3G. Resultados en `production/releases/build-verification-sprint-14.md`. |
| 14-4 | Copy review + tooltips + onboarding walkthrough | ux-designer | 1.0 | — | Todos los staff messages revisados (sin lorem ipsum, ortografía ES). Cada métrica del dashboard tiene tooltip. Fresh-player walkthrough: nuevo jugador completa semana 1 sin guía externa. Evidencia en `production/qa/evidence/copy-review-sprint-14.md`. |
| 14-5 | Go/No-Go release gate + release-checklist sign-off | release-manager | 0.5 | 14-1 + 14-2 + 14-3 + 14-4 done | Release checklist `production/releases/release-checklist.md` completada (todas las secciones Must Have sin `TBD`). Go/No-Go decision en `production/releases/go-no-go-v1.0.md`. PASS → tag `v1.0.0`. FAIL → hotfix sprint. |

### Should Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 14-6 | Store / hosting metadata | community-manager | 1.0 | — | Sección §2 de release-checklist completa. Descripción corta (≤ 80 chars) + larga (3 párrafos, pillars A + C). Screenshots 5+ (dashboard, /finance, /squad, /match live, /league). Pricing decision documentada. |
| 14-7 | Sentry error tracking + DB backup config | web-backend-specialist | 0.5 | — | Sentry DSN vía env var `SENTRY_DSN`. Errores de Hono y BullMQ capturados. `pg_dump` diario documentado en runbook. Sección §5 de release-checklist actualizada. |
| 14-8 | Changelog v1.0 (player-facing) | writer | 0.5 | — | `production/releases/changelog-v1.0.md` con notas para el jugador: features clave (simulación, fichajes, live-match, economía, suspensiones), sin jerga técnica. |

### Nice to Have

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 14-9 | Rollback plan + asset attributions | release-manager | 0.5 | — | `production/releases/rollback-plan.md` con pasos concretos (git tag rollback, pg_restore, criterio S1 → rollback < 1h). Sección §3 asset attributions completa. |
| 14-10 | Playtest adicional (match polish + suspensión) | — | 0.5 | — | 1 sesión en `production/playtests/` enfocada en suspensión (badge + staff msg) + confeti + VAR. |

## Carryover desde Sprint 13

Ninguno — Sprint 13 cerrado al 100% (7/7 stories done).

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Legal pages requieren revisión legal externa — bloqueo no técnico | Baja | Alta | MVP: auto-drafted ToS + Privacy basados en templates open-source (sin monetización de datos). Revisión legal opcional para soft-launch a audiencia limitada. |
| Lighthouse < 80 en mobile — bundle excedido por PixiJS | Media | Media | PixiJS code-split en match-live route (ya configurado). Fallback: lazy-load más agresivo o auditar importaciones. |
| Rate limiting demasiado agresivo — bloquea jugador legítimo | Media | Media | Thresholds conservadores (ej. 30 req/min advance). Testear con playtest antes de merge. |
| EXPLAIN ANALYZE revela query > 100ms en advance pipeline | Media | Alta | Arreglo conocido: índice en `calendar_events(playthrough_id, day)`. Reservado en buffer de capacidad. |

## Dependencies on External Factors

- 14-5 go/no-go requiere 14-1 + 14-2 + 14-3 + 14-4 completos.
- Decisión de plataforma de deploy (Railway / Fly.io / Render / VPS) no bloquea sprint pero debe tomarse antes del go-live.
- 14-10 playtest requiere tiempo de Pablo — opcional.

## Definition of Done para Sprint 14

- [ ] 14-1 Rate limiting implementado + tests 429 pasan
- [ ] 14-2 `/terms` + `/privacy` rutas vivas con contenido real
- [ ] 14-3 Build verification completa: todos los gates §1 + §4 verdes, documentados
- [ ] 14-4 Copy review + tooltips + onboarding walkthrough evidenciados
- [ ] 14-5 Go/No-Go decision tomada + release-checklist completada (Must Have)
- [ ] QA plan existe (`production/qa/qa-plan-sprint-14.md`)
- [ ] Todos los AC verificados
- [ ] Smoke check pasado
- [ ] QA sign-off APPROVED o APPROVED WITH CONDITIONS
- [ ] Sin S1/S2 nuevos introducidos
- [ ] Tag `v1.0.0` creado si go/no-go → PASS

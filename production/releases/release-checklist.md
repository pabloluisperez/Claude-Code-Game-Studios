# Release Checklist — Cascada FC MVP v1.0

**Status**: DRAFT (Sprint 13 task 13-7)
**Target release date**: TBD (post Polish→Release gate PASS)
**Owner**: Pablo (solo dev)

Cada sección debe estar verde antes del go-live. Marca con `[x]` cuando
quede cerrado y enlaza el artefacto justificativo en `production/`.

---

## 1. Build verification

- [ ] `pnpm install` desde clone limpio funciona sin warnings P0
- [ ] `pnpm turbo run test` — todos los tests verdes (≥ 1200 esperados post-Sprint 13)
- [ ] `pnpm turbo run build` — production build en apps/web + apps/api sin errores
- [ ] `pnpm playwright test` — happy-path e2e pasa
- [ ] `pnpm soak-test --season-count=5` PASS (verdict en `production/qa/soak-runs/`)
- [ ] svelte-check 0 errors (`pnpm --filter @smt/web exec svelte-check`)
- [ ] Bundle size: `apps/web` initial JS < 500 KB (per technical-preferences.md)
- [ ] Lighthouse perf score ≥ 80 en dashboard, /finance, /squad (mobile + desktop)

## 2. Store / hosting metadata

- [ ] **Nombre**: "Cascada FC — Total Soccer Manager"
- [ ] **Descripción corta** (≤ 80 chars): TBD
- [ ] **Descripción larga**: 3 párrafos · pillars A + C · DOM-only
- [ ] **Screenshots** (5+): dashboard, /finance, /squad, /match live, /league
- [ ] **Logo + iconos**: 16/32/64/128/256/512 px
- [ ] **Categoría store**: Sports / Simulation
- [ ] **Pricing**: TBD (free? freemium? one-time?)
- [ ] **Soporte**: email / URL de contacto

## 3. Legal / Privacy

- [x] **Terms of Service** publicados (/terms) — story 14-2 (Sprint 14)
- [x] **Privacy Policy** publicado (/privacy) — cubre auth sessions, no analytics externo, derechos GDPR — story 14-2
- [x] **Cookie policy** — solo una cookie técnica `session` (HTTP-only, SameSite=Lax). No banner GDPR necesario per Privacy Policy §8.
- [ ] **License**: ver `LICENSE` en repo root — verificar que la licencia del MVP esté correcta
- [x] **Asset attributions**: tabla en `production/releases/rollback-plan.md` §Asset attributions (Lucide, daisyUI, Tailwind, SvelteKit, Hono). Sin imágenes/audio de terceros en MVP.
- [ ] **GDPR/LOPD**: data-export endpoint si captura PII (Privacy Policy §7 promete portabilidad — endpoint todavía no expuesto; backlog v1.1)
- [x] **Edad mínima**: 13+ documentado en ToS §4 + Privacy §9

## 4. Performance final

- [ ] **API response time**: < 200ms p95 para acciones de management (per technical-preferences.md)
- [ ] **Match-live frame rate**: 60 fps en replay (canvas/DOM)
- [ ] **DB queries**: ninguna > 100ms en advance pipeline (verificar con EXPLAIN ANALYZE)
- [ ] **Memory ceiling**: < 256MB RAM por proceso (api + web)
- [ ] **Cold-start**: dashboard carga inicial < 2s en conexión lenta (Chrome throttling Fast 3G)

## 5. Security / Operations

- [x] **Anti-cheat**: sesión cookie + server-authoritative state (ya documentado en ADRs)
- [x] **Rate limiting**: implementado en /matches/start (30/min/IP), /matches/:id/decision (120/min/IP), y /dashboard?/advance (60/min/user). Story 14-1 (Sprint 14). 8 tests verdes.
- [x] **Secrets**: DATABASE_URL + REDIS_URL + SENTRY_DSN via env vars (apps/api/src/env.ts + process.env). No commiteados.
- [x] **Sentry / error tracking**: wrapper `apps/api/src/lib/observability.ts` con sanitización PII. Hono .onError + worker integration. SENTRY_DSN opcional (no-op si ausente). Story 14-7 (Sprint 14). 9 tests verdes.
- [x] **Database backups**: runbook `docs/runbooks/db-backups.md` — pg_dump diario 04:30 UTC, S3 con versioning + replicación cross-region, verificación semanal (restore en throwaway DB).
- [ ] **Migrations**: todas las migrations 0001..00XX aplicables clean en DB nueva
- [x] **Rollback plan**: `production/releases/rollback-plan.md` — story 14-9 (Sprint 14). Procedures A (code rollback < 30min) + B (DB restore < 60min), decision matrix por severidad, comms templates ES. **Go-live blocker**: ejecutar al menos un restore de práctica antes de tagear v1.0.

## 6. Content / Polish

- [ ] **Onboarding flow**: nuevo jugador completa Sprint 1 (4 semanas) sin guía externa
- [ ] **Tooltips**: cada métrica del dashboard tiene tooltip explicativo
- [ ] **A11y**: WCAG 2.1 AA PASS (P0 + P1 + P2 todos cerrados — verificado Sprint 12 + 13)
- [ ] **i18n**: español ES por defecto (MVP no incluye otros idiomas)
- [ ] **Copy review**: todos los staff messages + UI strings revisados (sin lorem ipsum)
- [ ] **Error states**: cada formulario maneja errores de validación + de server

## 7. Marketing / Comms

- [x] **Changelog v1.0**: `production/releases/changelog-v1.0.md` — story 14-8 (Sprint 14). Player-facing en ES, sin jerga técnica.
- [ ] **Trailer**: 30-60s video del gameplay (opcional)
- [ ] **Launch post**: borrador para blog / redes
- [ ] **Press kit**: opcional, depende del scope de release

## 8. Polish→Release gate sign-off

- [ ] `/gate-check polish` ejecutado → veredicto PASS
- [ ] Sprint 13 QA sign-off APPROVED
- [ ] No S1 ni S2 abiertos en `production/qa/bugs/`
- [ ] 3+ playtests Polish documentados (Sprint 12 #1 ya cuenta; necesita +2 si exigible)

---

## Go / No-Go decision

**Owner**: Pablo
**Date**: TBD

Decision: ☐ GO  ☐ NO-GO  ☐ GO WITH CONDITIONS

Conditions / blockers:
- TBD

Post-decision actions:
- TBD

---

> ⚠️ **Este es un draft inicial** (Sprint 13 task 13-7). El detalle de
> cada sección se rellena en Sprint 14 (release prep). El checklist
> existe para que el Polish→Release gate (13-4) pueda referenciarlo
> como prerequisito obligatorio.

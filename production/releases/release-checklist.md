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

- [ ] **Terms of Service** publicados (/terms)
- [ ] **Privacy Policy** publicado (/privacy) — cubre auth sessions + analytics si aplica
- [ ] **Cookie policy** si usa cookies de tracking (auth session no requiere banner GDPR estricto)
- [ ] **License**: ver `LICENSE` en repo root — verificar que la licencia del MVP esté correcta
- [ ] **Asset attributions**: si se usan iconos/emojis externos (Lucide, Twemoji), añadir créditos
- [ ] **GDPR/LOPD**: data-export endpoint si captura PII
- [ ] **Edad mínima**: 13+ (sin contenido adulto pero recomendado para gestión de carrera)

## 4. Performance final

- [ ] **API response time**: < 200ms p95 para acciones de management (per technical-preferences.md)
- [ ] **Match-live frame rate**: 60 fps en replay (canvas/DOM)
- [ ] **DB queries**: ninguna > 100ms en advance pipeline (verificar con EXPLAIN ANALYZE)
- [ ] **Memory ceiling**: < 256MB RAM por proceso (api + web)
- [ ] **Cold-start**: dashboard carga inicial < 2s en conexión lenta (Chrome throttling Fast 3G)

## 5. Security / Operations

- [ ] **Anti-cheat**: sesión cookie + server-authoritative state (ya documentado en ADRs)
- [ ] **Rate limiting**: en /api/advance y /api/match para evitar spam
- [ ] **Secrets**: DATABASE_URL + REDIS_URL via env vars, no committed
- [ ] **Sentry / error tracking**: configurado para producción
- [ ] **Database backups**: configurado (pg_dump diario al menos)
- [ ] **Migrations**: todas las migrations 0001..00XX aplicables clean en DB nueva
- [ ] **Rollback plan**: documentado en caso de release-blocker post-publish

## 6. Content / Polish

- [ ] **Onboarding flow**: nuevo jugador completa Sprint 1 (4 semanas) sin guía externa
- [ ] **Tooltips**: cada métrica del dashboard tiene tooltip explicativo
- [ ] **A11y**: WCAG 2.1 AA PASS (P0 + P1 + P2 todos cerrados — verificado Sprint 12 + 13)
- [ ] **i18n**: español ES por defecto (MVP no incluye otros idiomas)
- [ ] **Copy review**: todos los staff messages + UI strings revisados (sin lorem ipsum)
- [ ] **Error states**: cada formulario maneja errores de validación + de server

## 7. Marketing / Comms

- [ ] **Changelog v1.0**: `production/releases/changelog-v1.0.md` con player-facing notes
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

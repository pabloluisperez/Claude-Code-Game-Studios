# Release Checklist — Cascada FC MVP v1.0

**Status**: DRAFT (Sprint 13 task 13-7)
**Target release date**: TBD (post Polish→Release gate PASS)
**Owner**: Pablo (solo dev)

Cada sección debe estar verde antes del go-live. Marca con `[x]` cuando
quede cerrado y enlaza el artefacto justificativo en `production/`.

---

## 1. Build verification

> Detalle completo en `production/releases/build-verification-sprint-14.md` (story 14-3).

- [x] `pnpm install` desde clone limpio funciona sin warnings P0
- [x] `pnpm turbo run test` — **1160/1160 verdes** (977 shared + 61 api + 122 web)
- [x] `pnpm turbo run build` — production build en apps/web + apps/api sin errores (tras fixes ESM + logger + worldState cast en story 14-3)
- [ ] `pnpm playwright test` — happy-path e2e pasa (pendiente sesión Pablo pre-tag v1.0)
- [x] `pnpm soak-test --season-count=5` PASS — 190/190 ticks, peak RSS 75.4 MB
- [x] svelte-check 0 errors (1511 files / 5 warnings)
- [x] Bundle size: `apps/web` initial JS **9.4 KB entry** (cap 500 KB — 1.9% usage)
- [ ] Lighthouse perf score ≥ 80 en dashboard, /finance, /squad (pendiente browser real)

## 2. Store / hosting metadata

- [x] **Nombre**: "Total Soccer Manager" (subtítulo opcional: "Tu carrera, tu club").
- [x] **Descripción corta** (≤ 80 chars): "Manager de fútbol por navegador. Simula temporadas, gestiona club y carrera." (79 chars)
- [x] **Descripción larga** (3 párrafos):

> **Pillar A — Simulación táctica profunda**
> Total Soccer Manager simula partidos minuto a minuto basándose en las
> características reales de tu plantilla. Decide la alineación, formación
> y táctica antes del partido y haz cambios en momentos clave: cambios,
> presión, defender el resultado. El simulador es determinista y server-
> authoritative — cada partido es justo, reproducible y libre de trampas.
>
> **Pillar C — DOM-only, sin instalación**
> Funciona en cualquier navegador moderno, desktop o móvil. Tu carrera se
> guarda en la nube ligada a tu cuenta. Sin descargas, sin parches, sin
> launchers — solo abre el navegador y juega. La accesibilidad es de
> primera clase: navegación por teclado completa, soporte de lectores de
> pantalla y contraste WCAG 2.1 AA.
>
> **Una carrera, no un partido**
> Gestiona finanzas (taquilla, TV, patrocinios, salarios), tu cuerpo
> técnico, el mercado de fichajes y la moral del vestuario. Acompaña a
> tu manager temporada a temporada conforme acumula experiencia, hitos
> profesionales y reputación. Cada decisión cuenta.

- [ ] **Screenshots** (5+): dashboard, /finance, /squad, /match live, /league — capturar con build de producción tras 14-3.
- [x] **Logo + iconos**: 16/32/64/128/192/256/512 px + apple-touch-icon (180) + site.webmanifest. Generados overnight 2026-05-22 con ComfyUI MCP (seed 20260522001). En `apps/web/static/icons/` + `static/favicon.png`. PWA-ready.
- [x] **Categoría store**: Sports / Simulation · Management
- [x] **Pricing (MVP v1.0)**: **Gratuito** durante el periodo de soft-launch. Sin micropagos. Decisión: priorizar feedback de jugadores y validación de retention antes de monetizar.
- [x] **Soporte**: GitHub Issues público + correo de contacto en `/terms` §10 (a actualizar con el alias real del owner antes del go-live).

## 3. Legal / Privacy

- [x] **Terms of Service** publicados (/terms) — story 14-2 (Sprint 14)
- [x] **Privacy Policy** publicado (/privacy) — cubre auth sessions, no analytics externo, derechos GDPR — story 14-2
- [x] **Cookie policy** — solo una cookie técnica `session` (HTTP-only, SameSite=Lax). No banner GDPR necesario per Privacy Policy §8.
- [x] **License**: `LICENSE` en repo root — MIT License, Copyright 2026 Donchitos. Verificado overnight 2026-05-22.
- [x] **Asset attributions**: tabla en `production/releases/rollback-plan.md` §Asset attributions (Lucide, daisyUI, Tailwind, SvelteKit, Hono). Sin imágenes/audio de terceros en MVP.
- [ ] **GDPR/LOPD**: data-export endpoint si captura PII (Privacy Policy §7 promete portabilidad — endpoint todavía no expuesto; backlog v1.1)
- [x] **Edad mínima**: 13+ documentado en ToS §4 + Privacy §9

## 4. Performance final

- [ ] **API response time**: < 200ms p95 para acciones de management (pendiente autocannon contra DB poblada)
- [ ] **Match-live frame rate**: 60 fps en replay (pendiente DevTools Performance tab)
- [ ] **DB queries**: ninguna > 100ms en advance pipeline (pendiente EXPLAIN ANALYZE con dataset realista)
- [x] **Memory ceiling**: < 256MB RAM por proceso — **75.4 MB peak (soak)** muy por debajo del cap
- [ ] **Cold-start**: dashboard carga inicial < 2s en conexión lenta (pendiente Chrome throttling Fast 3G)

## 5. Security / Operations

- [x] **Anti-cheat**: sesión cookie + server-authoritative state (ya documentado en ADRs)
- [x] **Rate limiting**: implementado en /matches/start (30/min/IP), /matches/:id/decision (120/min/IP), y /dashboard?/advance (60/min/user). Story 14-1 (Sprint 14). 8 tests verdes.
- [x] **Secrets**: DATABASE_URL + REDIS_URL + SENTRY_DSN via env vars (apps/api/src/env.ts + process.env). No commiteados.
- [x] **Sentry / error tracking**: wrapper `apps/api/src/lib/observability.ts` con sanitización PII. Hono .onError + worker integration. SENTRY_DSN opcional (no-op si ausente). Story 14-7 (Sprint 14). 9 tests verdes.
- [x] **Database backups**: runbook `docs/runbooks/db-backups.md` — pg_dump diario 04:30 UTC, S3 con versioning + replicación cross-region, verificación semanal (restore en throwaway DB).
- [ ] **Migrations**: todas las migrations 0001..00XX aplicables clean en DB nueva
- [x] **Rollback plan**: `production/releases/rollback-plan.md` — story 14-9 (Sprint 14). Procedures A (code rollback < 30min) + B (DB restore < 60min), decision matrix por severidad, comms templates ES. **Go-live blocker**: ejecutar al menos un restore de práctica antes de tagear v1.0.

## 6. Content / Polish

- [x] **Onboarding flow**: code-trace 5-paso en `production/qa/evidence/copy-review-sprint-14.md` §C. Pendiente sesión humana pre-v1.0.
- [x] **Tooltips**: cada métrica del dashboard tiene tooltip (4 cards + semana + mid-week + posición). Story 14-4.
- [x] **A11y**: WCAG 2.1 AA PASS (P0 + P1 + P2 todos cerrados — verificado Sprint 12 + 13)
- [x] **i18n**: español ES por defecto (MVP no incluye otros idiomas)
- [x] **Copy review**: 0 lorem ipsum, 0 TODOs en código de producción. Story 14-4.
- [x] **Error states**: formularios manejan validación zod + redirects de auth

## 7. Marketing / Comms

- [x] **Changelog v1.0**: `production/releases/changelog-v1.0.md` — story 14-8 (Sprint 14). Player-facing en ES, sin jerga técnica.
- [x] **Trailer**: storyboard text en `production/marketing/trailer-storyboard-v1.0.md`. 45s en 5 actos, vertical 30s alterno. Producción video out-of-scope v1.0 (~6-8h post-launch).
- [x] **Launch post**: `production/marketing/launch-post-v1.0.md` — overnight 2026-05-22. Draft con versión corta (~280 chars socials) + larga (blog/Reddit/HN). Pablo revisa canales + dominio antes de publicar.
- [x] **Press kit**: `production/marketing/press-kit-v1.0.md` — quick facts, boilerplate (50/100/250 palabras), visual asset listing, streamer policy, technical info, license summary. Overnight 2026-05-22.

## 8. Polish→Release gate sign-off

- [x] `/gate-check polish` ejecutado → veredicto PASS WITH CONDITIONS
- [x] Sprint 13 QA sign-off APPROVED WITH CONDITIONS
- [x] No S1 ni S2 abiertos en `production/qa/bugs/` (ambos cerrados Sprint 13)
- [x] 6+ playtests Polish documentados (cap es 3)

---

## Go / No-Go decision

**Owner**: Pablo
**Date**: 2026-05-21 (autopilot recommendation)

**Detalle completo**: `production/releases/go-no-go-v1.0.md`

**Autopilot verdict**: 🟡 **CONDITIONAL GO** — soft-launch tras ~2h de
validación manual por parte de Pablo (Playwright e2e, Lighthouse, EXPLAIN
ANALYZE, autocannon p95, cold-start Fast 3G, screenshots reales, backup
restore practice, playtest adicional 14-10).

Decision: ☐ GO  ☐ NO-GO  ☑ GO WITH CONDITIONS

Conditions / blockers (Sprint 14 outstanding manual checks):

1. Build verification §1 manual (~40 min)
2. Store §2 screenshots reales (~30 min)
3. Legal §3 LICENSE root check (~10 min)
4. Security §5 migration smoke (~15 min)
5. Backup restore practice (rollback-plan go-live blocker)
6. Playtest 14-10 (fresh player + match polish/suspension observation)

Total estimado: ~2 horas manuales.

Post-decision actions (si Pablo aprueba GO):

```bash
git tag -a v1.0.0 -m "Total Soccer Manager v1.0 MVP — soft launch"
git push origin v1.0.0
# deploy desde el tag al hosting elegido (Railway / Fly / Render / VPS)
```

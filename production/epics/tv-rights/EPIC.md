# Epic: Derechos de Televisión

> **Layer**: Feature
> **GDD**: `design/gdd/tv-rights.md`
> **Architecture Module**: `apps/api/src/modules/tv-rights/` *(nuevo — añadir a architecture.md al crear el ADR de implementación)*
> **Status**: ✅ **Ready** — ADR-019 (TV Rights Implementation Contract) escrito 2026-05-20. Ejecutar `/create-stories tv-rights`.
> **Control Manifest**: 2026-05-19
> **GDD Approved**: 2026-05-20 (R7 — 54 ACs)

## Overview

El sistema de derechos de televisión convierte el ingreso TV semanal de una
constante plana (`economy.md §F2`) en una **decisión activa de posicionamiento**
del club. Cada temporada, en la pretemporada (semana 0), un evento STOP
`tv_auction` presenta al manager entre 1 y 3 ofertas según su división,
reputación y escrutinio mediático. El manager elige tier (LOCAL / REGIONAL /
NACIONAL) y duración (anual o multi-año), firmando un contrato que fija el
ingreso semanal para toda la temporada. Cada tier acumula o reduce
`corruption_exposure` en el tick semanal (F-TV3); superar
`TV_SCANDAL_THRESHOLD = 60` cancela el contrato activo y genera un evento
STOP `tv_midseason_offer` de reemplazo al 70% (si quedan ≥ 3 semanas). El
rechazo total de una subasta otorga `fan_loyalty +10`, que amplifica
`fan_attendance_effective` en el cálculo de matchday revenue (F-TV4).
NACIONAL maximiza ingresos pero acumula escrutinio agresivamente (+57.0/temporada);
LOCAL es el único tier que reduce corrupción (-19.0/temporada).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-005: WorldState persistence | `tv_contract` y `fan_loyalty` son parte del WorldState; escritura append-only + snapshot. | LOW |
| ADR-008: World clock + event loop | `tv_auction` y `tv_midseason_offer` son eventos STOP; el tick semanal aplica F-TV3 antes del cascade | LOW |
| ADR-014: Financial Flow | TV revenue reemplaza constante plana en cashflow semanal; `getTVRightsWeekly()` deprecated | LOW |
| ADR-015: Special Event Decision Schema | `tv_auction` y `tv_midseason_offer` son `PlayerDecisionPayload` tipados; resolver tipado exhaustivo | LOW |
| **ADR-019**: TV Rights Implementation Contract | ✅ **Accepted** 2026-05-20 — OQ-TV-04 resuelto. Cubre: `tv_contracts` tabla Drizzle; `fan_loyalty` columna en managers; `roundCorruption()` precision helper; dos sub-fases TV en `advance()`; `POST /api/tv/sign` transacción atómica; unique partial index; `applyTVCorruptionDelta()` función pura exportada; `TVAuctionPayload` + `TVMidseasonOfferPayload` variants ADR-015. | LOW |

## GDD Requirements (TR-IDs pendientes de registro)

> ⚠️ El GDD fue aprobado (R7, 2026-05-20) después del architecture-review (2026-05-16).
> No existen TR-IDs en `tr-registry.yaml` para tv-rights. Los TR-IDs deben registrarse
> al crear ADR-019 — los stories los referenciarán como `TR-TVR-001` … `TR-TVR-012`.

| TR-ID (pendiente) | Requirement | ADR Coverage |
|---|---|---|
| TR-TVR-001 | Schema `tv_contract`: tier, duration_seasons∈{1,2,3}, season_in_contract, weekly_rate_eur_k `numeric(10,2)`, division_at_signing; FSM NONE→ACTIVE→CANCELLED/EXPIRED→NONE; `fan_loyalty` `integer` cap 50 en manager record | ADR-005 ✅ / ADR-019 ⚠️ |
| TR-TVR-002 | F-TV1: `Math.round(TV_BASE_CENTS[tier] × DIVISION_MULTIPLIER_CENTS[div] × DURATION_MULTIPLIER_CENTS[dur] / 10000) / 100`; guards RangeError para division∉{D1,D2}, duration∉{1,2,3}, combinaciones ilegales → HTTP 400 | ADR-019 ⚠️ |
| TR-TVR-003 | `tv_auction` STOP event (scheduled_week=0) en season_start; unlock rules: LOCAL siempre, REGIONAL si D2 pos≤10 OR rep≥2 OR D1 actual, NACIONAL si D1 actual OR rep≥4; bloqueado si corruption_exposure≥60; T1 = solo LOCAL | ADR-008 ✅ / ADR-015 ✅ |
| TR-TVR-004 | F-TV3 delta semanal: LOCAL=-0.5, REGIONAL=+0.5, NACIONAL=+1.5; clamp [0, CORRUPTION_MAX=100]; Tick Order 8-step (TV delta → threshold TV → revenue → cascade inyecta → threshold post-cascade); external_delta truncado a numeric(5,2) antes paso 7 | ADR-008 ✅ / ADR-019 ⚠️ |
| TR-TVR-005 | F-TV2 `tv_midseason_offer`: STOP, tier=TIER_BELOW[cancelled], rate al 70%, duration_seasons=1; solo si semana≤35; guard idempotente COUNT=1 por season | ADR-008 ✅ / ADR-015 ✅ |
| TR-TVR-006 | Multi-año rollover: season_in_contract += 1 en season_end si season_in_contract < duration_seasons; sin tv_auction; tarifa inmutable (division_at_signing); cancelación anula años restantes; ⚠️ REGIONAL 2yr: indicador de riesgo si corruption≥22 | ADR-005 ✅ |
| TR-TVR-007 | F-TV4 fan_loyalty: rechazo tv_auction y tv_midseason_offer → fan_loyalty += 10 (cap 50); fan_attendance_effective = min(1.0, fan_attendance × (1 + fan_loyalty × 0.005)); BREAKING CHANGE: consumers de fan_attendance en matchday revenue aplican F-TV4 | ADR-014 ✅ / ADR-019 ⚠️ |
| TR-TVR-008 | XP a financial_acumen: +10 XP al firmar REGIONAL, +25 XP al firmar NACIONAL; sin XP para LOCAL ni rechazo | ADR-010 ✅ |
| TR-TVR-009 | Cashflow semanal: tv_weekly_eur_k = contract.weekly_rate_eur_k si ACTIVE, 0 en cualquier otro estado; eliminar getTVRightsWeekly() + TV_RIGHTS_SEGUNDA/TV_RIGHTS_PRIMERA | ADR-014 ✅ |
| TR-TVR-010 | TV_SCANDAL_THRESHOLD=60 cancellation: threshold_crossed_upward_tv (paso 3) o threshold_crossed_upward_cascade (paso 7); revenue del tick: 0 si F-TV3 cancel, preservado si cascade cancel (asimetría intencional) | ADR-008 ✅ / ADR-019 ⚠️ |
| TR-TVR-011 | UI en /finance: panel contrato activo; lista de ofertas con tier+duración+tarifa+delta_corruption; indicadores ⚠️ NACIONAL 3yr (corruption>0) y REGIONAL 2yr (corruption≥22); tv_midseason_offer muestra tier+tarifa al 70%+semanas restantes | ADR-012 ✅ / ADR-017 ✅ |
| TR-TVR-012 | POST /api/tv/sign: valida combinaciones ilegales (HTTP 400), rechaza doble firma (HTTP 409), calcula F-TV1, crea contrato ACTIVE; atómico: resolución evento + creación contrato en una transacción DB | ADR-019 ⚠️ |

**ADR-019 Accepted 2026-05-20** — todos los TR-IDs desbloqueados. Todas las stories pueden iniciarse tras `/create-stories tv-rights`.

## Engine Risk

**LOW** — TypeScript server-side con Drizzle + BullMQ. Todos los patrones
base (STOP events, tick pipeline, cascade integration, transacciones Drizzle,
Hono endpoints) están verificados en epics anteriores. El tick order de 8 pasos
es aritmética pura + comparaciones de precisión fija — sin APIs de engine nuevas.

## Definition of Done

- **ADR-019** (TV Rights Implementation Contract) escrito y Accepted
- `tr-registry.yaml` actualizado con TR-TVR-001 … TR-TVR-012
- `docs/architecture/architecture.md` Feature layer table actualizado con `apps/api/src/modules/tv-rights/`
- `apps/api/src/modules/tv-rights/` implementado con:
  - Schema Drizzle: `tv_contracts` table + `fan_loyalty` column en `managers`
  - `TVRightsRepo`: `findActiveContract()`, `createContract()`, `cancelContract()`, `rolloverContract()`
  - `TVAuctionService`: `generateAuction()` (unlock rules), `signContract()` (F-TV1 + HTTP 400/409 guards)
  - `TVTickService`: `applyWeeklyDelta()` (F-TV3, 8-step Tick Order, idempotente)
  - `TVMidseasonService`: `generateMidseasonOffer()` (F-TV2, TIER_BELOW, guard idempotente)
  - `TVRolloverService`: `processSeasonEnd()` (multi-año rollover), `processSeasonStart()` (FSM reset)
  - F-TV4 aplicado en matchday revenue (economy module — BREAKING CHANGE documentado)
  - `getTVRightsWeekly()` deprecado + constantes TV_RIGHTS_SEGUNDA/TV_RIGHTS_PRIMERA eliminadas
- `apps/web/src/routes/finance/` panel de contrato activo + indicadores ⚠️ REGIONAL 2yr / NACIONAL 3yr
- `POST /api/tv/sign` + `POST /api/tv/reject` endpoints bajo la misma autenticación de sesión
- Todos los 54 ACs (`AC-TV-01` … `AC-TV-54`) verificados (test o evidencia manual)
- 80%+ cobertura de test para lógica de negocio en `packages/shared/src/sim/tv-rights/`
- Regression: `getTVRightsWeekly()` eliminado sin romper tests de economy

## Dependencies

- **Upstream blockers**: ADR-019 ⚠️ (BLOCKING antes de código); economy epic ✅ (cashflow semanal); cascade-engine epic ✅ (tick pipeline, thresholdCrossings); event-system epic ✅ (STOP events); manager-rpg epic ✅ (manager_reputation + financial_acumen XP); league-system epic ✅ (current_division + prev_season_final_position)
- **Downstream consumers**: economy module (F-TV4 BREAKING CHANGE — matchday revenue consumer); cascade-engine (TV_SCANDAL_THRESHOLD como nuevo threshold node); hud-ui (indicadores ⚠️ en /finance)
- **BREAKING CHANGES heredadas del GDD**: (1) `economy.md §F2` reemplazado — eliminar constante plana; (2) `league-system.md §F6` deprecated (AC-LGS-18/19) — eliminar getTVRightsWeekly(); (3) F-TV4 modifica `fan_attendance` consumer en matchday revenue

## Stories

| # | Story | Type | Status | Tests | ADR |
|---|-------|------|--------|-------|-----|
| 001 | [tv_contracts Schema + TVRightsRepo](story-001-schema-repo.md) | Integration | Code Complete | DB tests pending live DB | ADR-019 |
| 002 | [F-TV1 Rate Calculation + Guards](story-002-f-tv1-rate-calculation.md) | Logic | ✅ Done | 26/26 ✅ | ADR-019 |
| 003 | [tv_auction Generation + Unlock Rules](story-003-tv-auction-generation.md) | Logic | ✅ Done | 19/19 ✅ | ADR-008/ADR-015 |
| 004 | [POST /api/tv/sign + Reject Endpoints](story-004-sign-reject-endpoints.md) | Integration | Code Complete | HTTP tests pending live DB | ADR-019 |
| 005 | [applyTVCorruptionDelta + Threshold Predicates](story-005-corruption-delta-predicates.md) | Logic | ✅ Done | 27/27 ✅ | ADR-019 |
| 006 | [Tick Order Integration (applyTVPrePhase + applyTVPostPhase)](story-006-tick-order-integration.md) | Integration | Code Complete | 16/16 pure ✅; pipeline tests pending live DB | ADR-019/ADR-008 |
| 007 | [F-TV2 Midseason Offer + Cancellation Events](story-007-midseason-offer.md) | Logic | ✅ Done | 12/12 ✅ | ADR-019/ADR-015 |
| 008 | [Multi-Year Rollover + Season Lifecycle](story-008-season-lifecycle-rollover.md) | Integration | Code Complete | Integration tests pending live DB | ADR-019/ADR-005 |
| 009 | [Cashflow Integration + Economy Breaking Change](story-009-cashflow-integration.md) | Integration | Code Complete (additive) | computeWeeklyRevenue updated; BREAKING CHANGE deletion deferred | ADR-014/ADR-019 |
| 010 | [F-TV4 fan_loyalty → fan_attendance_effective](story-010-fan-loyalty-f-tv4.md) | Logic | ✅ Done | 16/16 ✅ | ADR-019 |
| 011 | [/finance UI — TV Rights Panel + Event Display](story-011-finance-ui.md) | UI | ✅ Done | Manual verification via /finance/tv-rights | ADR-012/ADR-017 |

**Implementation Summary (2026-05-20 — autonomous session)**:
- 6 Logic stories ✅ Done with 116 unit tests passing (002, 003, 005, 006-pure, 007, 010)
- 4 Integration stories code-complete (001 schema, 004 endpoints, 006 backend, 008 rollover, 009 cashflow)
- 1 UI story ✅ Done — UX spec authored (`design/ux/tv-rights.md`) + `/finance/tv-rights` route implemented with active contract panel, `tv_auction` modal with offers/duration/risk flags, `tv_midseason_offer` modal, rejection confirm dialog
- **935 total project tests passing** (919 shared + 15 api + 1 web; no regressions)
- Migration `0019_shallow_captain_marvel.sql` generated + partial UNIQUE index for idempotent event generation
- Hono routes `/tv/*` registered in `apps/api/src/server.ts` + smoke tests for the factory
- Economy `computeWeeklyRevenue` accepts new `tvWeeklyEurKOverride` parameter
- F-TV4 wired into `computeMatchDayRevenue` (OQ-TV-03 resolved — economy §F3 path with clamp at `stadiumCapacity`)
- `fan_loyalty` + `corruption_exposure` registered in `design/registry/entities.yaml` as cross-system entities
- Legacy `getTVRightsWeekly()` / `TV_RIGHTS_*` constants kept temporarily with `@deprecated` — full deletion deferred to follow-up commit when all callers migrate
- Integration tests with live Postgres still pending (smoke-level coverage in place for routes + service exports)

## Next Step

1. ~~Crear **ADR-019**~~ ✅ Aceptado 2026-05-20
2. ~~Registrar TR-TVR-001…012~~ ✅ Registrados 2026-05-20
3. Actualizar `architecture.md` Feature layer table con `apps/api/src/modules/tv-rights/` (pendiente)
4. ~~`/create-stories tv-rights`~~ ✅ 11 stories creadas 2026-05-20
5. **Siguiente**: `/story-readiness production/epics/tv-rights/story-001-schema-repo.md` → `/dev-story`

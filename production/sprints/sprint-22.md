---
Sprint: 22
Name: "Stadium Upgrades v1.1 — schema + catalog + F1-F6 + service + routes + UI"
Status: Ready
Window: 2026-05-25 → 2026-06-05
Capacity: ~9 productive days (Polish phase — solo dev, lean mode)
Review Mode: lean
Phase: Production (v1.1)
---

# Sprint 22 — 2026-05-25 to 2026-06-05

## Sprint Goal

Entregar el epic completo `stadium-upgrades` v1.1: schema + catalog + 6 fórmulas (F1-F6) + service/FSM + Hono routes + integración World Clock + UI /stadium con realtime feedback. Sustituye el stop-gap visual (commit `6edca6b`) por el sistema completo basado en F1 (`stadium_visual_level: 0..9`) computado desde los 3 tracks-Estadio.

## Capacity

- Total days: 11 working days (2026-05-25 lunes → 2026-06-05 viernes, 2 fines de semana)
- Buffer (20%): 2.2 días reservados para imprevistos
- Available: ~9 días productivos
- **Match**: epic estimate 9 días → 1 sprint scoped correcto.

## Tasks

### Must Have (Critical Path)

| ID   | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|------|------|-------------|-----------|--------------|---------------------|
| 22-1 | Drizzle schema + migration 0025 | web-backend-specialist | 0.5 | — | Tabla `stadium_upgrade_items` + 3 WorldState fields. Migration 0025 aplica limpio sobre 0024. AC-SU-32. |
| 22-2 | Catalog YAML + Zod loader | web-backend-specialist | 1.0 | 22-1 | `design/data/stadium-upgrades-catalog.yaml` con ~40 items × 5 tracks. Loader Zod-validated en boot. AC-SU-01/02/03. |
| 22-3 | Formulas F1 (visual_level) + F3 (infrastructure) | web-backend-specialist | 1.0 | 22-2 | Pure functions en `packages/shared/src/sim/stadium/`. F1 monotónica + integer 0..9. F3 supersedes city-progression §4.2. AC-SU-09/10/11/16/17/31. Tests propiedad. |
| 22-4 | Formulas F2 + F4 + F5 + F6 | web-backend-specialist | 1.0 | 22-3 | F2 duration, F4 cost (BASE × TRACK_MULT), F5 capacity tiered, F6 tier-up doble gate. AC-SU-12-15, 18-22, 23-26. |
| 22-5 | Service + FSM + transactions | web-backend-specialist | 1.5 | 22-1..22-4 | 6-state FSM server-authoritative. Cancellation refund classification (extraordinary). Race condition guard. AC-SU-04-08, 36, 39, 40. |
| 22-6 | Hono routes + Zod validation + 4xx | web-backend-specialist | 1.0 | 22-5 | POST `/api/stadium/upgrades/{id}/queue`, `/cancel`, GET `/catalog`, `/status`. Errores 4xx tipados. AC-SU-33. |
| 22-7 | World Clock integration + tier-up doble gate hook | web-backend-specialist | 1.0 | 22-5, 22-6 | Per-week tick decrementa `InProgress` counter. Al `Complete`, persist + emit Socket.IO event. Hook tier-up gate F6. AC-SU-30, 32, 34. |
| 22-8 | SvelteKit /stadium UI + Socket.IO realtime | web-frontend-specialist | 2.0 | 22-6, 22-7 | Catálogo navegable, queue UI, in-progress countdown, realtime sprite update al `Complete`. Reemplaza stop-gap commit `6edca6b`. AC-SU-34, 37, 38. |

**Total Must Have: 9 días → cabe en 9 días disponibles.**

### Should Have

(Vacío — sprint mantiene foco estricto en epic.)

### Nice to Have

| ID     | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|--------|------|-------------|-----------|--------------|---------------------|
| 22-NH1 | Registry update (~15 new entries) | game-designer | 0.5 | 22-4 done | `design/registry/entities.yaml` con constantes nuevas de F1-F6 (BANKRUPTCY_VISUAL_DECAY, TIER_UP_THRESHOLDS, etc.). Si hay buffer, se cierra antes de Sprint 23. |
| 22-NH2 | Propagation: economy.md F-revenue-flow | game-designer | 0.3 | 22-5 done | Clasificar `stadium_refund_extraordinary` en economy GDD §F-revenue-flow. |

## Carryover from Previous Sprint

Ninguno. Sprint 14 (release prep v1.0) está cerrado por separado; v1.1 arranca limpio.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| F1 weighted-sum tuning produce visual jumps no-monotónicos | Media | Alto (rompe AC-SU-11) | Property tests obligatorios día 1 de 22-3; consultar systems-designer si falla. |
| Migration 0025 conflicto con cambios live en DB local | Baja | Alto (rollback necesario) | Drizzle `--push --dry-run` antes de aplicar; backup pre-migration. |
| FSM race condition con queue=1 + concurrent POST | Media | Medio | Partial unique index ya en spec (AC-SU-40); test integración con 2 promises paralelas. |
| Sprite stop-gap commit `6edca6b` deja artifacts en 22-8 refactor | Baja | Bajo | Story 22-8 explícitamente refactoriza `tierToVisualLevel()` a `data.stadium.visualLevel` real. |
| UI realtime sprite swap fade-in feel inconsistente (AC-SU-34) | Media | Bajo | Solo polish — diferir a Sprint 25 (polish + cross-epic) si causa drag. |

## Dependencies on External Factors

- Pablo decisión sobre **OQ-SU-8** (T4 city-tier prereq) — actualmente NO; revalidar post-playtest en Sprint 25.
- Stadium-upgrades-008 depende del symlink `apps/web/static/sprites/` (ya existente desde overnight 2026-05-22).

## Definition of Done for this Sprint

- [ ] All Must Have tasks (22-1..22-8) completed
- [ ] All tasks pass acceptance criteria (AC-SU-01..40 verified)
- [ ] QA plan exists (`production/qa/qa-plan-sprint-22.md`)
- [ ] All Logic stories have passing unit tests (property tests for F1-F6)
- [ ] Integration stories have live-DB tests (FSM transitions + World Clock tick)
- [ ] Smoke check passed (`/smoke-check sprint`)
- [ ] QA sign-off report: APPROVED or APPROVED WITH CONDITIONS
- [ ] No S1 or S2 bugs in delivered features
- [ ] Design documents updated for any deviations
- [ ] Code reviewed and merged
- [ ] Story 22-8 reemplaza el stop-gap del commit `6edca6b`

## QA Plan

QA Plan: TBD — run `/qa-plan sprint` after writing this file.

## Scope check

Si se agregan stories más allá del epic original (`production/epics/stadium-upgrades/EPIC.md` — 8 stories), correr `/scope-check stadium-upgrades` antes de implementar para detectar scope creep.

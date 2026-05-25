---
Sprint: 25
Name: "v1.2 kickoff — cerrar deuda v1.1 (offers + AI rotation + free agents + drift cleanup + GDPR)"
Status: Ready
Window: 2026-05-26 → 2026-06-09
Capacity: ~9 productive days (solo dev, lean mode)
Review Mode: lean
Phase: v1.2 / Production
---

# Sprint 25 — 2026-05-26 to 2026-06-09

## Sprint Goal

Cerrar TODA la deuda v1.1 acumulada en Sprints 22-24 + tech debt heredado, sentando base limpia para template generator system en Sprint 26. Sprint focal en backend wire-ups + offer/AI flows pendientes.

## Context

Pablo decisión 2026-05-25: drop completo de llama.cpp (ADRs 025-028 → Superseded en Sprint 26). v1.2 redux:
1. Sprint 25 — close deuda v1.1 (este sprint)
2. Sprint 26 — template generator system (replaces Pillar D LLM)
3. Sprint 27 — canvas museum + asset pipeline + v1.2 polish + tag

## Capacity

- Total days: 11 working days (2026-05-26 mar → 2026-06-09 mar)
- Buffer (20%): 2.2 días imprevistos
- Available: ~9 días productivos
- Match con must-have: 7.0 días → cabe.

## Tasks

### Must Have (Critical Path)

| ID   | Task | Owner | Est. d | Dependencies | Acceptance Criteria |
|------|------|-------|--------|--------------|---------------------|
| 25-1 | Drizzle snapshot drift reset | web-backend | 0.5 | — | `pnpm db:generate` produce snapshot limpio sin renames espurios; próximas migrations sin hand-authoring forzado |
| 25-2 | Free-agent contractStatus en players + migration 0030 | web-backend | 0.5 | 25-1 | Enum `'in_contract' \| 'expiring' \| 'free_agent'`; backfill 'in_contract'; tests |
| 25-3 | Market windows lifecycle (transfer_window_open event) | web-backend | 1.0 | 25-2 | Event-system dispara `transfer_window_open` × 2 por temporada; world clock event hook; tests |
| 25-4 | Offer service (free agent + AI auction wire-up) | web-backend | 1.5 | 25-2, 25-3 | POST /api/scouting/offer + F2/F3 wire-up + persist + tests |
| 25-5 | AI club rotation BullMQ worker | web-backend | 1.5 | 25-3, 25-4 | Worker corre mini-loop F6 deterministicamente; idempotente; tests |
| 25-6 | Counter-offer UI flow en /scouting | web-frontend | 1.0 | 25-4 | Modal aceptar/rechazar/nueva-oferta + form action |
| 25-7 | `tickAllClubsWithActiveUpgrades` wire-up al advance pipeline | web-backend | 0.5 | — | Cron o trigger cross-app; verifica integración apps/web ↔ apps/api |
| 25-8 | GDPR data-export endpoint (`/me/export`) | web-backend | 0.5 | — | GET /me/export devuelve JSON completo del user; tests |

**Total Must Have: 7.0 días → cabe en 9 disponibles.**

### Should Have

| ID    | Task | Owner | Est. d | AC |
|-------|------|-------|--------|-----|
| 25-9  | Saved searches en scouting | web-fullstack | 1.0 | UI permite guardar combos de filtros con nombre; persiste |
| 25-10 | Asset hygiene + MANIFEST update | art-director | 0.5 | MANIFEST.md refleja estado actual; deprecated marcados |

### Nice to Have

| ID      | Task | Owner | Est. d | AC |
|---------|------|-------|--------|-----|
| 25-NH1  | `.mcp.json` password rotation a env vars | security | 0.2 | Sin password plaintext en .mcp.json |
| 25-NH2  | Squad detail panel: traits + nationality | web-frontend | 0.3 | Roster muestra traits + bandera |

## Carryover from Previous Sprint

Ninguno explícito. Sprint 24 cerró 5/7 stories; las 2 deferred (24-5 offer, 24-6 AI rotation) entran como 25-4 + 25-5 con scope completo.

## Risks

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Drizzle snapshot reset rompe migrations futuras | Media | Alto | Backup `drizzle/meta/_journal.json` antes; valida round-trip; rollback plan |
| Cross-app boundary apps/web ↔ apps/api en 25-7 sigue siendo deuda | Media | Bajo | Wire-up vía fetch o BullMQ; decisión final pospuesta a Sprint 26+ |
| AI rotation worker requiere event-system maduro | Baja | Alto | Pre-condition check en 25-3; fallback a polling si event-driven no listo |
| Free-agent migration 0030 conflicto con drift cleanup | Baja | Medio | 25-1 ANTES de 25-2; secuencial obligatorio |

## Definition of Done

- [ ] 8 Must Have stories completas
- [ ] /scouting con offer flow + counter-offer modal funcional
- [ ] AI rotation worker BullMQ + tests deterministas
- [ ] `pnpm db:generate` funciona limpio
- [ ] Free agents visibles en /scouting
- [ ] Tests 1487 → 1550+ con nuevos
- [ ] Sin regresiones
- [ ] Code reviewed + merged

## QA Plan

TBD — run `/qa-plan sprint` after writing.

## Scope check

Si se agregan stories más allá del scope original, correr `/scope-check` antes de implementar.

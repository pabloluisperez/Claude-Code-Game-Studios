---
Sprint: 26
Name: "Template Generator System — Pillar D sin LLM (narrativa determinista)"
Status: DRAFT (awaiting approval)
Window: 2026-06-10 → 2026-06-23 (tentative)
Capacity: ~9 productive days (solo dev + piloto-automático)
Review Mode: lean
Phase: v1.2 / Production
---

# Sprint 26 — Template Generator System (DRAFT)

## Sprint Goal

Convertir el motor narrativo scaffolded (`packages/shared/src/sim/narrative/`) en
un **sistema completo de generación de texto determinista** que sustituye
definitivamente al Pillar D (IA Narrativa Local / llama.cpp). Al cierre: toda la
"voz del mundo" (prensa, llamadas, rumores, finanzas, junta) es texto generado
por plantillas + vocabulario multi-eje, sin dependencia LLM, 100% testeable.

## Context

Decisión Pablo 2026-05-25: drop de llama.cpp (ADRs 025-028 → Superseded). El
motor ya existe en esqueleto (`render()` + slots + vocab + 5 grupos). Sprint 26
lo completa: cobertura de eventos, variedad de vocab, endurecimiento + seguridad,
integración y formalización del ADR. Diseño: `design/gdd/narrative-generator.md`.

## Capacity

- Total: 11 working days (2026-06-10 → 2026-06-23)
- Buffer (20%): ~2.2 días
- Available: ~9 días productivos
- Must-have match: ~7.5 días → cabe.

## Tasks

### Must Have (Critical Path)

| ID   | Task | Owner | Est. d | Deps | Acceptance Criteria |
|------|------|-------|--------|------|---------------------|
| 26-1 | ADR: Deterministic Narrative Generator (supersede 025-028) | tech-director | 0.5 | — | ADR nuevo; 025-028 marcados Superseded con rationale + trade-offs + alternativas rechazadas |
| 26-2 | GDD review + sign-off `narrative-generator.md` | narrative-director | 0.5 | 26-1 | GDD aprobado (8 secciones completas); ya redactado en draft |
| 26-3 | Engine hardening — `requiredVars` manifest + slot-coverage guard + fallback | web-backend | 1.0 | 26-2 | Cada grupo declara `requiredVars`; `render()` nunca filtra `{...}` para callers in-contract; test de cobertura de slots |
| 26-4 | Vocab expansion — ≥8 entradas/categoría + categorías nuevas + denylist test | writer | 1.0 | 26-2 | Variedad ≥200 renders/bucket/surface; test sin profanidad + sin categoría vacía |
| 26-5 | Library expansion — rumor, transfer-window, sponsor renewal, contract renewal, promo/relegation, board confidence | writer + web-backend | 1.5 | 26-3, 26-4 | Grupos nuevos con `when` por bucket tonal + variants + requiredVars; render tests |
| 26-6 | Wire derby press + rumores al advance pipeline (fixture rivalry flag) | web-backend | 1.0 | 26-5 | `fixtures.derby`/rivalry flag; derby press + rumores emitidos (gate seeded); integración sin regresión |
| 26-7 | Audit + migrar strings narrativos hardcoded a engine | web-backend + web-frontend | 1.0 | 26-5 | Sin strings narrativos hardcoded en advance-orchestrator ni copys de evento donde haya grupo |
| 26-8 | Narrative QA — golden snapshots + determinismo + cobertura full library | qa | 1.0 | 26-3..26-7 | Tests: determinismo, slot-coverage, denylist, enumeración de variedad — todos verdes |

**Total Must Have: ~7.5 días → cabe en 9.**

### Should Have

| ID    | Task | Est. d | AC |
|-------|------|--------|-----|
| 26-9  | Staff-message generator unificado bajo narrative engine | 1.0 | `generateStaffMessages`/ambient migran al engine o comparten vocab |
| 26-10 | Locale scaffolding (estructura para futuro multi-idioma) | 0.5 | library+vocab parametrizables por locale sin tocar engine |

### Nice to Have

| ID      | Task | Est. d | AC |
|---------|------|--------|-----|
| 26-NH1  | Rumor feed UI en /inbox (sección "Rumores") | 0.5 | Rumores agrupados, marcables como leídos |

## Carryover from Sprint 25

- 25-9 Saved searches (should-have, deferred) — reconsiderar aquí o Sprint 27.
- 25-NH1 `.mcp.json` security — ✅ hecho como retro action A1.
- Retro actions A2-A5 (typecheck CI, schema guard, dead-code, yaml) — ✅ hechos.

## Risks

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Variedad insuficiente → texto repetitivo (la crítica clave del approach sin LLM) | Media | Alto | Vocab ≥8/categoría + test de enumeración que mide renders distintos/bucket; subir variants si <200 |
| Slots rotos en producción (`{var}` literal visible) | Media | Medio | `requiredVars` manifest + guard test (26-3) bloquea en CI |
| `fixtures.derby` flag requiere datos de rivalidades que no existen | Media | Bajo | Empezar con heurística (mismo `city` o liga) si no hay tabla de rivalidades |
| Tono inadecuado (línea alegre tras goleada en contra) | Baja | Alto | `when` por bucket tonal estricto + golden snapshots (26-8) |

## Definition of Done

- [ ] ADR 025-028 Superseded + ADR nuevo aprobado
- [ ] GDD `narrative-generator.md` aprobado
- [ ] Engine con slot-coverage garantizado + fallback
- [ ] Vocab ≥8/categoría; ≥200 renders/bucket/surface
- [ ] 6 grupos de plantillas nuevos cubriendo las superficies objetivo
- [ ] Derby press + rumores integrados en advance pipeline
- [ ] 0 strings narrativos hardcoded donde haya grupo
- [ ] Tests narrativos verdes (determinismo + cobertura + seguridad)
- [ ] `pnpm typecheck` limpio; sin regresiones (shared/api/web)

## QA Plan

TBD — `/qa-plan sprint` tras aprobación. Eje: tests deterministas en
`packages/shared/tests/narrative/`.

## Scope check

Sprint focal en `packages/shared/src/sim/narrative/` + integración en
advance-orchestrator. Cambio de schema mínimo (flag opcional en `fixtures`).

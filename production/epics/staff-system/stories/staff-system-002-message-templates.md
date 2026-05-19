---
Story: STAFF-SYSTEM-002
Status: Complete
Type: Logic
Governing ADR: ADR-009
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/staff-system/templates.test.ts
---

# Story 002: Message Template Resolver

> **Epic**: staff-system | **Layer**: Core | **Type**: Logic | **Estimate**: 1d

## Scope
Template key format: `{role}:{nodeId}:{direction}:{tier}` (control-manifest Required).
- `resolveMessageTemplate(args: { role, nodeId, direction, tier }): string | null`
- Templates stored in a static map; missing keys return null (silent fail).

Example templates:
- `coach:team_fitness:dropping:1` — "El equipo está cansado, jefe."
- `coach:team_fitness:dropping:3` — "El equipo está al límite. Recomiendo reducir la intensidad del entrenamiento esta semana o veremos lesiones."

## ACs
- [ ] All NodeIds from cascade-engine catalog have templates
- [ ] Tier-3 messages are 2-3× longer than tier-1
- [ ] Resolver pure (no DB)

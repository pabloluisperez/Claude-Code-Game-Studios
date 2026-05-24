---
name: project-cascada-fc
description: Contexto del proyecto Cascada FC — stack, pilares MVP, sistema crítico de cascadas
metadata:
  type: project
---

Cascada FC es un soccer manager + manager-RPG en web stack (SvelteKit + Hono + Drizzle + Socket.IO). MVP = 2 pilares (Soccer Manager + Manager-RPG, DOM-only). El Motor de Cascadas (`cascade-engine.md`) es el sistema más crítico: función pura `evaluateTick()` que evalúa un WorldState (Map<NodeId, number>) semanalmente con 19 nodos y 19 cadenas de cascada.

**Why:** La arquitectura está definida en ADR-003 (topología), ADR-005 (persistencia JSONB), ADR-008 (world clock), ADR-009 (staff messages).

**How to apply:** Cuando se trabaje con tests del cascade-engine, el framework es Vitest 2, los tests viven en `tests/unit/sim/`, y deben ser funciones puras sin acceso a DB ni Math.random() directo (usar seeded RNG vía SimContext).

---
name: project-cascada-fc
description: Core project context for Cascada FC — stack, scope, current phase, QA role
metadata:
  type: project
---

Cascada FC is a soccer manager + manager-RPG web game built on a TypeScript full-stack monorepo (SvelteKit 2 + Hono 4 + Drizzle ORM + Socket.IO 4 + BullMQ). The simulation engine lives in `packages/shared/src/sim/` and is pure TypeScript with seeded PRNG — no side effects, fully deterministic.

**Why:** MVP is 2 pillars (Soccer Manager + Manager-RPG, DOM-only). Pre-Production gate is in progress as of 2026-05-19; `stage.txt` still reads "Concept" until gate formally passes.

**How to apply:** All sim engine stories are Type: Logic and require automated unit tests in `packages/shared/tests/`. Minimum coverage gate is 80% for `packages/shared/src/sim/`. Determinism tests (same seed → same output every run) are required for every simulation system.

**Active sprint as of 2026-05-19**: Sprint 01 COMPLETE. Sprint 02 not yet planned.

**Epics**: 9 epics all in Ready status. Priority order: cascade-engine → match-simulation → league-system → economy + player-management → manager-rpg + staff-system + event-system → hud-ui.

See [[sprint01-signoff]] for Sprint 01 QA results.

---
Story: MANAGER-RPG-005
Status: Ready
Type: Integration
Governing ADR: ADR-010
Control Manifest: 2026-05-19
Test Evidence: tests/integration/manager-rpg/routes.test.ts
---

# Story 005: Manager-RPG Service + Hono Routes

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `apps/api/src/modules/manager-rpg/service.ts`: orchestrate XP application + skill allocation
- Routes:
  - `GET /manager-rpg/:playthroughId` — current state + unlocked skills
  - `POST /manager-rpg/:playthroughId/allocate-skill` — call Story 003's allocateSkill
  - `GET /manager-rpg/:playthroughId/career-log` — last N career events

## ACs
- [ ] Routes Zod-validated
- [ ] Session-auth gates playthrough access

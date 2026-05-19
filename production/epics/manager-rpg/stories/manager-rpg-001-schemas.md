---
Story: MANAGER-RPG-001
Status: Ready
Type: Integration
Governing ADR: ADR-010 (Manager RPG progression)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/manager-rpg/db-schema.test.ts
---

# Story 001: Manager State + Skill Tree Schemas

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `manager_state` table: id, playthrough_id FK, level int, xp int, skill_points_available int, skill_points_spent int, created_at, updated_at
- `manager_skills` table: id, manager_state_id FK, skill_id text, tier int (1-3), unlocked_week int
- `manager_career_events` table: id, manager_state_id FK, event_type text, payload jsonb, week int

## ACs
- [ ] 3 tables defined; migration applied
- [ ] UNIQUE (manager_state_id, skill_id) on manager_skills
- [ ] FK cascade on playthrough delete

## Dependencies
- Upstream: playthroughs ✓

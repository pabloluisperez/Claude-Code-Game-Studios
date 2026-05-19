---
Story: MANAGER-RPG-003
Status: Ready
Type: Integration
Governing ADR: ADR-010 (atomic skill allocation — control-manifest Core layer Required)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/manager-rpg/skill-allocation.test.ts
---

# Story 003: Atomic Skill Point Allocation

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `allocateSkill(tx, managerStateId, skillId, tier)`:
  - SELECT FOR UPDATE manager_state
  - Verify available >= 1 (or cost in higher tiers)
  - Decrement available, increment spent
  - INSERT manager_skills row (UNIQUE constraint prevents double-unlock)
  - COMMIT — atomic

## ACs
- [ ] Concurrent allocation attempts: only one succeeds (UNIQUE + FOR UPDATE)
- [ ] available < cost → rejected with 'insufficient_skill_points'
- [ ] Tier 1: cost 1; Tier 2: cost 2; Tier 3: cost 3

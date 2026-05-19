---
Story: HUD-UI-008
Status: Ready
Type: UI
Governing ADR: ADR-017
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-008-manager-evidence.md
---

# Story 008: Manager Profile + Skill Tree UI

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1d

## Scope
Route `/manager`:
- Profile card: level + XP progress bar + skill_points_available
- Skill tree (4 branches × 3 tiers per ADR-010)
- Click to allocate skill — confirmation modal, deduct skill_point
- Career event log (last 20)

## ACs
- [ ] Level + XP from GET /manager-rpg/:playthroughId
- [ ] Skill allocation triggers POST /manager-rpg/:playthroughId/allocate-skill
- [ ] Tier-2 skills require tier-1 unlocked first; tier-3 requires tier-2

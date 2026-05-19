---
Story: MANAGER-RPG-002
Status: Ready
Type: Logic
Governing ADR: ADR-010
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/manager-rpg/xp.test.ts
---

# Story 002: XP Curve + Level-Up

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5d

## Scope
File `packages/shared/src/sim/manager-rpg/xp.ts`:
- `xpRequiredForLevel(level)` — quadratic curve per ADR-010 constants
- `applyXp(currentLevel, currentXp, gain)` — returns `{ newLevel, newXp, leveledUp, skillPointsGranted }`

## ACs
- [ ] Per-level XP costs match ADR-010 curve (e.g., L1→2 = 100, L2→3 = 250, L3→4 = 450)
- [ ] Level-up grants +1 skill_point per level
- [ ] Pure function

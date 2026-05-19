---
Story: MANAGER-RPG-006
Status: Complete
Type: Logic
Governing ADR: ADR-010
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/manager-rpg/perks.test.ts
---

# Story 006: Tier-3 Perks Effects (Should Have)

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Logic | **Estimate**: 1d

## Scope
Tier-3 perks apply passive modifiers (consumed by other systems):
- `gestion_eficiente`: staff costs -10%
- `contracts_master`: contract renewal counter-offer threshold relaxed (1.7× vs 1.5× default)
- `crisis_specialist`: at_risk → crisis transition delayed by 1 week
- `scout_director`: scouting_points decay -25% (cascade C9a)

`computeManagerModifiers(unlockedSkills)` returns the modifier bundle other systems read.

## ACs
- [ ] Each tier-3 perk produces the documented modifier
- [ ] Modifiers default to 1.0× / 0 when perk not unlocked
- [ ] Pure function

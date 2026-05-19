---
Story: ECONOMY-003
Status: Ready
Type: Logic
GDD Requirement: TR-ECO-003 (weekly costs: payroll + staff + catering + scouting + maintenance)
Governing ADR: ADR-014
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/economy/costs.test.ts
---

# Story 003: Weekly Cost Calculator

> **Epic**: economy | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5d

## Scope
File `packages/shared/src/sim/economy/costs.ts`:
- `computePayroll(players[])` — sum of player.salaryEurK for active players
- `computeStaffCosts(staffMembers[])` per staff-system payroll
- Sum catering + scouting + maintenance budgets from WorldState
- `computeWeeklyCosts(args)` returns totals + breakdown

## ACs
- [ ] Payroll excludes players with `availability='leaving'` after season end
- [ ] All costs in €K, integer
- [ ] Pure function

## Dependencies
- Pure

---
Story: HUD-UI-003
Status: Ready
Type: UI
Governing ADR: ADR-017
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-003-squad-evidence.md
---

# Story 003: Squad Panel + Player Detail

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1.5d

## Scope
Route `/squad`:
- TanStack Table: 25 players, columns (name, position, skill, form, morale, fitness, status, salary)
- Filter by position / availability
- Click row → modal with full PlayerStats + contract + recent ratings sparkline

## ACs
- [ ] Table sortable on all numeric columns
- [ ] Status badges (available/injured/suspended)
- [ ] Modal shows last 5 match ratings + projected form trajectory
- [ ] Contract end week + renewal warning chip if ≤8 weeks

---
Story: HUD-UI-002
Status: Complete
Type: UI
Governing ADR: ADR-017
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 002: Dashboard Page

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1.5d

## Scope
Route `/dashboard`:
- Hero card: club name + league position + next match
- 4-up grid: balance, fan_momentum, team_fitness, squad_available_pct (cascade nodes)
- Staff messages feed (latest 5)
- "Advance week" button (calls POST /advance)

## ACs
- [ ] WorldState values displayed with bars + colors (red <30, yellow 30-70, green >70)
- [ ] Staff messages tier-3 visually distinguished (longer text, different style)
- [ ] Advance button disabled during pending STOP events

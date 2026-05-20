---
Story: HUD-UI-005
Status: Complete
Type: UI
Governing ADR: ADR-017
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 005: League Table + Fixture List

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1d

## Scope
Route `/league`:
- Division tabs (D1 / D2)
- Standings table (position, club, played, w/d/l, goals, points)
- Player's club row highlighted
- Fixture list panel: next 5 + last 5 matches with scores

## ACs
- [ ] Standings sorted per Story 003 of league-system (points → gd → gf → h2h → derby)
- [ ] Derby fixtures visually flagged
- [ ] Promotion/relegation zones highlighted (top 3 / bottom 3)

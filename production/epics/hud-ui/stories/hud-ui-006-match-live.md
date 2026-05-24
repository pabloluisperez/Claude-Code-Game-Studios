---
Story: HUD-UI-006
Status: Complete
Type: UI
Governing ADR: ADR-017, ADR-018 (Socket.IO match:event)
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 006: Match-Live View

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 2d

## Scope
Route `/match/:matchSessionId`:
- Top: scoreboard (home X - Y away, current minute)
- Event feed (chronological): goals, cards, injuries, subs
- Pause modal at substitution_window / injury_pause showing decision options
- "Continue with default" button + countdown timer (24h default)
- PixiJS panel: simplified pitch visualization (optional MVP)

## ACs
- [ ] Socket.IO `/match` namespace subscription
- [ ] Pause modal blocks UI until decision submitted or timeout reached
- [ ] Replay/resume on page reload (read MatchSessionSnapshot)
- [ ] AC-MATCH-30 — substitution_window events NOT shown in feed (internal-only)

---
Story: HUD-UI-004
Status: Complete
Type: UI
Governing ADR: ADR-017, ADR-014 (server-authoritative replaces slice's client proxy)
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 004: Finance Panel

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1d

## Scope
Route `/finance`:
- Balance + cashflow chart (last 4 weeks)
- Revenue breakdown (tickets, sponsors, TV) — pie chart
- Cost breakdown (payroll, staff, catering, scouting, maintenance) — bars
- Bankruptcy state banner (healthy/at_risk/crisis/bankrupt)
- Sponsor list (active + cancelled)

## ACs
- [ ] Reads from `GET /economy/:playthroughId/state` (NOT client-side proxy)
- [ ] Bankruptcy banner color-coded
- [ ] Cancelled sponsors show reason (scandal/expired)

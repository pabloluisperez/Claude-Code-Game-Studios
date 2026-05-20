---
Story: HUD-UI-007
Status: Complete
Type: UI
Governing ADR: ADR-017, ADR-008 (calendar event UX)
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 007: Calendar Panel + Event Decisions

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1.5d

## Scope
Route `/calendar`:
- 38-week season timeline with events marked by type (match, transfer window, sponsor offer, scandal, season end)
- Pending STOP events listed at top with decision modals
- ADVISORY events show as info chips
- Click event → decision UI (per ADR-015 payload variant)

## ACs
- [ ] Pending STOP events block "advance week" globally
- [ ] Decision submission via POST /events/:id/decide
- [ ] Per-variant decision UI: SponsorOffer (accept/decline/negotiate), TransferOffer (accept/decline/counter), ContractRenewal, Scandal

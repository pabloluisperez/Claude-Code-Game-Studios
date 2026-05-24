---
Story: HUD-UI-001
Status: Complete
Type: UI
Governing ADR: ADR-017 (UI shell), ADR-018 (Socket.IO client)
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 001: SvelteKit Layout Shell

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1d

## Scope
- `apps/web/src/routes/+layout.svelte`: top bar (club + balance + week) + sidebar nav + main slot
- Authenticated route guard via hooks.server.ts
- Dark theme default (DaisyUI + Tailwind)
- Mobile breakpoint at 768px (sidebar collapses to hamburger)

## ACs
- [ ] Layout renders on all pages including login redirect
- [ ] Top bar shows current week + balance (real-time via Socket.IO)
- [ ] Sidebar nav links: Dashboard, Squad, Finance, League, Calendar, Settings
- [ ] 375px mobile width usable (PWA budget per technical-preferences.md)

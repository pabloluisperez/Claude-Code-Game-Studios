---
name: project-staff-ux-gaps
description: UX gaps identified in staff-system.md adversarial review — 4 BLOCKERs and 3 WARNINGs pending before staff-inbox and staff-management epics can be written
metadata:
  type: project
---

Adversarial UX review of staff-system.md completed 2026-05-18. Four BLOCKERs identified:

1. **Tier unlock notification** — No attention vector from reputation level-up to staff market. NOTIFY feed line does not mention staff. Player may not discover tier-2 candidates for weeks.
2. **Inbox IA** — Missing spec: message history depth (API only loads since current-1 week), URGENT/ROUTINE separation in aggregated vs per-employee views, temporal separators, empty state per employee.
3. **Vacante risk communication** — VACANT badge does not communicate active information loss. No spec for contextual warning when vacancy coincides with upcoming match.
4. **Mobile 375px staff management panel** — 3 action buttons (Formar / Despedir / Ver mensajes) cannot fit in a single row at 44px tap targets. No mobile layout spec exists. Requires `/ux-design staff-management` before epics.

Three WARNINGs:
5. Decision flow Vía A vs B — No comparison panel spec; player must calculate alternative cost themselves.
6. Market rotation timing — When next rotation occurs is unspecified in UI. Creates ambiguous wait with no resolution horizon.
7. "Ver mensajes recientes" button — Ambiguous message count ("recientes"), back navigation from candidates sub-panel, shared read-state with main Staff panel view.

**Why:** These gaps block the UI team from writing implementation stories.
**How to apply:** Do not approve staff-inbox or staff-management epics until BLOCKERs 1, 2, 4, 6 are resolved via UX spec or GDD amendment. `/ux-design staff-inbox` and `/ux-design staff-management` should address all 7 items.

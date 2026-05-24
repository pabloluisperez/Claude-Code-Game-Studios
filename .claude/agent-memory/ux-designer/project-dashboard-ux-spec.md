---
name: project-dashboard-ux-spec
description: Dashboard UX spec completed 2026-05-19 — resolves OQ-HUD-01 and OQ-HUD-08 (Dashboard only); 6 new OQs flagged
metadata:
  type: project
---

Dashboard UX spec written to `design/ux/dashboard.md` (2026-05-19).

**Resolves**:
- OQ-HUD-01 (Dashboard KPIs + hierarchy) — fully resolved
- OQ-HUD-08 (empty states) — resolved for Dashboard only; Plantilla + Staff empty states remain open

**Key decisions made in this spec**:
- Training intensity uses 5-bucket ButtonGroup with labels; OQ-DASH-01 flags whether to keep slice vernacular ("Descanso/Brutal") or use more literal labels ("Muy bajo/Muy alto") — needs Pablo confirmation
- Ticket price uses UnitSlider in €, step 5€, market=10€ default, max from ADR-014
- All numeric metrics formatted via domain-language formatters (ADR-017 buckets confirmed normative)
- Onboarding banner strips raw metric values (fan_momentum=35 removed) — Pilar 1 constraint
- `hasMatchThisWeek` and `stadiumCapacity` flagged as fields that must exist in production GameState (OQ-DASH-03, OQ-DASH-04)

**Why:** Unblocks Dashboard implementation sprint. dashboard.md must be cited by all stories in the Dashboard epic.
**How to apply:** Before Dashboard epic stories are written, confirm OQ-DASH-01 (label vernacular) and OQ-DASH-03/04 (GameState fields) with Pablo and backend-specialist respectively.

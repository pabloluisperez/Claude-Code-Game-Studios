---
Story: HUD-UI-008
Status: Complete
Type: UI
Governing ADR: ADR-010 (manager-RPG XP-driven model), ADR-017 (UI shell)
Control Manifest: 2026-05-19
Test Evidence: production/qa/evidence/hud-ui-audit-2026-05-21.md
---

# Story 008: Manager Profile (read-only XP-driven model)

> **Epic**: hud-ui | **Layer**: Presentation | **Type**: UI | **Estimate**: 1d
>
> **2026-05-21 amendment**: original ACs described a clickable allocation UI with skill_points spending and tier prereqs. Those came from a slice-era prototype pattern (slice day-13: `POST /api/advance/allocate-skill`). **Per ADR-010**, manager skills level up automatically via XP grants from in-game events (match wins, contract renewals, etc.) — never via manual allocation. Slice patterns do not migrate to production per `.claude/rules/prototype-code.md`. ACs below rewritten to align with ADR-010 and the actual production implementation. See `production/qa/evidence/hud-ui-audit-2026-05-21.md` §HUD-UI-008 for the conflict-resolution detail.

## Scope
Route `/manager`:
- Profile card: each of the 5 ADR-010 skills (tactical_insight, man_management, financial_acumen, scouting_network, reputation) with current level + XP toward next level
- Per-skill educational text: what the skill affects in-game + how to gain XP for it
- `reputation.level` exposes the P1↔P3 gate: derived `maxHirableStaffQuality` value visible (the staff-tier ceiling per ADR-010)
- Read-only — no clickable allocation (XP-driven per ADR-010; granted inline during advance())

## ACs
- [x] Level + XP loaded from `GET /api/manager-rpg/:playthroughId` (server-side via +page.server.ts; falls back to L1/0xp defaults when no playthrough)
- [x] All 5 ADR-010 skills displayed with current level + XP-to-next-level
- [x] Each skill has a plain-language `howToLevel` line describing its XP source(s)
- [x] `reputation.level` → `maxHirableStaffQuality` derived value displayed (P1↔P3 resolution per ADR-010 — L4-5→T3, L3→T2, else T1)
- [x] No manual allocation UI (positively confirmed — would violate ADR-010)

## Out of scope (deferred)
- Career event log (last 20) — would duplicate /inbox messages; recommend leaving the inbox as the canonical timeline.

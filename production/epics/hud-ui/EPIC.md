# Epic: HUD + UI

> **Layer**: Presentation
> **GDD**: `design/gdd/hud-ui.md`
> **Architecture Module**: `apps/web/`
> **Status**: ✅ **Ready** (ADR-017 + ADR-018 Accepted 2026-05-19). Still recommended: 5 UX specs + art-bible MVP addendum before sprint, but story authoring can begin.
> **Stories**: Not yet created — run `/create-stories hud-ui`
> **Control Manifest**: 2026-05-19

## Overview

The HUD + UI epic delivers the **DOM-only MVP visual layer** of Cascada FC:
6 main routes (Dashboard, Calendar, Squad/Standings, Staff inbox, Finance,
Manager), the live match playback at `/match`, the end-of-month resolution
modal, the FSM (advancing / paused / match_decision_pending / modal_blocking),
the staff-message inbox with tier-aware preview slots, the calendar with
announced events, and the HUD strip with status header + tab bar. ADR-012
locked DOM-only for MVP (canvas frontier deferred to v1.1+). The slice
validated the entire layout pattern + 6 routes with svelte-check 0 errors —
production rewrites cleanly per OQ-HUD-09 (input taxonomy), OQ-HUD-10 (domain
labels), OQ-HUD-11 (pixel-art match feedback), OQ-HUD-12 (modal pacing),
OQ-HUD-13 (playback speed).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-012: UI Architecture (DOM ↔ Canvas Frontier) | MVP uses only DOM side of the frontier; canvas reserved for v1.1+ | LOW |
| ADR-017: UI Input Control Taxonomy | 3 control families (button group / unit slider / item select); domain-language formatter library in packages/shared; translation at UI↔API boundary | HIGH (Svelte 5 runes — verified by slice) |
| ADR-018: Match Event Visual Feedback Library | Pixel-art sprite-in-DOM contract (sprites under apps/web/static/sprites/match/); dramatic event pacing (teaser → 10s modal → optional VAR); Socket.IO match feed; 1s=1 in-game min default + ×1/×3/×10 + skip-to-end; confetti at z-index 110 (no backdrop blur) | MEDIUM (Socket.IO 4 + CSS stacking) |

## GDD Requirements

`design/gdd/hud-ui.md` AC-HUD-01 through AC-HUD-29 (R3 lean PASS 2026-05-18 +
13 OQs).

Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-08 | 6 main panels: Dashboard, Calendario, Plantilla, Staff, Finanzas, Manager | ADR-012 ✅ |
| AC-09 – AC-11 | HUD strip semantics; mobile 375px breakpoint | ADR-012 + GDD ✅ |
| AC-12 – AC-13 | Match decision UI (substitution_window, injury_pause) — snapshot semantics | ADR-013 ✅ |
| AC-14 – AC-18 | FSM transitions: advancing → match_decision_pending → modal_blocking | ADR-008 + GDD ✅ |
| AC-19 – AC-23 | Staff inbox preview slots; deep equality; combined states | GDD ✅ |
| AC-24 – AC-26 | Bottom-sheet CSS (TAB_BAR_HEIGHT_PX=56); rAF→expired handoff | GDD ✅ |
| AC-27 – AC-29 | Empty states for all panels (OQ-HUD-08 blocking — must resolve in /ux-design) | OQ-HUD-08 ⚠ |

**Open OQs from playtest** (must resolve before this epic's stories ship):

- OQ-HUD-08 (empty states) — blocking, requires `/ux-design`
- OQ-HUD-09 (input control taxonomy) → ADR-017 ⚠
- OQ-HUD-10 (domain-language formatting) → ADR-017 ⚠
- OQ-HUD-11 (pixel-art match feedback) → ADR-018 ⚠
- OQ-HUD-12 (modal pacing rules) → ADR-018 ⚠
- OQ-HUD-13 (playback speed + fast-forward) → ADR-018 ⚠

Plus: art-bible MVP-scope addendum required per Art Director gate-check
feedback (slice's REPORT.md notes this).

## Engine Risk

**HIGH** — Svelte 5 runes have post-cutoff quirks. Verified by slice:
- `bind:value` on `<input>` has issues with `$state` runes — use `value`
  + `oninput` event handlers (control-manifest forbidden pattern)
- Local variable named `state` collides with `$state` rune detection — rename
- `$derived` narrowing requires `$derived.by()` for some patterns

Plus the `svelte-range-slider-pips@4.1.1` library introduced in slice for the
price slider — pending ADR-017 inclusion to formalize.

## Definition of Done

- ADR-017 + ADR-018 written and Accepted
- `/ux-design` specs delivered for: Dashboard, Calendar, Squad, Staff, Finance,
  Manager, Match-live, Onboarding, End-of-month (OQ-HUD-08 resolved)
- Art bible MVP-scope addendum written (AD gate-check concern)
- 6 SvelteKit routes + the live match route + end-of-month route in
  `apps/web/src/routes/`
- Status header + tab bar in `+layout.svelte` with mobile 375px breakpoint
- All API calls go through `apps/web/src/lib/api.ts` (control-manifest rule)
- All numeric metrics route through `apps/web/src/lib/format.ts` (per OQ-HUD-10
  domain-language buckets) — slice has the helper as a starting template
- Input controls use the ADR-017 taxonomy: button group / € slider / select
  (no naked 0-100 sliders for player-facing decisions)
- Live match flow: teaser banner → modal with 10s countdown + close button → optional VAR
  theater → confetti for own goals (NOT blurred — control-manifest rule)
- Playback speed toggle (×1, ×3, ×10) + skip-to-end (per OQ-HUD-13)
- Pixel-art sprite-in-DOM library for ball-hits-net / stretcher / sliding-tackle
  (per OQ-HUD-11; not canvas)
- svelte-check 0 errors target (slice has 0/260 — production must keep this)
- Axe-core in CI for WCAG 2.1 AA per `design/ux/accessibility-requirements.md`
- Lighthouse score ≥ 90 (control-manifest performance budget)
- Playwright e2e for the golden path: signup → club creation → 1 month → end-of-month

## Dependencies

- **Upstream blockers**: ADR-017, ADR-018, OQ-HUD-08 resolution via /ux-design,
  art-bible MVP addendum, all Foundation + Core + Feature epics (since the UI
  reads from all their endpoints)
- **Downstream consumers**: None (Presentation is the top layer)

## Next Step

ADR-017 and ADR-018 are Accepted as of 2026-05-19. Story authoring can begin.

Recommended sequence for full sprint-readiness (parallel work):
1. Run `/ux-design Dashboard`, `/ux-design Match-live`, `/ux-design Manager`,
   `/ux-design Staff-inbox`, `/ux-design End-of-month` (5 screens to resolve
   OQ-HUD-08 empty states)
2. Add MVP-scope addendum to `design/art/art-bible.md` (AD gate-check concern)
3. Run `/create-stories hud-ui`

Stories CAN be drafted in parallel with the UX specs — start with the
foundational stories (component library: `<ButtonGroup>`, `<UnitSlider>`,
`<ItemSelect>`, `<EventChoiceButtons>`, `<MatchEventSprite>`, `<Confetti>`)
which are spec'd in ADR-017/018 and don't need per-screen UX specs.

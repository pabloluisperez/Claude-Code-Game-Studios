# Visual Entity & Screen Inventory — Cascada FC MVP

> **Generated**: 2026-05-21 (autonomous overnight Path B closure)
> **Sources**: `design/gdd/*.md` (10 MVP GDDs) · `design/art/art-bible.md` · `design/ux/*.md` (5 UX specs) · `apps/web/src/routes/` (shipped routes)
> **MVP scope**: DOM-only (per `design/gdd/scope-mvp.md`); no PixiJS isometric pixel art in MVP, no AI narrative characters
> **Recommendation**: review and curate. Items marked `Needed` are referenced by GDDs but not yet visually specified; items marked `Shipped` are visible in the current SvelteKit routes.

## Notes on MVP visual scope

The MVP is **DOM-only**. The traditional "entities" of a game (character sprites, building tiles, particle effects) are deferred to v1.1+:
- Pillar 2 (Isometric World) → art-bible.md §1-6 (pixel-art entities) are **pre-investment**, not used in MVP
- Pillar 4 (AI Narrative) → no NPC character portraits in MVP

The MVP relies on:
- **Typography + semantic color** (art-bible.md §7 — the DOM visual spec)
- **DaisyUI components** for cards/modals/tables
- **Lucide icons** for state indicators
- **No custom sprites** for the MVP

So the inventory below focuses primarily on **UI Screens** and **HUD Elements** (the DOM-relevant categories), with a sparse Audio section.

## Entities

| # | Name | Type | Description | Source | Status |
|---|------|------|-------------|--------|--------|
| E-01 | Club | Domain entity | Backing record + name/colors/kit displayed in topbar + dashboard hero | `game-concept.md`, `league-system.md` | Shipped (DOM — kit colors stored in DB) |
| E-02 | Player | Domain entity | Squad panel rows + modal; skill/form/morale/fitness as data | `player-management.md` | Shipped (DOM tabular) |
| E-03 | Manager | Domain entity | Manager profile + skill cards | `manager-rpg.md`, `hud-ui.md` | Shipped (DOM cards) |
| E-04 | Staff member | Domain entity | Staff inbox sender names + tier badges | `staff-system.md` | Shipped (DOM inbox) |
| E-05 | Sponsor (TV/board/kit/press-room slots) | Domain entity | Sponsor lists on finance route with logo placeholder + name | `economy.md`, `tv-rights.md` | Shipped (text-only — no logos in MVP) |
| E-06 | TV channel offer card | UI element | LOCAL/REGIONAL/NACIONAL offer cards in /finance/tv-rights | `tv-rights.md`, `design/ux/tv-rights.md` | Shipped |
| E-07 | Match event (goal/card/sub) | Runtime entity | Event-feed entries in /match — emoji + text, no custom art | `match-simulation.md`, `design/ux/match-live.md` | Shipped |
| E-08 | Cascade node card | UI element | dashboard cascade-node displays (fan_momentum, team_fitness, etc.) | `cascade-engine.md`, `design/ux/dashboard.md` | Shipped |

## UI Screens

| # | Screen Name | Route | Description | Source | Status |
|---|-------------|-------|-------------|--------|--------|
| S-01 | Login | `/login` | Email/password auth — auth flow | (auth contract) | Shipped |
| S-02 | Signup | `/signup` | Account + club creation onboarding | (auth contract) | Shipped |
| S-03 | Game (intro / hub) | `/game` | Landing for the active playthrough | `hud-ui.md` | Shipped |
| S-04 | Dashboard | `/dashboard` | Cascade-node 4-up + staff messages + advance button | `design/ux/dashboard.md`, `hud-ui.md` | Shipped |
| S-05 | Squad | `/squad` | TanStack-style table + player modal | `player-management.md`, `hud-ui.md` | Shipped (plain `<table>` — see hud-ui audit) |
| S-06 | Finance | `/finance` | Cashflow + sponsor slots + bankruptcy banner | `economy.md`, `hud-ui.md` | Shipped |
| S-07 | Finance — TV rights | `/finance/tv-rights` | LOCAL/REGIONAL/NACIONAL offer cards + sign/reject UI | `design/ux/tv-rights.md` | Shipped |
| S-08 | League | `/league` | Standings table + fixture list + promotion/relegation zones | `league-system.md` | Shipped |
| S-09 | Calendar | `/calendar` | 38-week timeline + STOP-event decision modals + announcements | `event-system.md` | Shipped (announcement vs decision distinction added 2026-05-21) |
| S-10 | Inbox | `/inbox` | Staff messages timeline with unread/urgent badges | `staff-system.md` | Shipped |
| S-11 | Match-live | `/match/[matchSessionId]` | Animated event playback + pause modal at substitution_window | `design/ux/match-live.md` | Shipped |
| S-12 | Manager profile | `/manager` | 5 skill cards (XP-driven per ADR-010) + reputation gate | `manager-rpg.md`, `hud-ui.md` | Shipped (read-only; no manual allocation per ADR-010) |
| S-13 | Staff | `/staff` | Staff roster + tier ceilings + fire/hire/train actions | `staff-system.md` | Shipped |
| S-14 | Season end | `/season-end` | Month-loop resolution screen | (slice promotion) | Shipped |
| S-15 | Main menu / Settings | (none) | Not in MVP — no per-user settings beyond logout | `scope-mvp.md` | Out of MVP |

## HUD Elements

| # | Element | Description | Source | Status |
|---|---------|-------------|--------|--------|
| H-01 | Topbar — week + date | Current in-game week + dateDisplay | `design/ux/dashboard.md` | Shipped |
| H-02 | Topbar — balance | Color-tiered balance (red <0, yellow <50, neutral) | `hud-ui.md` (AC closed 2026-05-21) | Shipped |
| H-03 | Topbar — inbox indicator | Unread count badge with animate-pulse on >0 | `staff-system.md` | Shipped |
| H-04 | Sidebar — nav links with badges | Pending-STOP count on /calendar, unread-urgent on /dashboard | `event-system.md`, `hud-ui.md` | Shipped |
| H-05 | Advance week button | Gated by `pendingStops` count; disabled during STOP events | `event-system.md`, `cascade-engine.md` | Shipped |
| H-06 | Cascade-node card (fan_momentum, etc.) | Bar + color (red <30, yellow 30-70, green >70) | `cascade-engine.md` | Shipped |
| H-07 | Bankruptcy banner | Color-tiered (healthy/at_risk/crisis/bankrupt) per economy.md F5 | `economy.md` | Shipped |
| H-08 | Sponsor slot card (kit/boards/press_room) | Per-slot active + offer display | `economy.md` | Shipped |
| H-09 | Confirm modal (DaisyUI) | Used for sponsor decisions, skill allocation (deferred), and other STOP confirmations | `design/ux/interaction-patterns.md` | Shipped |
| H-10 | Threshold-crossing alert | Surfaces ThresholdCrossing BLOCKING events as banner + modal | `cascade-engine.md` AC-THR-* | Shipped (via /calendar STOP gating) |

## Audio

> **MVP audio scope**: minimal. No music or SFX shipped in MVP per scope-mvp.md (DOM-only sim management). Audio specifications are placeholders for v1.1+.

| # | Name | Type (SFX / Music / Ambient) | Description | Source | Status |
|---|------|------------------------------|-------------|--------|--------|
| A-01 | (deferred) | — | No audio assets in MVP | `scope-mvp.md` | Deferred to v1.1+ |

## What's NOT in this inventory (deferred to v1.1+)

- All isometric pixel-art entities from `design/art/art-bible.md` §1-6 (city tiles, building sprites, terrain) — pre-investment.
- PixiJS pitch visualization for `/match` — deferred per ADR-006.
- AI narrative character portraits — deferred per ADR-004.
- Logo / sponsor branding artwork — placeholder text only in MVP.
- Animated VFX (goal celebrations, card waves, injury impact) — DOM event list only.

## Next steps for Pablo

1. **Review and curate** this inventory — flag missing items, remove anything not actually MVP-relevant.
2. Per-entity asset specs are NOT needed for MVP (DOM-only). They become useful for v1.1+ when PixiJS + isometric assets enter scope.
3. If kit colors / club crests need any visual treatment beyond `kit_primary_color` / `kit_secondary_color` HEX values in DB: that's a v1.1+ scope expansion.

# Epic: Trophies & History (Museum reconversion of /city)

> **Layer**: Presentation (v1.1)
> **GDD**: `design/gdd/trophies-history.md`
> **Architecture Module**: `apps/api/src/modules/museum/` + `apps/web/src/routes/city/` (refactor) + `assets/sprites/city-hd/museum-*.png`
> **Status**: Ready (GDD drafted 2026-05-24, ADR-030 drafted, pending review)
> **Stories**: 6 stories ready below
> **Control Manifest**: 2026-05-19

## Overview

Trophies & History is the **museum + history layer** that reconverts the `/city` route from "gameplay city view" (now absorbed by stadium-upgrades.md) into "celebration of club achievements". It is **read-only** over WorldState — never writes. Sources: trophies from league-system, banners from match-simulation + league-system, hall of fame from player-management, financial milestones from economy, stadium history from stadium-upgrades. Renders via PixiJS as a barrio (exterior view of museum + stadium + manager office) with interior dolly to museum's 5 zones.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-030: /city Reconversion (NEW) | `/city` renders museum + barrio; museum interior is separate scene; read-only aggregator API; soft-deprecate city-progression | LOW |
| ADR-021: Canvas Rendering Pipeline | Reused for museum render | LOW |
| ADR-005: WorldState persistence | Read-only consumer | LOW |
| ADR-023: DOM-Canvas Event Router | Click → redirect pattern | LOW |
| ADR-024: Canvas A11y Fallback | `/city-text` DOM fallback required | LOW |

## GDD Requirements

Full ACs in `design/gdd/trophies-history.md §8` — AC-TH-01 through AC-TH-27.

| Category | Coverage | Notes |
|---|---|---|
| Route layout (barrio + museum interior) | AC-TH-01/02/03/04 | PixiJS scene swap |
| 5 categorías de objetos | AC-TH-05/08/10/11/12/13 | Aggregator API |
| Text contextual templated (v1.1) | AC-TH-14/15 | LLM deferred v1.2+ |
| Edge cases (museum vacío, scandal, manager change) | AC-TH-16/17/18/19/20/21 | Read-only invariant |
| Performance + A11y | AC-TH-22/23/24 | <800ms + LoD + DOM fallback |
| Determinismo + read-only | AC-TH-25/26 | Property tests |
| Cross-version | AC-TH-27 | LLM upgrade async |

## Engine Risk

LOW. Backend is pure read aggregator (no new state). Frontend is PixiJS scene + DOM interactions — re-uses ADR-021 pipeline. Main risk is art asset production (12-15 new sprites needed) — that's an art pipeline story, not engine risk.

## Stories

| # | Story | Type | Est. days | Dependencies |
|---|---|---|---|---|
| 001 | Backend aggregator API + read-only invariant | Integration | 1 | stadium-upgrades-006 (for /history endpoint) |
| 002 | Formulas + types (F1-F5) | Logic | 0.5 | none |
| 003 | Templated text generation (v1.1 ES) | Logic | 1 | 002 |
| 004 | SvelteKit /city route refactor (barrio scene) | UI | 1.5 | 001, ADR-021 confirmed |
| 005 | Museum interior scene (5 zones) | UI | 2 | 001, 002, 004 |
| 006 | A11y DOM fallback /city-text + tests | UI/A11y | 1 | 001, 005 |

**Total**: ~7 days. Plus separate art asset story (12-15 museum sprites) — runs parallel.

## Out of scope (deferred to v1.2+)

- LLM-generated narrative text (replace templates)
- NPC ambient in museum (visitor sprites)
- Easter eggs / hidden plaques
- Per-zone ambient music
- Screenshot mode (hide UI for capture)
- Full isometric city (the original city-progression.md scope) — superseded entirely

## Cross-system propagation pending

Track via `/propagate-design-change`:
- `hud-ui.md` sidebar: add "🏛 Museo" entry, redirect from `/city` if currently labeled "Ciudad"
- `league-system.md`: add reader entry — museum consumes trophy winners
- `match-simulation.md`: add reader entry — museum consumes legendary match flags
- `player-management.md`: add reader entry — museum consumes TOP_5 history + transfers
- `economy.md`: add reader entry — museum consumes balance history for milestones
- `narrative-ai.md`: v1.2+ consumer notation

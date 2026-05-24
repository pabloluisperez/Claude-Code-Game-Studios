# Epic: Stadium Upgrades

> **Layer**: Core (v1.1)
> **GDD**: `design/gdd/stadium-upgrades.md`
> **Architecture Module**: `apps/api/src/modules/stadium-upgrades/` + `packages/shared/src/sim/stadium/` + `packages/db/src/schema/stadium-upgrades.ts` + `apps/web/src/routes/stadium/`
> **Status**: Ready (GDD drafted 2026-05-24, ADR-029 drafted, pending review)
> **Stories**: 8 stories ready below
> **Control Manifest**: 2026-05-19 (last published — may need refresh on accept)

## Overview

Stadium Upgrades is the system that lets the manager invest profits into physical club facilities — gradas, pitch, services, training facility, youth academy. It is the active driver of city tier-up (city-progression's second gate) and the per-reforma visual feedback at `/stadium`. The system writes 3 new WorldState counters and computes 2 derived values; it integrates with economy (cost debit + refund), cascade-engine (NodeId deltas), match-simulation (capacity feed), staff-system (duration modifier), and manager-rpg (cost modifier). Catalog of ~40 items across 5 tracks × 4 levels × ~2 items, FSM with 6 states, queue of 1 active build, doble gate for city tier-up.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-029: Stadium Upgrades Module (NEW) | Module layout · Drizzle schema · API surface · World Clock integration · Cancellation refund classification | LOW |
| ADR-005: WorldState persistence | Adds 3 new counters to snapshot | LOW |
| ADR-008: World Clock + event loop | Reuses week-tick for `InProgress → Complete` countdown | LOW |
| ADR-014: Economy financial flow | Adds `stadium_refund_extraordinary` transaction category | LOW |
| ADR-013: Match session stateful pattern | Pattern reference for FSM + recoverability | LOW |

## GDD Requirements

Full ACs in `design/gdd/stadium-upgrades.md §8` — AC-SU-01 through AC-SU-40.

| Category | Coverage | Notes |
|---|---|---|
| Catalog (5 tracks × 40 items) | AC-SU-01/02/03 | YAML-driven, loaded at boot |
| FSM (6 states) | AC-SU-04/05/06/07/08 | Server-authoritative |
| F1 stadium_visual_level | AC-SU-09/10/11 | Monotonic property test |
| F2 duration_weeks | AC-SU-12/13/14/15 | Snapshot on InProgress |
| F3 infrastructure_level (supersedes city §4.2) | AC-SU-16/17 | Normalized weighted sum |
| F4 cost_of_item | AC-SU-18/19 | BASE × TRACK_MULTIPLIER |
| F5 stadium_capacity | AC-SU-20/21/22 | Tiered per-item, feeds match-sim |
| F6 tier-up gate | AC-SU-23/24/25/26 | Doble gate (métricas + reformas) |
| Bankruptcy edge cases | AC-SU-27/28/29 | Pause + visual decay |
| Event integration | AC-SU-30 | STADIUM_OFFER payload |
| Determinismo + persistencia | AC-SU-31/32 | Property + integration |
| UI integration | AC-SU-33/34 | /stadium realtime feedback |
| Performance + A11y | AC-SU-37/38 | <500ms + DOM fallback |
| Race condition + UX guard | AC-SU-36/40 | Partial unique index + warning |
| Refund classification | AC-SU-39 | Edge case on economy.md F-revenue-flow |

## Engine Risk

LOW. Standard Drizzle + Hono + BullMQ + SvelteKit stack. PixiJS integration in `/stadium` already exists for tier sprite display (HD sprites overnight 2026-05-22). New asset additions are catalog-driven, not engine-driven.

## Stories

| # | Story | Type | Est. days | Dependencies |
|---|---|---|---|---|
| 001 | Drizzle schema + migration 0025 | Logic | 0.5 | none |
| 002 | Catalog YAML + loader + Zod validation | Logic | 1 | 001 |
| 003 | Domain types + F1 + F3 formulas | Logic | 1 | 002 |
| 004 | F2 + F4 + F5 + F6 formulas | Logic | 1 | 003 |
| 005 | Service.ts + FSM + transactions | Logic | 1.5 | 001-004 |
| 006 | Hono routes + Zod validation + 4xx errors | Integration | 1 | 005 |
| 007 | World Clock tick integration + tier-up doble gate hook | Integration | 1 | 005-006 |
| 008 | SvelteKit /stadium UI + Socket.IO realtime feedback | UI | 2 | 006 |

**Total**: ~9 days. Single Sprint scoped.

## Out of scope (deferred to v1.2+)

- Parallel slots (queue > 1 active build)
- Per-club catalog customization (kit color in sprites)
- Subsidy event integration UX flow (event-system.md STADIUM_OFFER variant)
- LLM-generated text for completion staff messages (currently templated)

## Cross-system propagation pending

Track via `/propagate-design-change`:
- `economy.md` F-revenue-flow: classify `stadium_refund_extraordinary` (story 005 references)
- `cascade-engine.md` NodeId registry: 3 new writeable nodes (story 003 references)
- `match-simulation.md` fixture.capacity: source migration (story 004 references)
- `staff-system.md` Director de Instalaciones role + skill (deferred, soft dep)
- `manager-rpg.md` Skill "Construction" T3+ effect (deferred, soft dep)
- `design/registry/entities.yaml` ~15 new entries (post-Sprint update)

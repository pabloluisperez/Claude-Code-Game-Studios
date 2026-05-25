# Epic: Scouting & Transfer Market

> **Layer**: Feature (v1.1)
> **GDD**: `design/gdd/scouting-market.md`
> **Architecture Module**: `apps/api/src/modules/scouting-market/` + `packages/shared/src/sim/scouting/` + `packages/db/src/schema/scouting-market.ts` + `apps/web/src/routes/scouting/`
> **Status**: Ready (GDD drafted 2026-05-24, ADR-031 drafted)
> **Stories**: 7 stories ready below
> **Control Manifest**: 2026-05-19

## Overview

Scouting & Transfer Market is the v1.1 system that resolves OQ-PM-03 (market presentation by scouting tier) and OQ-PM-04 (AI club rotation). It implements 4 tiers of visibility (T0/T1/T2/T3) per player per manager per window, an auction system for AI club players (counter-offer flow), a deterministic AI club mini-loop that runs at every transfer_window_open event, and a new Scout Director staff role. Reads `scouting_points` from cascade-engine (C9a/C9b, unchanged), `scouting_network_level` from manager-rpg (unchanged), and existing player-management transfer formulas. Writes 5 new tables + completed transfers.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-031: Scouting Market Module (NEW) | Schema · API · World Clock integration · AI club rotation worker · Server-authoritative visibility · Counter-offer auction | LOW |
| ADR-015: Special Event Decision Schema | transfer_window_open/close drives lifecycle | LOW |
| ADR-016: Player Lifecycle | Source of transfer_value formulas | LOW |
| ADR-008: World Clock | Scout delay countdown + window event triggers | LOW |
| ADR-005: WorldState persistence | 5 new tables | LOW |

## GDD Requirements

Full ACs in `design/gdd/scouting-market.md §8` — AC-SCM-01 through AC-SCM-30.

| Category | Coverage | Notes |
|---|---|---|
| Visibility tiers (T0-T3) | AC-SCM-01/02/03/04/05/26 | Server-authoritative field stripping |
| Pool size by manager-RPG | AC-SCM-13/14 | F5 formula |
| Scout actions (cost + delay) | AC-SCM-06/07/20/21 | F4 + edge case refund |
| Free agent acceptance | AC-SCM-08 | F2 with desperation factor |
| AI club auction | AC-SCM-09/10/11/12 | F3 with counter-offer |
| AI club rotation | AC-SCM-15/16/17/18/22 | F6 deterministic mini-loop |
| Transfer execution | AC-SCM-19/23 | Cascade event emission |
| UI search + filters | AC-SCM-24/25/27/28 | Saved searches |
| Performance + A11y | AC-SCM-28/29 | <800ms + screen reader |
| Race condition foundation | AC-SCM-30 | MMO-ready |

## Engine Risk

LOW. Standard Drizzle + Hono + BullMQ + SvelteKit stack. AI rotation job is the most complex piece — but deterministic via seeded RNG and follows the existing world clock advance pipeline pattern (similar to stadium-upgrades-007).

## Stories

| # | Story | Type | Est. days | Dependencies |
|---|---|---|---|---|
| 001 | Drizzle schema + migration 0027 (5 tables) | Logic | 0.5 | none |
| 002 | Domain types + F1 visibility + F5 pool size | Logic | 1 | 001 |
| 003 | F2 + F3 + F4 + F6 formulas | Logic | 1 | 002 |
| 004 | Scout actions service + scout delay countdown | Logic | 1.5 | 002, 003 |
| 005 | Transfer offer service (free agent + AI auction) | Logic | 1.5 | 003, 004 |
| 006 | AI club rotation worker + BullMQ trigger on window open | Integration | 1.5 | 003, 005 |
| 007 | Hono routes + SvelteKit /scouting UI + Socket.IO | UI | 2 | 004-006 |

**Total**: ~9 days. Single Sprint scoped.

## Out of scope (deferred to v1.2+)

- Agentes de jugadores (intermediary layer)
- LLM-generated scout reports (narrative-ai.md)
- Regional scout assignments (current model = single global scouting_budget)
- AI club scouts (AI uses direct pool valuation, no scout-mediated info)
- Free agents from manager's own cantera (OQ-SCM-8)

## Cross-system propagation pending

Track via `/propagate-design-change`:
- `player-management.md` §7 + §9: resolve OQ-PM-03 + OQ-PM-04 → "scouting-market.md owns market presentation + AI rotation"
- `staff-system.md`: add Scout Director T1/T2/T3 role
- `manager-rpg.md`: cross-ref `scouting_network_level` F5 owner shift
- `cascade-engine.md`: add reader (scouting-market consumes scouting_points)
- `event-system.md`: cross-ref transfer_window consumer
- `economy.md`: add reader (scouting-market debit cost + fee with `transfer_market_operational` category)
- `hud-ui.md`: sidebar add "🔍 Scouting" / "🕵 Mercado" entry; route definition
- `design/registry/entities.yaml`: ~10 new entries (constants + new computed values)

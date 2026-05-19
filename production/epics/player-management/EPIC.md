# Epic: Player Management

> **Layer**: Core
> **GDD**: `design/gdd/player-management.md`
> **Architecture Module**: `apps/api/src/modules/players/`
> **Status**: ✅ **Ready** (ADR-016 Accepted 2026-05-19)
> **Stories**: Not yet created — run `/create-stories player-management`
> **Control Manifest**: 2026-05-19

## Overview

Owns the player roster lifecycle: procedural generation at world-gen, in-season
form evolution (rolling average of last 5 match ratings), morale management
(aggregation of player_happiness via F9b delta), contract renewal pipeline,
basic aging, and forfeit rules (per league-system canonical 63% threshold).
The slice has a placeholder generator (`generateLineup`) that is good enough
for the slice but production needs the real algorithm with attribute weights
per position, age curves, and procedural names from a name pool. ADR-016 must
be written before stories.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-007 (indirect) | Defines the `PlayerStats` shape consumed by `simulateMatch()` | LOW |
| ADR-016: Player Lifecycle | Players in dedicated table; world-gen as deterministic batch; F4 form rolling + F11 morale + F12 weekly drift + yearly aging at season_end; ContractRenewalOffer event variant (extends ADR-015); forfeit guard at fixture load | LOW |

## GDD Requirements

`design/gdd/player-management.md` AC-PM-01 through AC-PM-22 (R2 PASS 2026-05-18).
Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-04 | World-gen: 20 clubs × ~40 players = ~800 players procedurally generated | ADR-016 ⚠ pending |
| AC-05 – AC-08 | F4 form rolling average (last 5 matches with ≥30min) | ADR-016 ⚠ pending |
| AC-09 – AC-11 | F8 forfeit pct ≤63% (canonical from league-system per B-02 fix 2026-05-18) | ADR-016 ⚠ pending |
| AC-12 – AC-15 | F9b player_happiness aggregation: average of 11 titulares as delta | cascade-engine ADR-003 + ADR-016 |
| AC-16 – AC-18 | F11 morale per match (post-match) + F12 skill degradation | ADR-016 ⚠ pending |
| AC-19 – AC-22 | Contract renewal pipeline + basic aging | ADR-016 ⚠ pending |

**Untraced requirements**: All. **ADR-016 is the gate to unblocking this epic.**

## Engine Risk

LOW. Server-side TypeScript module with Drizzle schemas (verified pattern).
World-gen is deterministic from a seed.

## Definition of Done

- ADR-016 written and Accepted
- `apps/api/src/modules/players/` exists with:
  - `generatePlayer(ctx, position, baseSkill, ageDistribution) → PlayerStats`
    — slice's `buildPlayer` is a placeholder; production uses ADR-016 algorithm
  - `world-gen` script: at playthrough start, generate 20 clubs × N players each
  - Form update path: post-match F4 rolling avg from `match_rating` ≥ 30 min
  - Morale update path: F11 per-match modifier
  - Skill degradation: F12 weekly micro-decay for veterans
  - Contract renewal: triggered at season_end via event-system
  - Aging: basic per-season skill drift (MVP — no retirement yet, per scope-mvp)
- F9b delta path: cascade-engine reads aggregated player_happiness from
  `apps/api/src/modules/players/aggregator.ts`
- Forfeit pct rule: `if squad_available_pct ≤ 63 → forfeit → match-sim returns
  0-3 default + mpi_delta=-30`
- 80% test coverage on F4/F11/F12 (Logic stories — BLOCKING)
- Determinism test: world-gen with seed → identical players across runs

## Dependencies

- **Upstream blockers**: ADR-016 (must be written first); cascade-engine
  (for F9b path)
- **Downstream consumers**: match-simulation (lineup input), economy (payroll
  cost via player.salary), staff-system (no direct read; scout staff observes),
  hud-ui (squad panel — currently shows standings only, will need players)

## Next Step

Run `/create-stories player-management`. ADR-016 is Accepted as of 2026-05-19.

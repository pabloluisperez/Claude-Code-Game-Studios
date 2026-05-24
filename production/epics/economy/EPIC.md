# Epic: Economy

> **Layer**: Foundation
> **GDD**: `design/gdd/economy.md`
> **Architecture Module**: `apps/api/src/modules/economy/` (new — to be created)
> **Status**: ✅ **Ready** (ADR-014 Accepted 2026-05-19)
> **Stories**: Not yet created — run `/create-stories economy`
> **Control Manifest**: 2026-05-19

## Overview

The economy is the financial substrate of the cascade engine. It owns the
weekly revenue/cost loop (ticket revenue, sponsors, payroll, scouting,
catering), the fan_momentum-driven attendance model, and the bankruptcy
state machine that escalates from En Riesgo → board meeting of crisis →
forced rescue actions. Economic state lives in WorldState (per ADR-005),
not in dedicated nodes — but the economy module is the authoritative
calculator. The slice has a CLIENT-SIDE proxy (`finance/+page.svelte`) which
demonstrates intent; production needs the server-side authoritative model.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-005: WorldState persistence | Financial state lives in WorldState; persisted in `world_snapshots` | MEDIUM |
| ADR-014: Financial Flow + Bankruptcy | revenue/cost ledger model · sponsor lifecycle · bankruptcy FSM (3 ThresholdCrossings) · MAX_TICKET_EUR formula · "Congelación de nómina" catch-up | LOW |

## GDD Requirements

`design/gdd/economy.md` AC-ECO-01 through AC-ECO-34. Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-08 | Weekly revenue/cost flow; balance & cashflow nodes | ADR-014 ⚠ pending |
| AC-09 – AC-12 | fan_momentum × ticket_price_index → fan_attendance (C8) | cascade-engine ADR-003 ✅ |
| AC-13 – AC-16 | match_day_revenue formula | (formula in GDD; needs module) |
| AC-17 – AC-22 | Sponsor lifecycle: signing, cancellation, scandal-triggered | ADR-014 ⚠ + event-system |
| AC-23 – AC-28 | Bankruptcy FSM: En Riesgo / Crisis / Quiebra | ADR-014 ⚠ pending |
| AC-29 – AC-34 | Catch-up "Congelación de nómina de emergencia" event | event-system ADR-015 ⚠ |

**Untraced requirements**: Most of this epic depends on **ADR-014** which is
identified in `architecture.md §Required New ADRs` as MUST-have-before-coding.
Stories CANNOT be written until ADR-014 is Accepted.

## Engine Risk

**MEDIUM** — depends on:
- Drizzle 0.36+ for the financial ledger schema (if not folded into WorldState)
- Transactional integrity across multi-row writes (revenue + costs + balance)
- Post-slice OQ-ECO-06: `MAX_TICKET_EUR = f(stadium_capacity, division_tier,
  fan_culture)` formula needs spec before player UI is final

## Definition of Done

- ADR-014 written and Accepted
- `apps/api/src/modules/economy/` exists with:
  - Weekly revenue calculator: ticket revenue × attendance + sponsor income +
    TV rights tier-scaled per league-system
  - Weekly cost calculator: player payroll + staff payroll + catering +
    scouting + maintenance
  - Bankruptcy FSM with thresholds from ADR-014
  - Sponsor lifecycle (signing, scandal cancellation per AC-22)
  - Catch-up event ("Congelación de nómina") emits PlayerDecision through
    event-system (ADR-015 ⚠)
- `economy-service` is called by `advance()` after match outcomes are applied
- 80% test coverage on the calculator (logic stories — BLOCKING per control-manifest)
- 4-week determinism test: same seed + decisions → identical balance trajectory
- Hud-ui finance panel reads from `/api/economy/state/:playthroughId` (server-authoritative
  REPLACES the slice's client-side proxy)

## Dependencies

- **Upstream blockers**: cascade-engine (for fan_momentum, fan_attendance, scenario writers), league-system (for TV rights tier)
- **Downstream consumers**: hud-ui (finance panel), event-system (consumes scandal triggers; emits catch-up events), manager-rpg (career events triggered by bankruptcy)

## Next Step

Run `/create-stories economy`. ADR-014 is Accepted as of 2026-05-19.

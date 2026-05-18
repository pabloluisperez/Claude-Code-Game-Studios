# Epic: Staff System

> **Layer**: Core
> **GDD**: `design/gdd/staff-system.md`
> **Architecture Module**: `apps/api/src/modules/staff/`
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories staff-system`
> **Control Manifest**: 2026-05-19

## Overview

The staff system is the **discovery interface** of the cascade engine. Per
ADR-009 and the Pilar 1 ↔ Pilar 3 resolution rule (game-concept.md), staff
quality determines which threshold crossings the player sees and how
specifically they are described. The slice's tier-1 templates ("Los chicos
llegan tocados") proved that narrative voice can communicate cascades without
exposing the system. MVP scope: 7 staff slots (head_coach, fitness_coach,
finance_director, scout, groundskeeper, communications_director, doctor) with
3 quality tiers each. Templates use NodeIds from cascade-engine.md as the
template-key system (no separate registry).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-009: Staff Message Routing & Granularity | Template key format `{role}:{nodeId}:{direction}:{tier}`; quality factor multiplies base threshold | LOW |

## GDD Requirements

`design/gdd/staff-system.md` AC-STAFF-01 through AC-STAFF-26 (R3 lean PASS
2026-05-18). Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-05 | 7-slot staff catalog + salary table per tier | ADR-009 + GDD F1 ✅ |
| AC-06 – AC-10 | Message threshold detection: `BASE_THRESHOLD_PCT × QUALITY_FACTOR[tier]` | ADR-009 + GDD F3 ✅ |
| AC-11 – AC-15 | Template lookup by `{role}:{nodeId}:{direction}:{tier}` key | ADR-009 ✅ |
| AC-16 – AC-20 | Hiring mechanics: Vía A (improve existing) vs Vía B (replace) | GDD (D3 documented) |
| AC-21 – AC-23 | T2/T3 reputation gates from manager-rpg | manager-rpg ADR-010 ✅ |
| AC-24 | calendar messages tier ≥ 2 gate | ADR-009 ✅ |
| AC-25 – AC-26 | STABLE_CHECK confirmation messages (every 4 stable weeks → 1 routine) | ADR-009 + GDD Rule 9 ✅ |

**Open OQ tracked**: OQ-STAFF-04 (squad_morale:high_streak counter-node) is
still open and affects manager-rpg AC-27/28. Resolution: either add squad_morale
as a cascade node or change the XP source.

## Engine Risk

LOW. Template library is hardcoded strings (per OQ-STAFF-05 resolved: no
interpolation, no LLM in MVP). Drizzle 0.36+ for `staff_messages` table is
verified by slice.

## Definition of Done

- 7 staff slots × 3 tiers = 21 roles defined with salary + quality factor
- Template library covering all tier-1 minimum NodeIds (per cascade-engine.md
  "Contrato mínimo de señal tier-1"): `field_quality` zona mediocre,
  `training_intensity` extremes, `consecutive_losses × training_intensity`
- Tier-3 templates name specific players + numbers (current full-spec range)
- Threshold detection: `effectiveThreshold = BASE_THRESHOLD_PCT × QUALITY_FACTOR[tier]`
  per F3 (verified by entities.yaml — slice has tier-1 only)
- Message generation pipeline: invoked from `advance-worker` after cascade tick
  with `(cascadeLog, thresholdCrossings, weekState)`
- Hiring mechanics: Vía A (upgrade in place) + Vía B (replace) — UI exposed
  via `/api/staff/hire` (production sprint)
- Staff inbox UI reads `/api/advance/staff-messages/:playthroughId` (slice has wire)
- 80% test coverage on threshold detection + template lookup
- STABLE_CHECK runs every 4 stable weeks → 1 routine message (per Rule 9
  + Tuning Knob STABLE_CHECK_INTERVAL_WEEKS)

## Dependencies

- **Upstream blockers**: cascade-engine (consumes thresholdCrossings + cascadeLog),
  manager-rpg (consumes reputation tier for staff hire gates)
- **Downstream consumers**: hud-ui (staff inbox panel), event-system (calendar
  message generation for ≥ tier-2 staff per AC-24)

## Next Step

Run `/create-stories staff-system` to break this epic into implementable
stories.

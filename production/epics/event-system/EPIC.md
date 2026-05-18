# Epic: Event System

> **Layer**: Feature
> **GDD**: `design/gdd/event-system.md`
> **Architecture Module**: `apps/api/src/modules/event-system/`
> **Status**: ⚠ **Blocked on ADR-015** (Special Event Decision Schema)
> **Stories**: Not yet created — run `/create-stories event-system` AFTER ADR-015 lands
> **Control Manifest**: 2026-05-19

## Overview

The event system is the **narrative layer over the cascade engine**: it
generates calendar events (fixtures, festivals, derbis, transfers windows)
+ random events (rain, flu, sponsor calls, youth promises) + reactive events
triggered by threshold crossings (scandal, board meeting, alcalde call,
external offer). Per ADR-008, events write to WorldState exclusively via
PlayerDecisions in Step 3 of the cascade tick. Per architecture.md, ADR-015
must define the schema for special PlayerDecisions (corruption, scandal,
cena de reconciliación, sponsor offer, alcalde meeting) before stories.
The slice has a placeholder event-system with 3 calendar events + 5 random
event templates — production extends to the ~50 events of MVP.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-008: World clock + event loop | `advance()` consumes ThresholdCrossings and emits PlayerDecisions; BLOCKING crossings halt advance | LOW |
| **ADR-015: Special Event Decision Schema** (**REQUIRED — not yet written**) | Defines payload types for special PlayerDecisions: corruption_caught, scandal_response, sponsor_offer, cena_reconciliacion, alcalde_meeting, etc. Each is a typed object with explicit WorldState deltas. | TBD |

## GDD Requirements

`design/gdd/event-system.md` AC-EVT-01 through AC-EVT-32. Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-06 | Calendar event scheduling: fixtures + festivals + derbi announce | ADR-008 ✅ |
| AC-07 – AC-12 | Random event pool: 5+ templates with weighted draw + 30% per-week chance | ADR-008 ✅ |
| AC-13 – AC-18 | Reactive events from ThresholdCrossings (BLOCKING → forced event) | ADR-008 ✅ |
| AC-19 – AC-24 | Special event types: scandal (F4d formula resolved per cross-review fix), corruption_caught, sponsor_offer | ADR-015 ⚠ pending |
| AC-25 – AC-28 | BLOCKING simultaneous spec (per cross-review fix 2026-05-18) — resource flow ordering | ADR-008 ✅ |
| AC-29 – AC-32 | Catch-up event "Congelación de nómina" — collaboration with economy | ADR-015 ⚠ + economy ADR-014 ⚠ |

**Untraced requirements**: AC-19/20/22/24/29/30 require ADR-015. Stories
blocked until ADR-015 is Accepted.

## Engine Risk

LOW. Server-side TypeScript with Drizzle. The `nextEventPreview` mechanism
(ADR-008) for HUD is straightforward.

## Definition of Done

- ADR-015 written and Accepted
- `apps/api/src/modules/event-system/` exists with:
  - Calendar event registry: fixtures (from league-system), festivals,
    derbi anchors, market windows
  - Random event pool: ~50 templates with weighted draw (slice has 5 as starter)
  - Reactive event triggers: BLOCKING ThresholdCrossing → forced event (e.g.,
    `fan_momentum:below:20` → board meeting)
  - Special event payload types (per ADR-015): typed PlayerDecisions with
    explicit deltas. NO free-form objects in MVP.
  - Event scheduling at season_start (uses league-system fixtures)
- BLOCKING crossings halt `advance()` until the player responds (per cascade-engine
  Edge Cases + ADR-008)
- Calendar events surface on `/api/calendar/:playthroughId/week/:week` route
- Hud-ui staff messages get calendar events as tier ≥ 2 messages (per
  staff-system AC-24)
- 80% test coverage: event selection determinism (same seed + week → same events),
  threshold-crossing → event routing
- Scandal "cooperar" vs "no cooperar" branches per W-05 of cross-review (closed
  as intentional 30K€ flat per game-design call 2026-05-18)

## Dependencies

- **Upstream blockers**: ADR-015 (must be written); cascade-engine (consumes
  thresholdCrossings), league-system (provides fixtures), economy (provides
  scandal cost data — depends on ADR-014 too)
- **Downstream consumers**: cascade-engine (Step 3 applies decisions),
  staff-system (calendar message generation), hud-ui (event modals)

## Next Step

1. Run `/architecture-decision "Special Event Decision Schema"` → ADR-015
2. Then `/create-stories event-system`

**Until ADR-015 lands, this epic is blocked.**

# Epic: Manager RPG

> **Layer**: Core
> **GDD**: `design/gdd/manager-rpg.md`
> **Architecture Module**: `apps/api/src/modules/manager/` + `packages/shared/src/sim/manager-rpg-constants.ts`
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories manager-rpg`
> **Control Manifest**: 2026-05-19

## Overview

The Manager-RPG layer is **Pilar 3 ("You Grow Like Your Club")** made
executable: the player has their own character with skills, XP, reputation,
and career events. ADR-010 defines the progression model: 5 skills (Tactics,
Finance, Man-Management, Scouting, Communications), levels 1–4 each, XP from
match outcomes + threshold-crossing handling + career events. Skill levels
gate **staff tier-3 hires**, which in turn unlock cascade visibility (the
Pilar 1 ↔ Pilar 3 tension resolution rule). The slice implemented 2 of 5
skills (Tactics + Finance) and the XP curve; production extends to all 5 plus
the reputation system and external offers.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-010: Manager-RPG Progression Model | XP thresholds 80/240/560; skill levels 1-4; career event triggers tied to reputation milestones + critical performance | LOW |

## GDD Requirements

`design/gdd/manager-rpg.md` AC-RPG-01 through AC-RPG-30 (R1 PASS 2026-05-18).
Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-06 | XP gain sources + curve thresholds | ADR-010 ✅ |
| AC-07 – AC-10 | Skill allocation: atomic pending → spent | ADR-010 ✅ |
| AC-11 – AC-14 | financial_acumen locked-at-signing (per R2 fix 2026-05-18 — B-03 blocker resolved) | ADR-010 ✅ |
| AC-15 – AC-20 | Career events: external offers, board meetings, alcalde calls | ADR-010 ✅ |
| AC-21 – AC-26 | Reputation system: tier-gated UI visibility (Pilar 3 resolution rule) | ADR-010 ✅ |
| AC-27 – AC-30 | man_management XP from squad_morale streak (OQ-STAFF-04 D-04 pending — squad_morale node spec needed) | ADR-010 ⚠ (waiting on OQ-STAFF-04 resolution) |

**Untraced requirements**: AC-27/28 depend on `squad_morale:high_streak`
counter-node which is still OQ-STAFF-04. Either implement squad_morale as a
new cascade node first (extends cascade-engine) or change the XP source to
something else (revision to ADR-010). Stories for AC-27/28 are blocked
until OQ-STAFF-04 resolves.

## Engine Risk

LOW. Server-side TypeScript module reading/writing to JSON-blob field
`worldSnapshots.managerState`. No new engine surface.

## Definition of Done

- 5 skills implemented: Tactics, Finance, Man-Management, Scouting, Communications
- XP curve constants in `packages/shared/src/sim/manager-rpg-constants.ts`
  (per control-manifest rule "XP curve constants centralized")
- `applyXp(state, gains) → { state, leveledUp, totalGain }` pure function
- `allocateSkillPoint(state, skill) → state` atomic operation (no half-allocated)
- Career event factory `maybeGenerateCareerEvent(week, state, context) → event | null`
  with position-aware copy (slice validated this pattern for W4 president meeting)
- Reputation system: `getReputationTier(skills, careerEvents) → 1 | 2 | 3 | 4`
- External offer generator: hooks into event-system (PlayerDecision type
  "external_offer" — spec'd in ADR-015 ⚠ pending)
- Staff hire gating: staff-system reads `getReputationTier()` for tier-3 unlock
- 80% test coverage on `manager-rpg-constants.ts` + `applyXp/allocateSkillPoint/
  maybeGenerateCareerEvent` (slice has 8 tests as template)
- Manager UI panel reads from `/api/advance/state/:playthroughId` and writes
  via `/api/advance/allocate-skill` (slice has this wired)

## Dependencies

- **Upstream blockers**: cascade-engine (for threshold crossings → XP), economy
  (for financial_acumen lock-at-signing), staff-system (OQ-STAFF-04 squad_morale node)
- **Downstream consumers**: staff-system (gates tier-3 hires + visibility),
  event-system (external offers, alcalde calls), hud-ui (manager panel)

## Next Step

Run `/create-stories manager-rpg` to break this epic into implementable
stories. Note that AC-27/28 stories will be marked Blocked on OQ-STAFF-04.

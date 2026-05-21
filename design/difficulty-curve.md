# Difficulty Curve: Cascada FC

> **Status**: Approved
> **Author**: game-designer (autopilot synthesis, Sprint 10 task 10-2)
> **Last Updated**: 2026-05-21
> **Links To**: `design/gdd/game-concept.md`, `design/gdd/game-pillars.md`
> **Relevant GDDs**: `design/gdd/cascade-engine.md`, `design/gdd/economy.md`, `design/gdd/tv-rights.md`, `design/gdd/event-system.md`, `design/gdd/manager-rpg.md`
> **Playtest evidence**: `production/playtests/2026-05-18-slice-pablo.md`, `production/playtests/2026-05-21-fresh-player-pablo.md`, `production/playtests/2026-05-21-economy-tuning-pablo.md`

---

## Difficulty Philosophy

Cascada FC is built on **accessible entry, optional depth**: the base
experience must be completable by a player who simply makes "reasonable manager
decisions" each week, while the deeper challenge of optimizing across all
cascade pathways is genuinely demanding for the player who chooses to engage
with it. This game is **not** a soulslike of management — Pilar 4 ("Calm Is The
Tempo") is binding: the clock waits for the player, decisions are reversible
within reason, and failure is informative rather than punitive.

Players are permitted to feel **confused for about 4 in-game weeks** (the
discovery window for the first cascade signal) and **financially anxious for
about 6 in-game weeks** (the recovery window for an economic crisis). Beyond
those windows, the design must intervene with explicit feedback: staff
messages that point to root causes, inbox events that surface options, and the
recovery-levers UX panel (Sprint 10 task 10-3) that lists concrete actions per
crisis tier.

Bankruptcy is the only true game-over state, and it is reachable in MVP but
only after sustained mismanagement (~12-18 weeks of consecutive negative
cashflow without any intervention). A first-time player should not encounter
it; a careless player should encounter it with full warning; an experienced
player chasing risky strategies can encounter it as the deliberate consequence
of stretching for short-term gains.

---

## Difficulty Axes

| Axis | Description | Primary Systems | Player Control? |
|------|-------------|----------------|-----------------|
| **Execution difficulty** | Real-time skill is irrelevant. Every action is a click on a deliberate UI element. Match-day is observed, not played. | (none) | N/A — fixed at 1/10 by design |
| **Knowledge difficulty** | The cascade graph is hidden. Players infer cause-effect from staff messages, balance drift, and outcome differences. Cascade-engine's `corruption_exposure → TV cancellation` chain is the canonical example: nothing in the UI tells you "TV will cancel at 60", you must read the threshold staff message, infer the trigger, and act. | cascade-engine, staff-system, event-system, headlines | Yes — through experimentation + staff tier upgrades that surface more URGENT messages |
| **Resource pressure** | The economy is structurally tight. Pre-kickoff weeks burn ~€25-35 K without matchday revenue; the player must use sponsor + season-ticket levers to bridge to matchday. Post-retune (Sprint 9, 2026-05-21) this is sustainable for a "reasonable manager", but margin for error is intentionally small. | economy, sponsor-system, season-tickets, staff-system | Yes — recovery levers documented in Sprint 10 task 10-3 |
| **Time pressure** | The clock waits for the player. Players can sit on a STOP event indefinitely while they read help text. Per-event hard deadlines are rare and always telegraphed weeks in advance. | (none — pillar 4 enforced) | N/A — fixed at 1/10 by design |
| **Decision complexity** | 5+ levers interact: ticket price, training intensity, staff tier (×3 roles), sponsor acceptances, TV tier choice. Most interactions are 2-step delayed; some are 3-step (e.g., catering quality → player_happiness → team_morale → match performance). The mental model is non-trivial. | cascade-engine, economy, staff-system | Yes — UI surfaces the immediate consequence of every lever; cross-system consequences are discovered |
| **Narrative consequence** | F8 scandal (corruption ≥ 80) and TV cancellation (corruption ≥ 60) are rare but irreversible-within-season story beats. The decisions that get you there (NACIONAL TV multi-year, bribery events) are visible in advance; the dramatic crash is not forced, but it is available. | tv-rights, event-system, headlines | Yes — staff messages telegraph corruption_exposure and warn before threshold crossings |

The two **fixed** axes (execution = 1/10, time = 1/10) are not difficulty levers
this game uses. The three **variable** axes are knowledge, resource pressure,
and decision complexity. Tuning happens by adjusting cascade decay rates,
threshold values, and the speed at which staff messages surface information.

---

## Difficulty Curve Overview

The MVP scope (`design/gdd/scope-mvp.md`) covers approximately **3 in-game
seasons** of meaningful difficulty progression. Real-time playthrough time per
season is roughly 45-90 minutes depending on how often the player advances
mid-week (Sprint 10+ feature).

| Phase | Duration | Difficulty Level (1-10) | Primary Challenge Type | New Systems Introduced | Target Player State |
|-------|----------|------------------------|----------------------|----------------------|---------------------|
| **Onboarding** | W0-W2 (pre-kickoff) | 1/10 | Knowledge | UI layout, advance loop, staff hires, sponsor offers | Curious, exploratory, no urgency |
| **First Burn** | W3-W4 (pre-kickoff continued) | 3/10 | Resource pressure | Balance card turns red, first STOP event, first cashflow drain becomes visible | Mild alarm; should reach for finance tab |
| **First Match** | W5 (kickoff) | 2/10 | Decision complexity | Match-day card, replay flow, post-match league standings | Excited, relieved (matchday revenue arrives) |
| **Early Season** | W6-W12 | 4/10 | Knowledge | First slow cascade visible — staff training intensity ↔ team fitness chain, fan momentum drift | Detective mode — "wait, why is fitness dropping?" |
| **Mid Season** | W13-W25 | 5-6/10 | Resource + Decision | Sponsor contract renewals, mid-season TV offer if cancellation occurs, F-TV3 corruption visible if NACIONAL multi-year signed | Active management — multiple levers in play simultaneously |
| **Climax** | W26-W38 | 6-7/10 | Decision + Narrative | Promotion/relegation race, end-of-season events, scandal threshold pressure | High stakes, every advance matters |
| **Season Transition** | W38 → W39 (next season W0) | 4/10 | Knowledge + Decision | TV auction (re-evaluated with corruption state), board meeting if performance below target, manager XP gains | Reflective, planning next season |
| **Season 2 onward** | season 2-3 | 6-8/10 | Decision + Resource + Narrative | Multi-year contracts mature, staff tier 3 unlocked, multiple compounding cascades active | Strategic mastery — the player IS the system |

A player who PROCEEDS through this curve should feel:
- W0-W4: "I'm learning"
- W5-W12: "I'm discovering"
- W13-W25: "I'm managing"
- W26-W38: "I'm racing"
- Season 2+: "I'm mastering"

---

## Crisis Trigger Windows

These are the **threshold crossings** that turn discovery into pressure. All
values from `design/gdd/cascade-engine.md` "Threshold Crossings configurados (MVP)"
and `design/gdd/tv-rights.md` F-TV3.

| Crisis | Trigger Node | Threshold | Direction | Earliest Plausible Week | Severity | Recovery Window |
|---|---|---|---|---|---|---|
| Board meeting (fan crisis) | `fan_momentum` | ≤ 20 | below | W6 (after 4 weeks of compounded C6 erosion from losses + C15 ticket-price overreach) | BLOCKING | 2-4 weeks (promotional campaign + reduced prices) |
| Locker-room crisis | `player_happiness` | ≤ 25 | below | W8 (after sustained low catering quality + low staff_morale via C10) | BLOCKING | 1-2 weeks (catering upgrade + training intensity drop) |
| TV cancellation (REGIONAL) | `corruption_exposure` | ≥ 60 | above | W19 (REGIONAL 2yr signed with starting corruption ≥ 23.5; +0.5/week × 19 weeks) | STOP, financial hit | 0 — within season; mid-season offer at 70% rate if week ≤ 35 |
| TV cancellation (NACIONAL) | `corruption_exposure` | ≥ 60 | above | W6 (NACIONAL signed with starting corruption ≥ 57; +1.5/week × 2 weeks) | STOP, large financial hit | 0 — same as above |
| Full scandal | `corruption_exposure` | ≥ 80 | above | W22 (NACIONAL 3yr signed with starting corruption ≥ 23; +1.5/week × 13 weeks) | BLOCKING, forced narrative event | season-long; no recovery within season |
| Bankruptcy | `financial_balance` | ≤ -500 (€K) | below | W14 (no intervention path: pre-kickoff drain × 14 weeks ≈ -350 + sustained loss-side cashflow) | TERMINAL — game over | none within season; new playthrough required |

**Onboarding protection**: A first-time player who simply accepts default
sponsor offers and does not lower season-ticket prices below the recommended
value will NOT reach any BLOCKING threshold before W12 (validated in playtest
#1 — `production/playtests/2026-05-21-fresh-player-pablo.md` — 5/5 metrics
PASS with no crises encountered through W4 stable economy).

---

## Recovery Windows

For every crisis, there is at least one in-game lever the player can pull. The
recovery-levers UX panel (Sprint 10 task 10-3) surfaces these explicitly.

| Crisis | Lever 1 (fast) | Lever 2 (medium) | Lever 3 (slow) |
|---|---|---|---|
| Negative cashflow | Accept any pending sponsor offer (impact: +€2-6 K/week within 1 tick) | Lower season-ticket price → boost holder count (impact: +€10-20 K/season, 1-2 weeks lag) | Downgrade staff tier (impact: -€1-2 K/week each, severance hits week 1 then savings start) |
| Fan momentum decline | Lower ticket price (revert C15 erosion, +5-8 FM in 2 weeks) | Promotional campaign event option (+5 FM in 2 weeks, -€5 K) | Personal message event option (+8 FM if reputation ≥ L3, free) |
| Player happiness decline | Lower training intensity below 50 (stops C12 desperation drain) | Upgrade catering quality budget (+5 happiness per week, lag 1 week) | Fire bad staff (resets C10 morale chain, severance cost) |
| Corruption rising | Cancel risky TV tier (no in-game lever — must wait for next season) | Decline corruption-source events (immediate but rare opportunity) | Sign LOCAL TV (−0.5/week corruption — only negative source in MVP) |
| Bankruptcy spiral | All of the above, combined | — | — |

---

## Anti-Frustration Rules

These are binding design constraints — any tuning that violates them is a
regression, regardless of how "elegant" the curve becomes.

1. **No silent failure**: Every state change that affects player progress must
   produce a staff message, an inbox event, or a visible UI delta within 1
   week. The player must never wonder "what just happened" for more than 7
   in-game days.
2. **No unrecoverable mid-season crisis (for first-time players)**: Every
   BLOCKING threshold within W0-W25 of a first season has at least one lever
   that can reverse it before season end. This is the "no death spiral despair"
   metric from playtest evidence.
3. **Telegraph the cliff**: Threshold crossings within 4 weeks must produce a
   URGENT staff message in advance. The player should be warned at least 1
   week before any BLOCKING event fires.
4. **Allow opting out of the deep system**: A player who simply accepts all
   default offers, never adjusts ticket price, and hires staff at tier 1 should
   reach end-of-season-1 without bankruptcy. This is the "accessible entry"
   floor.
5. **Allow stretching for risk**: A player who signs NACIONAL 3yr with
   corruption_exposure > 3.0 SHOULD face TV cancellation. The deep-strategy
   ceiling is supposed to be hard. Do not nerf the consequence — sharpen the
   warning.

---

## Tuning Decisions to Date

This section tracks specific balance changes made in response to playtest
evidence.

| Date | Sprint | Change | Source | Effect |
|---|---|---|---|---|
| 2026-05-21 | 9 | SALARY_BASE 6 → 3, ROSTER_SIZE 40 → 25, POSITION_QUOTAS rebalanced (GK 3, DEF 8, MID 8, FWD 6) | `production/playtests/2026-05-21-economy-tuning-pablo.md` finding A | Player wages 80 €K/wk → 25 €K/wk. Pre-kickoff drain sustainable; first-time players reach W4 with balance > 0. |
| 2026-05-21 | 9 | Cashflow breakdown panel + recovery-lever links on /finance | `production/playtests/2026-05-21-economy-tuning-pablo.md` finding B | Players can SEE where money goes and SEE what levers exist. "No agency" finding partially addressed. |
| (pending) | 10 | Recovery levers coaching panel surfacing tier-appropriate actions | Sprint 10 task 10-3 | Full closure of "no agency" finding from playtest #2. |
| (future) | 11+ | Day-by-day tick model implementation (ADR-020) | Playtest #2 finding E | Mid-week recovery decisions take effect mid-week rather than at week boundary. |

---

## Validation Criteria for Next Playtest

The Sprint 10 / Polish-phase playtest (10-6) should answer:

1. Does the player REACH for the recovery-levers panel before negative
   cashflow becomes a crisis? (success: yes, within W4-W6 of first crisis
   warning)
2. Can the player identify the dominant drain source from the cashflow
   breakdown alone? (success: yes; difficulty axis "knowledge" working
   correctly)
3. Does a first-time player playthrough produce the curve described above?
   (success: target player state at each phase matches observed state)
4. Are any BLOCKING thresholds being crossed earlier than the "Earliest
   Plausible Week" in the table above? (failure mode: tuning is too steep)
5. Is the curve too flat — does the player feel like the game is on rails?
   (failure mode: tuning is too gentle; sharpen the cliffs)

---

## Open Questions (Polish-phase backlog)

- **OQ-DC-01**: Should we add an explicit "rookie mode" toggle that softens
  the cliffs further for first-time players, or is the design's accessibility
  floor sufficient? Decide after playtest 10-6.
- **OQ-DC-02**: The W26-W38 climax intensity (6-7/10) is theoretical — no
  playtest has reached that window yet. Validate in Polish phase before
  shipping.
- **OQ-DC-03**: Season 2+ compounding curve assumes multi-year TV contracts
  and tier 3 staff are unlocked. Verify these unlocks land at the expected
  reputation milestones (manager-RPG GDD).

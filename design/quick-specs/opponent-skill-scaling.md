# Quick Design Spec: Opponent Skill Scaling by Division

**Date:** 2026-05-17
**Resolves:** D-02 from /review-all-gdds 2026-05-17
**Owner:** match-simulation.md (or league-system.md when written)
**Status:** Approved

---

## Problem

match-simulation.md defines the match algorithm with full player-level stats, but doesn't specify how rival teams' stats are distributed by division. Without this, the simulator can't produce division-appropriate difficulty.

---

## Decision

Rival team stats are generated from a **division-based skill distribution** at the start of each season. Each rival club gets a `squad_skill_mean` drawn from the distribution below, and individual players' stats are generated around that mean.

### Skill Distribution by Division

| Division | Squad Skill Mean Range | std_dev | Notes |
|----------|------------------------|---------|-------|
| D3 | [35, 65] | 8 | Wide spread — uneven division with clear weak and strong teams |
| D2 | [50, 72] | 6 | More competitive, fewer weak teams |
| D1 | [62, 85] | 5 | Elite level, small variation — every team is dangerous |

**Player-level generation:** Each rival player's `skill` stat is drawn from `Normal(squad_skill_mean, 8)`, clamped to [20, 95]. Other stats at generation time:
- `fitness`: uniform [60, 90] — rivals start the season in reasonable shape
- `morale`: uniform [50, 75] — standard motivation
- `form`: uniform [40, 70] — rolling average from last 5 matches (simulated pre-season)
- `stamina`: uniform [50, 80]
- Position-specific stats: scaled at `skill × multiplier` per position, with noise ±10

### Position-Specific Stat Scaling

| Position | Stat A scaling | Stat B scaling |
|----------|---------------|----------------|
| GK | `reflexes = skill × 0.9 ± 10` | `handling = skill × 0.85 ± 10` |
| DEF | `strength = skill × 0.9 ± 10` | `tackling = skill × 0.85 ± 10` |
| MID | `technique = skill × 0.9 ± 10` | `vision = skill × 0.85 ± 10` |
| FWD | `speed = skill × 0.9 ± 10` | `finishing = skill × 0.85 ± 10` |

All position stats clamped to [15, 95].

---

## Expected Match Outcomes

With the player's starting squad at team_skill ≈ 50 (D3 default):

| Player squad_skill | Rival squad_skill_mean | Expected result | Design intent |
|-------------------|----------------------|-----------------|---------------|
| 50 | 40 | Win ~65% | Beatable bottom-table rival |
| 50 | 50 | Win ~50% | 50/50 match — typical D3 |
| 50 | 60 | Win ~35% | Clear underdog — tough match |

This produces a realistic D3 table spread without making the game trivial or impossible.

---

## Rival AI Manager

Substitution logic (simple rules, not player decisions):
- Auto-sub when a player's `effective_fitness` drops below 35 (physical threshold)
- Auto-sub on injury (same as manager: pick best available from bench by skill)
- Max 3 subs per match, same rules as human manager

Tactical instruction: fixed per match (randomly assigned: `HOLD_SHAPE` 40%, `4-4-2 default` 40%, `PRESS_HIGH` 20%). Does NOT change mid-match.

---

## Implementation Notes

- Rival squads are generated at **season start** and persist for the season (no weekly regeneration)
- Same `seeded RNG` as match-simulation (ADR-002 determinism): rival squad generation seed = `seasonId + clubId`
- Rival player morale and fitness update weekly via the same cascade mechanics (the rival club has its OWN WorldState, simplified — no sponsor/economy tracking, only the fitness/morale/form nodes for match purposes)
- `league-system.md` will define which clubs populate each division and their tier assignments

---

## Open Questions

- OQ-OPP-01: Does each rival club have a persistent WorldState between matches (tracking their own injury_risk, team_fitness evolution), or are stats re-generated per match? **Recommended: persistent WorldState per club for match-relevant nodes only (fitness, morale, injury_risk, form) — not the full 20-node cascade.**
- OQ-OPP-02: How is club promotion/relegation handled for rival stats? Clubs that promote from D3 to D2 should have skill distributions that reflect their D3 origins (slightly below D2 average at first). Define in league-system.md.

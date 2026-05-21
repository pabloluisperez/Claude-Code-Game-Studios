# ADR-022: Day-Night Cycle + Weather Model

## Status

Proposed (v1.1 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | Simulation core + Rendering |
| **Knowledge Risk** | LOW — no external API risk |
| **References Consulted** | ADR-002 (determinism), isometric-world.md §3.5-3.6, city-progression.md §3.3 |

## Context

v1.1 adds day-night cycle + weather. Both are visual concerns BUT they
intersect with simulation (rain reduces effective infrastructure_level
during match-day).

We need to decide:

1. Is time-of-day state in the simulation (WorldState) or only in the
   renderer?
2. Is weather deterministic (per PRNG seed) or random per session?
3. How do we surface these to PixiJS without coupling sim to rendering?

## Decision

### D1. Time-of-day lives in WorldState as `currentTimeOfDay: 0..1`

WorldState gets a new field `currentTimeOfDay`. It's a normalized [0,1]
float: 0 = midnight, 0.5 = noon, etc.

Rationale: time of day affects match-simulation (night matches might
have slight attendance/morale effects in future iterations) — so it's
sim-domain, not pure render-domain. Keeping it in WorldState ensures
determinism via the existing snapshot pipeline.

In v1.1, the sim uses `currentTimeOfDay` only for the rain interaction
(D3). Future iterations may add more.

### D2. Time-of-day updates per tick

`currentTimeOfDay` advances 1/7 per in-game day (so the value spans
0 to 1 over a 7-day week of advances). Match-days are reset to 0.65
(late afternoon / dusk start — typical European football scheduling).

This is NOT real-time. The 30s fade transition in isometric-world.md §3.5
is purely the renderer interpolating between the most recent snapshot
value and the next; it does NOT mutate WorldState.

### D3. Weather is deterministic via PRNG

`WorldState.weather: 'clear' | 'rain'` derived per-day from a PRNG
seeded by `(playthroughId, currentWeek, currentDayOfSeason)`. Same seed
= same weather, so replays + soak tests are deterministic.

Distribution (default): 80% clear, 20% rain. Seasonal modulation in v1.3+.

### D4. Rain reduces effective infrastructure_level during match

When a fixture is played AND `weather === 'rain'`:

```
effective_infrastructure = max(0, infrastructure_level - 10)
```

Used in match-simulation.md formulas wherever `infrastructure_level`
appears. NO mutation to the persisted value — only used in-formula.

### D5. Renderer reads time + weather from WorldState

PixiCanvas component reads `data.worldState.currentTimeOfDay` and
`data.worldState.weather` and applies the tint + overlay per
isometric-world.md §3.5-3.6.

NO renderer-side ticking. If the user is on `/stadium` for 30 minutes
without advancing the week, the time-of-day stays frozen at the last
WorldState value. (Future v1.3 may add a "presentation-time" passive
ticker independent of WorldState.)

## Schema impact

Add to WorldState (and `world_snapshots` table jsonb):

```
{
  ...,
  currentTimeOfDay: 0.65,       // float 0..1
  weather: 'clear' | 'rain',    // discriminated union
}
```

No migration needed if WorldState is stored as jsonb (existing pattern
per ADR-005). Defaulting strategy: if field absent, treat as 0.65 / 'clear'
(backwards compatible reads).

## Alternatives Considered

### A1. Pure render-side day-night (no WorldState field)

REJECTED — couples to wall-clock or component mount time. Breaks
determinism in tests. Breaks "same seed = same playthrough" guarantee.

### A2. Weather as continuous state (overcast %, precipitation mm…)

REJECTED — overengineering for v1.1. 2 buckets cubre el caso visual.
Continuous models defer to v1.3+ when the visual fidelity warrants it.

### A3. Per-fixture weather (not per-day)

REJECTED — weather can't change mid-fixture; per-day is the natural
granularity for football.

## Consequences

### Positive

- Single source of truth (WorldState) — render and sim share the value
- Replays produce identical lighting + weather
- Test fixtures can pin weather to specific values for screenshot tests
- Future MMO (v2.0) gets shared weather across all managers of same league

### Negative

- WorldState gains 2 fields (minor schema impact)
- Match-simulation now reads weather — slight coupling expansion

### Mitigations

- Match-sim already reads many WorldState fields; this is one more
- Schema change is jsonb default-driven, no migration

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.1 #25 | currentTimeOfDay + weather added to WorldState, advance logic |
| v1.1 #25 | Match-sim consumes weather for rain penalty |
| v1.1 #25 | PixiCanvas applies tint + rain overlay |

## References

- ADR-002 (determinism)
- ADR-005 (WorldState persistence — jsonb pattern)
- isometric-world.md §3.5-3.6
- city-progression.md §3.3

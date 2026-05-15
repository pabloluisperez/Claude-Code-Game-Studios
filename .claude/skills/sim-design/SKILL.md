---
name: sim-design
description: "Design the deterministic simulation core for simulation-heavy games (management sims, life sims, economy games, tycoons, manager games). Produces a sim-design.md spec with rating model, RNG strategy, tick model, event pipeline, formulas, and acceptance tests. Run after /brainstorm and the relevant /design-system passes when the game's core is algorithmic rather than mechanical."
argument-hint: "[system-name] [--type match|economy|life|tick|combat]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion
model: sonnet
agent: systems-designer
---

## Purpose

Many browser-based games (and a fair number of native ones) are
**simulation-heavy**: their core loop is an algorithm running over data,
producing outcomes the player reacts to rather than directly controls.
Examples: football managers, life sims, economy tycoons, tower-defense
between waves, idle / incremental, 4X turn resolution.

This skill produces a **simulation design specification** for one such
system. It is design-first — no code is written. The output is a
`design/sim/<system>-sim-design.md` document that programmers (in any
engine, including Web) implement against.

## When To Use

- After `/brainstorm` and after the relevant `/design-system` has
  produced the **what** of the system (rules, fantasy, goals)
- Before `/create-architecture` — the sim shape informs architectural
  choices (where it runs, how it's tested, whether it's deterministic)
- For any system whose outcomes are computed rather than directly
  controlled by player input

## Out of Scope

- Real-time action mechanics (use `/design-system` + engine-specific
  implementation)
- Pure UI flows (use `/ux-design`)
- Balance tuning of an already-implemented sim (use `/balance-check`)

## Phase 1: Resolve System

If `[system-name]` was provided, use it. Otherwise list any GDDs under
`design/gdd/` and ask the user which one is being simulated.

Read the relevant GDD to understand:
- Player fantasy
- Inputs (what the player controls)
- Outputs (what the sim produces)
- Acceptance criteria

If the GDD doesn't exist yet, stop and recommend running `/design-system <system>` first.

## Phase 2: Classify Sim Type

Use `AskUserQuestion` to confirm the simulation archetype:

| Type | Examples | Tick model |
|------|----------|------------|
| **Match / encounter** | Football match, combat round, tournament | Discrete events over a bounded time window |
| **Economy** | Market prices, supply/demand, business sim | Periodic tick (daily/weekly), feedback loops |
| **Life / world** | Aging, relationships, narrative state | Long-period tick (day/season), branching events |
| **Cumulative / idle** | Incremental, idle, prestige | Continuous accumulation rate × time |
| **Strategic resolution** | 4X turn end, faction war | One big resolution function per turn |

Different types use different mathematical primitives. Confirm before
proceeding.

## Phase 3: Section-by-Section Spec Authoring

Create the file `design/sim/<system>-sim-design.md` with the skeleton
below, then fill **one section at a time**, getting approval after each
before moving on.

### Required Sections

```markdown
# <System> Simulation Design

## 1. Overview
One paragraph: what is simulated, how often it runs, what produces output.

## 2. Determinism Contract
- Pure function: yes/no
- Inputs (state + seed)
- Outputs
- Forbidden inside the sim: Date.now(), Math.random(), I/O, network calls
- RNG: which library, seed source, seed lifetime
- Reproducibility test: same input + seed → same output, byte-for-byte

## 3. State Model
The minimum state needed to run one tick:
- Entities (id + relevant attributes)
- World context (time, weather, modifiers)
- History accessible to the sim (e.g. recent form)

What is NOT in the sim state: anything not needed (avoid bloat).

## 4. Tick / Resolution Model
- Granularity (minute, day, season, turn)
- Steps in a single tick (pre, during, post)
- Order of operations across entities
- How conflicts are resolved (e.g. two players want the same item)

## 5. Mathematical Model
The core formulas. For each:
- Name + symbol
- Inputs and ranges
- Output and range
- Reference (paper, blog, prior game)
- Edge cases (division by zero, overflow, clamp ranges)

Common building blocks:
- **Elo ratings** for skill / strength comparison
- **Poisson** for count outcomes (goals, encounters)
- **Dixon-Coles** correction for low-count correlated outcomes
- **Beta-binomial** for percentage outcomes with uncertainty
- **Logistic** for probability curves
- **Age curve** for attribute progression (polynomial or piecewise linear)
- **Decay** for fatigue, form, morale

## 6. RNG Strategy
- Seeded by what? (e.g. world seed + tick number + entity id)
- One RNG stream or many? (per-entity streams avoid cross-coupling)
- Algorithm (xoshiro128** recommended; document trade-offs)

## 7. Event Pipeline
For sims that produce a stream of events (match ticker, daily log):
- Event types
- Schema for each event
- Persistence model (event sourcing? snapshot + log? append-only?)
- Consumer model (UI subscribes, jobs subscribe)

## 8. Tuning Knobs
The configurable values an economy / balance designer will adjust:
- Name, range, default, units
- What each one controls
- Interactions / coupling between knobs

## 9. Edge Cases
- Empty inputs (no players, no funds)
- Extreme values (rating 0, rating 99)
- Time singularities (skipping days, year rollover)
- Concurrent state (two sims running on adjacent entities)

## 10. Acceptance Criteria
Testable:
- Given specific input + seed, output matches a recorded golden file
- Statistical properties hold over N runs (e.g. home advantage produces
  X% home wins over 10k matches)
- Performance budget (one tick completes in <Y ms for Z entities)
- Memory budget

## 11. Dependencies
- Which other systems' state is read
- Which other systems' state is written
- Hard ordering vs eventual consistency

## 12. Open Questions
- Anything explicitly deferred
- Who decides what when
```

## Phase 4: Cross-Reference

Once the spec is complete:

1. Update the GDD's "Dependencies" section to reference this sim spec
2. Note in `production/session-state/active.md` that the sim design exists
3. If the system has tuning knobs that touch the economy, hand a summary
   to `economy-designer` for review
4. If the sim runs in `packages/shared/sim/` (Web engine) or another
   engine-specific location, note the target path in the spec

## Phase 5: Verdict

Ask: "Is this sim design ready to be implemented, or are there gaps?"

Possible outcomes:
- **READY** — spec is complete, hand to `/create-stories` once architecture catches up
- **NEEDS-RESEARCH** — at least one formula needs a research spike before commit
- **NEEDS-COORDINATION** — depends on a sibling system whose spec is missing

Record the verdict at the top of the file.

## Conventions

- Math notation: use prose + simple expressions; reserve LaTeX for
  formulas that genuinely benefit (most don't)
- Always cite sources for borrowed models (Elo, Dixon-Coles, etc.)
- Tuning knobs always include a default value and a sane range
- Determinism is not optional for shared / multiplayer sims — flag any
  proposal that requires `Math.random()` outside the sim's seeded RNG

## Notes

- This skill is engine-agnostic. The same sim spec implements identically
  whether the project is Godot, Unity, Unreal, or Web.
- For Web engine projects, sim code lives in `packages/shared/sim/` and
  is run authoritatively on `apps/api` (and optionally previewed on
  `apps/web`).
- For Godot/Unity/Unreal projects, follow the engine specialist's
  guidance on where pure sim code belongs (typically a static / utility
  module separate from scene-coupled gameplay code).

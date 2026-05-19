---
Story: CASCADE-ENGINE-009
Status: Pending
Type: Logic
GDD Requirement: cascade-engine.md §C5a, §C5b, §C16a, §C16b, §C17 — all direct (non-counterintuitive) chains in the catering/happiness/sponsor cluster
Governing ADR: ADR-002, ADR-003
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c5-c16-c17.test.ts
---

# Story: Chains C5a + C5b + C16a + C16b + C17 (catering, happiness, sponsor cluster)

## Goal

Implement 5 direct (non-counterintuitive) chains that drive the "morale/happiness pipeline":

- **C5a**: `catering_budget → team_fitness`, delay 1w, pure.
- **C5b**: `catering_budget → staff_morale`, delay 1w, pure.
- **C16a**: `player_happiness → team_fitness`, delay 0w, pure (always evaluates).
- **C16b**: `player_happiness → match_performance_index`, delay 0w, **guarded by `ctx.hasMatchThisWeek`**.
- **C17**: `sponsor_quality → player_happiness`, delay 1w, pure (monotonic positive — bigger sponsor → happier squad).

These form a partial chain: `catering_budget → staff_morale` (C5b) feeds the C4 multiplier (story 008); `sponsor_quality → player_happiness` (C17) feeds C16a/C16b. None are counterintuitive; they form the "expected" backbone that makes the counterintuitive chains stand out (per Core Rule 7).

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

- **C5a**: `delta = K_catering_fit × (prevState.catering_budget - 50) / 50`. `K_catering_fit = 3.0`. Delay 1. Pure.
- **C5b**: `delta = K_catering_moral × (prevState.catering_budget - 50) / 50`. `K_catering_moral = 4.0`. Delay 1. Pure.
- **C16a**: `delta = K_happy_fit × (prevState.player_happiness - 50) / 50`. `K_happy_fit = 4.0`. Delay 0. Pure. NO guard — always evaluates.
- **C16b**: same formula shape but `K_happy_perf = 7.0`. Delay 0. **guardFn: `(_, ctx) => ctx.hasMatchThisWeek`**.
- **C17**: `delta = K_sponsor_happy × prevState.sponsor_quality / 100`. `K_sponsor_happy = 5.0`. Delay 1. Pure. Monotonic positive (only goes up).

## Out of Scope

- C6, C7, C11, C14 (match-driven cluster) — story 010.
- C8, C15 (price/momentum) — story 011.

## Acceptance Criteria

1. **AC-C5a-baseline**: prevState `catering_budget=80` → C5a delta = `+1.8` (matches GDD). Delay 1, applied at W+1.
2. **AC-C5a-negative**: prevState `catering_budget=20` → C5a delta = `-1.8` (symmetric around 50).
3. **AC-C5a-equilibrium**: prevState `catering_budget=50` → C5a delta = `0.0`.
4. **AC-C5b-baseline**: prevState `catering_budget=20` → C5b delta = `-2.4` (matches GDD). Delay 1.
5. **AC-C5b vs C5a magnitude**: with the same catering_budget, |C5b delta| > |C5a delta| (4.0 > 3.0). Verify the asymmetry — "el staff es más sensible que los jugadores".
6. **AC-C16a-positive**: prevState `player_happiness=80` → C16a delta = `+2.4`. No guard — fires regardless of `hasMatchThisWeek`.
7. **AC-C16a-negative**: prevState `player_happiness=20` → C16a delta = `-2.4`.
8. **AC-C16b-with-match**: prevState `player_happiness=20`, `ctx.hasMatchThisWeek=true` → C16b delta = `-4.2` (matches GDD).
9. **AC-C16b-no-match**: prevState `player_happiness=20`, `ctx.hasMatchThisWeek=false` → C16b does NOT fire (`guardFn` returns false). `match_performance_index` is unchanged by C16b in this tick. The log contains a `'guarded'` entry for C16b.
10. **AC-C16b-positive**: prevState `player_happiness=80`, `ctx.hasMatchThisWeek=true` → C16b delta = `+4.2`.
11. **AC-C17-baseline**: prevState `sponsor_quality=60` → C17 delta = `+3.0` (matches GDD). Delay 1.
12. **AC-C17-zero**: prevState `sponsor_quality=0` → C17 delta = `0.0` (no sponsor → no boost).
13. **AC-C17-monotonic**: C17 delta is non-negative for any prevState.sponsor_quality in [0,100]. Verify with 5 spot values.
14. **AC-C16a always fires (no guard)**: in 100 consecutive `runTick` calls with `ctx.hasMatchThisWeek=false`, C16a fires every time. Distinct from C16b.
15. **Delay routing**: C5a, C5b, C17 produce entries in `newDelayedEffects` with `applyAt = ctx.currentWeek + 1`. C16a, C16b are delay 0 — direct deltaMap writes.
16. **Determinism**: all 5 chains are pure (no rng) — same prevState → identical deltas across runs.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c5-c16-c17.test.ts`:

- C5a spot values + delay routing (AC #1, #2, #3).
- C5b spot value + asymmetry vs C5a (AC #4, #5).
- C16a spot values, NO guard (AC #6, #7, #14).
- C16b spot values WITH guard active (AC #8, #10).
- C16b GUARDED scenario — fire suppressed when `hasMatchThisWeek=false` (AC #9).
- C17 spot values + monotonic (AC #11, #12, #13).
- Delay routing for delayed chains (AC #15).
- Determinism re-call (AC #16).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 010 (other guarded chains test the same guard mechanism). Story 014 (C16b's threshold-related effects flow through match-sim, not directly via the engine).

## Estimate

**1.5 days.** Five chains but all have identical structural shape (linear-ish, no piecewise, no noise). The C16b guard test is the most novel — verifies the guard skip path in the engine (story 005's machinery).

## Notes / Gotchas

- The split of C16 into C16a + C16b is documented in cascade-engine.md catalog and reaffirmed by the GDD's R3+R4 fixes. C16a always evaluates (fitness is built daily, including non-match weeks); C16b only on match weeks (player happiness shows up in performance only when there's a performance to show up in).
- AC-C16b's guard pattern is the SAME mechanism that gates C11 and C14 (story 010). The implementation of `guardFn` itself is in story 002; this story just exercises it.
- C17 is monotonic non-negative — `prevState.sponsor_quality / 100` is always in [0,1], multiplied by `K_sponsor_happy = 5.0` always in [0,5]. Add an explicit assertion in the test: `expect(delta).toBeGreaterThanOrEqual(0)` across all spot values. This is the canonical "sponsors only help, never hurt" invariant.
- Story 002's named-constants block should already include `K_catering_fit, K_catering_moral, K_happy_fit, K_happy_perf, K_sponsor_happy`. If any are missing, treat as a story 002 defect to fix before completing this story.

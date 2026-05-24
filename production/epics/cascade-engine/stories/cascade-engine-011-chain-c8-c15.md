---
Story: CASCADE-ENGINE-011
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-CTI-C8 (price-momentum interaction), AC-CTI-C15 (delayed price erosion), AC-DEL-04, AC-PLD-02 + cascade-engine.md §C8, §C15
Governing ADR: ADR-002, ADR-003 (Rule 5 delays)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c8-c15.test.ts
---

# Story: Chains C8 (price × momentum → attendance) + C15 (delayed price erosion) — both counterintuitive

## Goal

Implement the two price-related counterintuitive chains:

- **C8**: `fan_momentum × ticket_price_index → fan_attendance`, delay 0w, **counterintuitive interaction** — same price impacts attendance differently depending on momentum. Reads TWO nodes (`fan_momentum` is the primary `fromNode`; `ticket_price_index` is read via `ctx.prevState`).
- **C15**: `ticket_price_index → fan_momentum`, delay **2w**, **counterintuitive erosion** — only fires when price > T_price_danger=65; high prices erode momentum slowly with a 2-week lag. Pure (no noise).

These are anchor counterintuitive chains 3 and 4 of the 7 (C1b, C4, C6, C8, C12, C15, C18a per Core Rule 7). C15 is the project's longest-delay chain and is the canonical test for AC-DEL-04 and AC-PLD-02 (decisions cannot retroactively cancel queued effects).

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

**C8 transferFn** (delay 0):

```
const F_m = prevState.fan_momentum;
const TPI = prevState.ticket_price_index;
const attendance_base = (F_m / 100) * ATTEND_MAX_BASE + ATTEND_MIN_BASE;
const price_penalty = Math.max(0, TPI - 50) * (1 - F_m / MOMENTUM_TOLERANCE_DIVISOR);
const price_bonus = Math.max(0, 50 - TPI) * PRICE_BONUS_K;
const target = attendance_base + price_bonus - price_penalty;
return target - prevState.fan_attendance;   // delta = target − current
```

Constants: `ATTEND_MAX_BASE = 60`, `ATTEND_MIN_BASE = 5`, `MOMENTUM_TOLERANCE_DIVISOR = 120`, `PRICE_BONUS_K = 0.25`. C8's `fromNode` is `fan_momentum` (story 002), `toNode = fan_attendance`.

**C15 transferFn** (delay 2):
```
const TPI = prevState.ticket_price_index;
return -K_price_erosion * Math.max(0, TPI - T_price_danger);
```
Constants: `K_price_erosion = 0.12`, `T_price_danger = 65`. C15's `fromNode = ticket_price_index`, `toNode = fan_momentum`.

## Out of Scope

- Other counterintuitive chains — C12 (story 013), C18a (story 013).

## Acceptance Criteria

1. **AC-CTI-C8 high momentum + high price**: prevState `fan_momentum=80, ticket_price_index=70, fan_attendance=55`. Compute: `attendance_base = 80/100 × 60 + 5 = 53; price_penalty = max(0, 20) × (1 - 80/120) = 20 × 0.3333 = 6.667; price_bonus = 0; target = 53 + 0 - 6.667 = 46.333; delta = 46.333 - 55 = -8.667`. Tolerance ±0.05.
2. **AC-CTI-C8 low momentum + high price** (mandatory cross-verification): prevState `fan_momentum=20, ticket_price_index=70, fan_attendance=55`. Compute: `attendance_base = 20/100 × 60 + 5 = 17; price_penalty = max(0, 20) × (1 - 20/120) = 20 × 0.8333 = 16.667; price_bonus = 0; target = 17 + 0 - 16.667 = 0.333; delta = 0.333 - 55 = -54.667`. **MANDATORY cross-check (AC-CTI-C8 spec)**: `|delta(F_m=20)| > |delta(F_m=80)|` for the same price 70. I.e. 54.667 > 8.667. The low-momentum scenario produces FAR worse attendance.
3. **AC-CTI-C8 low price bonus**: prevState `fan_momentum=50, ticket_price_index=30, fan_attendance=30`. `attendance_base = 35; price_bonus = max(0, 20) × 0.25 = 5; price_penalty = 0; target = 40; delta = +10`.
4. **AC-CTI-C8 momentum protects**: `fan_momentum=100, ticket_price_index=70, fan_attendance=65` → `price_penalty = 20 × (1 - 100/120) = 20 × 0.1667 = 3.333` (small even at high price). Verify the protection effect is real — `price_penalty` decreases monotonically as `F_m` rises.
5. **C8 reads BOTH nodes via prevState**: in the same tick, a decision sets `ticket_price_index = 40` (from `prevState.ticket_price_index = 70`). C8's transferFn STILL reads 70 from prevState (Rule 3) — its delta computation uses TPI=70 not TPI=40. Verify with a runTick integration test.
6. **AC-CTI-C15 above threshold**: prevState `ticket_price_index=80` → C15 delta = `-1.8` (matches GDD `-K_price_erosion × max(0, 80-65) = -0.12 × 15`).
7. **AC-CTI-C15 below threshold**: prevState `ticket_price_index=60` → C15 delta = `0.0` (max(0, -5) = 0; prices below 65 don't erode).
8. **AC-CTI-C15 at threshold**: prevState `ticket_price_index=65` → C15 delta = `0.0` (boundary inclusive on the safe side).
9. **AC-DEL-04**: prevState `ticket_price_index=80` at W=1, empty buffer → in W=1 C15 queues effect with `applyAt=3, toNode='fan_momentum', delta=-1.8, edgeId='C15'`. At W=3 with that buffer, fan_momentum decreases by 1.8 (plus other edges).
10. **AC-PLD-02 (critical)**: prevState `ticket_price_index=80` at W=1, C15 queues `applyAt=3, delta=-1.8`. PlayerDecision in W=1 sets `ticket_price_index=40` (Step 3). At W=2 the buffer STILL contains the W=3 effect with delta=-1.8 (computed from 80). At W=3 fan_momentum decreases by 1.8 even though current TPI is 40. **Retroactive cancellation is forbidden**.
11. **C15 sustained pricing** (cascade-engine.md C15 example): `ticket_price_index=80` for 10 sustained weeks (no other writes to fan_momentum) → 10 queued effects each `-1.8` → total fan_momentum erosion across the 10-week span = `-18.0` net (when all 10 effects fire in their respective applyAt weeks).
12. **C15 delay routing**: C15 has delay 2 — evaluated at W=N, queued at W=N+2.
13. **Determinism**: both chains are pure (no rng) — same prevState → identical deltas across runs.
14. **C8 fan_attendance range**: per cascade-engine.md C8 nota (lines 372): delta math can be outside [−60,+60] under extremes (e.g. F_m=0, TPI=100 → target=−45; with A_prev=100 → delta=−145). Verify the engine does NOT clamp PER edge — the unclamped delta propagates and Step 4 clamps the nextState. Test: prevState `fan_momentum=0, ticket_price_index=100, fan_attendance=100` → C8 raw delta < -100; nextState.fan_attendance clamped to 0 (not negative).

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c8-c15.test.ts`:

- C8 high vs low momentum × high price cross-check (AC #1, #2).
- C8 low-price bonus (AC #3).
- C8 momentum protection (AC #4) — 5 spot values for fan_momentum.
- C8 prevState invariance under same-tick decision (AC #5).
- C15 threshold spot values (AC #6, #7, #8).
- AC-DEL-04 mirror (AC #9).
- AC-PLD-02 mirror (AC #10) — CRITICAL test for "retroactive cancellation forbidden".
- 10-week erosion (AC #11).
- Delay routing (AC #12).
- Determinism (AC #13).
- C8 unclamped delta + Step 4 clamping (AC #14).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 014 (fan_momentum thresholds 20/75 — C15 erosion is one of the paths there).

## Estimate

**2 days.** C8 reads TWO prevState nodes (extends the rng-injection / dual-read pattern). AC-PLD-02 is the canonical critical-correctness test — if it fails, the engine fundamentally violates ADR-003 Rule 5.

## Notes / Gotchas

- **Path-dependency interpretation**: C8 is the test bed for Core Rule 8 ("fan_momentum is the path-dependency root"). Same price input, different outcomes — exactly the kind of system fingerprint that creates "ajá" moments.
- C8's `delta` is `target - fan_attendance_prev`. This is a CONVERGENCE pattern (not an additive delta from a midpoint). When the engine's Step 4 clamping applies, the resulting fan_attendance can be very close to target even if delta was extreme.
- C8's `fromNode` in story 002 is `fan_momentum` (the primary driver), but the transferFn reads BOTH `fan_momentum` and `ticket_price_index` via `prevState`. Per ADR-003 Rule 10 spirit: the CascadeEdgeDef `fromNode` field is "the canonical 1-hop edge in a graph diagram"; multi-input reads are allowed and documented in code comments. C10 (multi-input via prevState) is the precedent.
- C15 is silent below 65 — this means tuning the danger threshold up (e.g. to 70) effectively disables the chain for moderate-pricing playthroughs. Document T_price_danger as a tuning knob in story 002's constants block.
- AC-PLD-02 is the most important correctness AC of this story. If C15 retroactively "fixed" its queued delta based on later decisions, the entire delay model would be broken (per ADR-003 Rule 5: "los efectos diferidos ya encolados no se cancelan retroactivamente").

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 14/14 passing
**Deviations**: None. AC-PLD-02 (retroactive cancellation forbidden) test passes — C15 effect queued at W=1 fires at W=3 with original delta even after mid-tick TPI decision.
**Test Evidence**: Logic — `packages/shared/tests/cascade-engine/chains-c8-c15.test.ts` — 16/16 passing (280/280 suite)
**Code Review**: Skipped (lean mode, autonomous run). Implementation verified against story formulas + 16 unit tests including critical AC-PLD-02 mirror.

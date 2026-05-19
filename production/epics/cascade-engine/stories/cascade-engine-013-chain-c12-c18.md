---
Story: CASCADE-ENGINE-013
Status: Pending
Type: Logic
GDD Requirement: AC-CTI-C12, AC-CTI-C18, AC-C18-01, AC-C18-02a, AC-C18-02b, AC-C18-03, AC-C18-04, AC-PLD-03 + cascade-engine.md §C12, §C18a, §C18b
Governing ADR: ADR-002, ADR-003 (Rule 5 guards), ADR-008 (BLOCKING threshold for corruption)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/chains-c12-c18.test.ts
---

# Story: Chains C12 (sobreentrenamiento desesperado) + C18a (corruption decay with guard) — counterintuitive cluster

## Goal

Implement the two remaining counterintuitive chains:

- **C12**: `consecutive_losses × training_intensity → team_fitness`, delay 1w, pure (no noise), with intensity_mod cutoff at T_desperation_threshold=50. Counterintuitive: same losing streak hurts more when training is high (sobreentrenamiento). **Player agency**: lowering training_intensity ≤ 50 cancels the damage entirely.
- **C18a**: `corruption_exposure` weekly decay, delay 0w, **guarded**: skip when `prevState.corruption_exposure ≥ 80` (the BLOCKING zone). Counterintuitive: getting too close to 80 actually prevents the decay from saving you.

C18b is NOT a cascade edge — it's the BLOCKING threshold response (event-system territory). Story 014 implements the BLOCKING threshold detection at CE=80. This story owns the C18a guard correctness.

## Scope

In `packages/shared/src/sim/cascade-graph.ts`:

**C12 transferFn** (delay 1, pure):

```
const CL = prevState.consecutive_losses;
const I_train = prevState.training_intensity;
const intensity_mod = Math.max(0, I_train - T_desperation_threshold) / (100 - T_desperation_threshold);
const drainShape = Math.pow(CL, DESPERATION_EXP) / Math.pow(10, DESPERATION_EXP);
return -K_desperation * drainShape * intensity_mod;
```

Constants: `T_desperation_threshold = 50`, `K_desperation = 10.0`, `DESPERATION_EXP = 1.5`.

C12's `fromNode = consecutive_losses` (the primary trigger), `toNode = team_fitness`. `training_intensity` is read via `ctx.prevState`.

**C18a transferFn** (delay 0):
```
return -K_corruption_decay * prevState.corruption_exposure;
```
**C18a guardFn**: `(prevState) => prevState.corruption_exposure < 80`.

Constant: `K_corruption_decay = 0.05`.

C18a `fromNode = toNode = corruption_exposure` (self-decay).

## Out of Scope

- C18b BLOCKING threshold detection — story 014.
- The event-system response (scandal event, fan_momentum -30 PlayerDecision) — outside this epic.

## Acceptance Criteria

1. **AC-CTI-C12 sobreentrenamiento**: prevState `consecutive_losses=5, training_intensity=80` → C12 delta = `-2.12`. (`intensity_mod = (80-50)/50 = 0.6; drainShape = 5^1.5 / 10^1.5 = 11.18/31.62 ≈ 0.3536; delta = -10.0 × 0.3536 × 0.6 = -2.121`. Tolerance ±0.01.)
2. **AC-CTI-C12 agency lever (zero)**: prevState `consecutive_losses=5, training_intensity=40` → C12 delta = `0.0`. **Mandatory cross-check**: lowering training_intensity below 50 with the SAME losing streak completely cancels the damage. Assert delta === 0 exactly.
3. **AC-CTI-C12 small streak**: prevState `consecutive_losses=1, training_intensity=80` → C12 delta ≈ `-0.19`. (`drainShape = 1^1.5/10^1.5 = 1/31.62 ≈ 0.0316; delta = -10 × 0.0316 × 0.6 = -0.19`.)
4. **AC-CTI-C12 worst case**: prevState `consecutive_losses=10, training_intensity=100` → C12 delta = `-10.0` (peor caso: `intensity_mod=1.0, drainShape=1.0`).
5. **AC-CTI-C12 at threshold**: prevState `consecutive_losses=5, training_intensity=50` → `intensity_mod = max(0, 0)/50 = 0` → delta = `0.0`. The threshold is **inclusive** of safe — exactly at 50, no damage.
6. **AC-CTI-C12 no losses**: prevState `consecutive_losses=0, training_intensity=100` → `drainShape = 0^1.5 = 0` → delta = `0.0`. Without a streak, no damage regardless of training.
7. **C12 delay routing**: C12 delay 1 — evaluated at W=N, applies at W=N+1.
8. **AC-PLD-03**: prevState `corruption_exposure=75` (< 80 → guard inactive), PlayerDecision `+12` on corruption_exposure. C18a decay aplica en Paso 2: `75 × 0.95 = 71.25`. PD `+12` en Paso 3 → 83.25 > 80. ThresholdCrossings (story 014) detects BLOCKING crossing.
9. **AC-C18-01**: prevState `corruption_exposure=78` (< 80), PD `+8`. C18a decay: `78 × 0.95 = 74.1`. PD +8 → 82.1. nextState.CE = 82.1 > 80 → BLOCKING crossing fires (story 014 verifies the crossing emission).
10. **AC-C18-01 boundary subcase**: prevState `corruption_exposure=78`, PD `+5`. C18a decay → 74.1. PD +5 → 79.1. Below 80 — NO crossing fires. (Per AC-C18-01 note: "para PlayerDecision ≤ +5, el decay absorbe suficiente que nextState < 80 y NO se detecta crossing — diseño intencional".)
11. **AC-C18-02a**: prevState `corruption_exposure=85` (≥ 80 → guard ACTIVE). C18a does NOT decay. 3 sustained ticks of CE=85 with no decisions → CE stays at 85 each tick. Log shows `'guarded'` entry for C18a in each tick.
12. **AC-C18-02b**: prevState `corruption_exposure=85` (guard active), PD `-10`. Step 2: guard active, no decay. Step 3: PD `-10`. nextState.CE = 75. **Important**: this is a downward BLOCKING crossing (85 → 75 crosses 80 going down) — story 014 emits a crossing with `direction='below'`.
13. **AC-C18-02b continuation** (W=2 of the same scenario): prevState.CE = 75 (< 80, guard inactive again). C18a decay: `75 × 0.95 = 71.25`. No decision. nextState.CE = 71.25. Guard correctly toggles back as CE crosses below 80.
14. **AC-C18-04**: prevState `corruption_exposure=60`, PD `-10` (e.g. director deportivo tier 3 reduces). Step 2: guard inactive, decay: `60 × 0.95 = 57`. Step 3: PD `-10` → 47. **NOTE**: the AC text says `nextState = 50`, but with decay applied first (per the guard's documented semantics), it's 47. Discrepancy: re-read AC-C18-04 — it says "el motor aplica el delta sin conocer su origen", implying the engine doesn't pre-decay before the PD. But our implementation DOES decay first (Step 2 happens before Step 3 in the algorithm). Resolution: the AC's "nextState = 50" comment is informal; the precise behavior is **decay then PD**, yielding 47. Document this in the story implementation; if user disagrees, escalate as an OQ-CASCADE clarification.
15. **C18a guard correctness invariant**: across all 100 ticks of an integration test with `corruption_exposure` oscillating around 80 (driven by decisions), the guard's binary toggle works: every tick where prevState.CE ≥ 80 has C18a guarded; every tick where prevState.CE < 80 has C18a fire with the decay formula.
16. **Determinism**: C12 and C18a are both pure (no rng) — same prevState → identical deltas.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/chains-c12-c18.test.ts`:

- AC-CTI-C12 spots (AC #1, #2, #3, #4, #5, #6).
- C12 delay routing (AC #7).
- C18a + PD interactions (AC #8, #9, #10, #11, #12, #13).
- AC-C18-04 (AC #14) — verify the "decay then PD" semantics, document as canonical.
- Guard correctness invariant — 100-tick oscillation (AC #15).
- Determinism (AC #16).

## Dependencies

- **Upstream blockers**: 002, 004, 005.
- **Downstream**: story 014 (consumes CE-crossing detection; AC-PLD-03, AC-C18-01, AC-C18-02b directly test the crossing emission — assertions on `TickResult.thresholdCrossings` live in story 014's tests, not this story's). Story 017 (end-to-end determinism).

## Estimate

**2 days.** The C18a guard semantics are subtle (especially AC-C18-04's "decay then PD" ordering and the 100-tick oscillation test). Worth spending the time to lock in correctness because the corruption_exposure path is the highest-stakes BLOCKING event in MVP.

## Notes / Gotchas

- **C12 player agency**: the design intent (cascade-engine.md §C12) is that the player can SEE the streak in the HUD and choose to lower training_intensity to break the chain. AC #2 is the proof — at training ≤ 50, the damage is zero regardless of streak length. This is the "agency lever" pillar in action.
- **C18a guard purpose** (cascade-engine.md §C18a guardia): "C18a NO evalúa cuando prevState.corruption_exposure ≥ 80. Si la corrupción ya está en zona BLOCKING, el decay comienza desde el tick siguiente al escándalo." The guard exists so that the BLOCKING threshold detection (story 014) sees a CLEAN crossing — the decay doesn't smooth the crossing line. Without this guard, CE=80.5 → 80.5 × 0.95 = 76.5 → ThresholdCrossing might not fire if other writes bumped it above 80 first.
- **DESPERATION_EXP = 1.5**: the exponent makes the damage grow super-linearly with the streak. `5^1.5 ≈ 11.18, 10^1.5 ≈ 31.62`. The drainShape is normalized to [0, 1] by dividing by `10^1.5`. Document the normalizer explicitly in story 002's constants block.
- AC-C18-04 ambiguity: this story's resolution is "decay then PD = 47, not 50". If a follow-up review wants 50 (i.e. PD applied before decay), it requires changing the algorithm Step ordering — a major behavioral change. Surface this as a question to the user during implementation if uncertain. Default to the cleaner "decay then PD" interpretation, document in the test, surface in the next-sprint retro.

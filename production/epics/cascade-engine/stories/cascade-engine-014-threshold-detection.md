---
Story: CASCADE-ENGINE-014
Status: Pending
Type: Logic
GDD Requirement: AC-THR-01, AC-THR-02, AC-THR-03, AC-THR-04, AC-THR-05, AC-THR-06, AC-PLD-03, AC-C18-01, AC-C18-02b, AC-C18-03 + cascade-engine.md §Threshold Crossings + ADR-008
Governing ADR: ADR-008 (BLOCKING vs ADVISORY, advance() stop semantics)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/threshold-detection.test.ts
---

# Story: ThresholdCrossing Detection (runTick Step 5) per ADR-008

## Goal

Implement Step 5 of `runTick()`: detect ThresholdCrossings by comparing `prevState[nodeId]` and `nextState[nodeId]` (post-clamp) against the configured thresholds for each node. The threshold config is the table from cascade-engine.md §Threshold Crossings (7 thresholds across 5 nodes). Per ADR-008, BLOCKING crossings interrupt the advance loop; ADVISORY crossings just enrich the result.

This story unlocks AC-THR-* and the threshold-detection halves of AC-PLD-03 and AC-C18-*. Story 013 already implements C18a; this story adds the BLOCKING detection at CE=80.

## Scope

In `packages/shared/src/sim/cascade-engine.ts`:

- `ThresholdConfig` type:
  ```
  {
    nodeId: NodeId;
    threshold: number;
    direction: 'above' | 'below';
    priority: 'BLOCKING' | 'ADVISORY';
    reason: string;   // for staff-message templates / event payload
  }
  ```
- `ThresholdCrossing` type:
  ```
  {
    nodeId: NodeId;
    threshold: number;
    direction: 'above' | 'below';
    priority: 'BLOCKING' | 'ADVISORY';
    previousValue: number;
    newValue: number;
    reason: string;
  }
  ```
- `THRESHOLDS_MVP: readonly ThresholdConfig[]` — the 7 entries from the GDD table:
  - `corruption_exposure` > 80 BLOCKING (Escándalo de corrupción)
  - `fan_momentum` < 20 BLOCKING (Fan base en crisis)
  - `player_happiness` < 25 BLOCKING (Crisis del vestuario)
  - `fan_momentum` > 75 ADVISORY (Momentum muy alto)
  - `injury_risk` > 70 ADVISORY (Riesgo de lesiones crítico)
  - `squad_available_pct` < 60 ADVISORY (Plantilla muy mermada)
  - `field_quality` < 30 ADVISORY (Campo deteriorado)
- `detectCrossings(prevState, nextState, thresholds): ThresholdCrossing[]` — for each config, check:
  - direction `above`: `prevState[node] <= threshold && nextState[node] > threshold` (new transition upward)
  - direction `below`: `prevState[node] >= threshold && nextState[node] < threshold` (new transition downward)
  - Returns crossings only on NEW transitions. If both prev and next are above (or both below), no crossing (AC-THR-04, AC-THR-05).
- Wire Step 5 in `runTick()`: after Step 4 clamps `nextState`, call `detectCrossings(prevState, nextState, THRESHOLDS_MVP)` and include in `TickResult.thresholdCrossings`.

## Out of Scope

- The advance loop's reaction to BLOCKING (stop loop, persist pending event) — that's the game-clock-service in ADR-008, outside this epic.
- Staff-message generation from crossings — staff-system epic.

## Acceptance Criteria

1. **THRESHOLDS_MVP.length === 7** (matches GDD table exactly).
2. **AC-THR-01**: prevState `fan_momentum=22`, nextState `fan_momentum=18` → crossings contains exactly 1 entry: `{nodeId:'fan_momentum', priority:'BLOCKING', direction:'below', previousValue:22, newValue:18, threshold:20}`. (`prev >= 20 && next < 20`.)
3. **AC-THR-02**: prevState `fan_momentum=73`, nextState `fan_momentum=77` → 1 entry with `priority:'ADVISORY', direction:'above', threshold:75`.
4. **AC-THR-03 (multi-node single tick)**: prevState `{player_happiness:30, injury_risk:65, ...}`, nextState `{player_happiness:22, injury_risk:72, ...}` → 2 entries, one per node, with the correct priorities.
5. **AC-THR-04 (no double-fire down)**: prevState `fan_momentum=18` (ALREADY below 20), nextState `fan_momentum=14` → 0 crossings for fan_momentum. (prev was already < 20 → no NEW transition.)
6. **AC-THR-05 (no double-fire up)**: prevState `corruption_exposure=82`, PD `+5` → nextState 87 → 0 crossings for corruption_exposure. (prev was already > 80.)
7. **AC-THR-06 (no spurious crossings)**: 100-tick run with `defaultWorldState()` + `hasMatchThisWeek=false` + `ctx.rng()=0.5` (noise=0) + no decisions → `TickResult.thresholdCrossings` is empty in every tick. Verifies that the default state is stable and never spuriously fires a threshold.
8. **AC-PLD-03 mirror (story 013's CE crossing)**: prevState CE=75, PD `+12`. Step 2: decay → 71.25. Step 3: PD → 83.25. Step 4: clamp → 83.25. Step 5: detect CE crossed 80 (prev=75 < 80, next=83.25 > 80) → crossings contains 1 BLOCKING entry.
9. **AC-C18-02b downward crossing**: prevState CE=85, PD `-10`. Step 2: guard active (story 013), no decay → still 85. Step 3: PD `-10` → 75. Step 4: clamp → 75. Step 5: prev=85 > 80, next=75 < 80 → BLOCKING `direction:'below'` crossing.
10. **AC-C18-03 (chained crossings)**: prevState `fan_momentum=25` (above the BLOCKING at 20), C18b event applies PD `-30` → nextState clamped to 0. Step 5: prev=25 >= 20, next=0 < 20 → BLOCKING `direction:'below'` for fan_momentum. **Two crossings can happen in same tick**: the CE crossing (which triggered the scandal) AND the fan_momentum crossing (from the scandal's fallout).
11. **AC-THR-06 precondition test (cross-story)**: with `hasMatchThisWeek=false`, C11/C14/C16b guarded → MPI stays at 50 → C6 produces delta=0 → fan_momentum stable at 60. No threshold fired across 100 ticks. (This story owns the assertion; the conditions are produced by stories 005, 009, 010.)
12. **Threshold boundary inclusivity**: prev=20, next=19 → BLOCKING fires (prev≥threshold, next<threshold). prev=20, next=20 → no crossing (no transition). prev=21, next=20 → no crossing (next NOT strictly below). Document the inclusivity semantics in code: direction `below` is `prev >= threshold && next < threshold` (strict `<`). direction `above` is `prev <= threshold && next > threshold` (strict `>`).
13. **TickResult.thresholdCrossings is an array (never undefined/null)**: even on a tick with zero crossings, the field is `[]`. Downstream consumers (event-system, hud-ui) can iterate without null checks.
14. **CrossingReason field populated**: each emitted ThresholdCrossing has a `reason` string matching the GDD table column (e.g. "Escándalo de corrupción — para el advance loop, evento narrativo forzado"). Staff-message templates use this — keep the strings exact.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/threshold-detection.test.ts`:

- THRESHOLDS_MVP length + content spot-check (AC #1).
- AC-THR-01 (AC #2).
- AC-THR-02 (AC #3).
- AC-THR-03 (AC #4) — multi-node single tick.
- AC-THR-04 (AC #5) — no double-fire down.
- AC-THR-05 (AC #6) — no double-fire up.
- AC-THR-06 (AC #7, #11) — 100-tick stability.
- AC-PLD-03 (AC #8).
- AC-C18-02b (AC #9).
- AC-C18-03 chained crossings (AC #10).
- Boundary inclusivity (AC #12).
- Non-null array (AC #13).
- Reason strings (AC #14).

## Dependencies

- **Upstream blockers**: 001 (types), 002 (graph), 004 (runTick skeleton with Step 5 stub), 005 (Step 2/3), 013 (C18a guard — required for AC-C18-02a/b chain).
- **Downstream**: ADR-008 advance loop (separate epic — consumes TickResult.thresholdCrossings).

## Estimate

**2 days.** Detection logic is straightforward; the test matrix is the bulk of work (12 distinct scenarios, including the 100-tick stability test that pulls in nearly every other chain).

## Notes / Gotchas

- **Direction semantics matter**: `'above'` means "crossing UP through the threshold" — `prev <= threshold && next > threshold`. `'below'` means "crossing DOWN" — `prev >= threshold && next < threshold`. The strict-vs-non-strict mix is intentional: a node sitting exactly at the threshold (prev=threshold) should fire on the NEXT tick when it moves through. AC #12 codifies this.
- **Ordering of crossings in the array**: stable, by config order (which matches GDD table order). This makes test assertions deterministic.
- **BLOCKING vs ADVISORY**: the engine itself doesn't distinguish behavior — both go in the same array. ADR-008's game-clock-service is what stops the loop on BLOCKING. This story makes the data available; downstream consumes.
- **Threshold equality at boundary**: cascade-engine.md AC-THR-06 says the default state must not produce crossings. The default values (e.g. `fan_momentum=60`, `injury_risk=20`) are all strictly inside their threshold ranges, so this is automatic — but worth verifying explicitly (AC #7).
- **The CE=80 boundary** is the only one where the guard from story 013 interacts: the guard prevents decay when prev≥80, so AC-C18-02a tests "CE stays at 85 indefinitely" — no crossing because prev=85 AND next=85 (both above). Story 013's guard correctness is a precondition for this story's AC #6.

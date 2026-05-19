---
Story: CASCADE-ENGINE-003
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-DEL-01, AC-DEL-02, AC-DEL-03, AC-DEL-04, AC-DEL-05, AC-SER-04
Governing ADR: ADR-003 (Core Rule 5, delays as design intent), ADR-005 (persistence)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/cascade-engine/delayed-effects-buffer.test.ts
---

# Story: DelayedEffectsBuffer Data Structure + JSON Schema

## Goal

Define and validate the `DelayedEffect` and `DelayedEffectsBuffer` types and their Zod JSON schemas. The buffer is the carrier of every delay > 0 across the entire engine — C1a (1w), C4 (1w), C5a (1w), C5b (1w), C9a (1w), C15 (2w), C17 (1w). Without a correct buffer model, every delay-bearing chain test (006, 008, 009, 011, 012) is unverifiable.

This story does NOT implement persistence (story 015) or the consumption logic in `runTick()` Step 1 (story 004). It only defines the data shape, helper functions to enqueue/dequeue, and the Zod schema for round-trip safety.

## Scope

In `packages/shared/src/sim/delayed-effects.ts` (new file):

- `DelayedEffect` type:
  ```
  {
    applyAt: number;     // absolute week W when the delta is consumed
    toNode: NodeId;      // target node
    delta: number;       // signed real number (no clamping until Step 4)
    edgeId: string;      // for CascadeLog audit trail
  }
  ```
- `DelayedEffectsBuffer` — `readonly DelayedEffect[]` (array, not Map — JSON-friendly).
- `DelayedEffectJsonSchema` and `DelayedEffectsJsonSchema` — Zod schemas. Numbers allow negative deltas (verified by AC-SER-04).
- Helpers (all pure):
  - `popEffectsDueAt(buffer, week): { due: DelayedEffect[]; remaining: DelayedEffect[] }` — splits the buffer into effects with `applyAt === week` (consumed) and the rest (carried forward). Used by Step 1 of `runTick()`.
  - `enqueueEffect(buffer, effect): DelayedEffectsBuffer` — returns a NEW array (no mutation; ADR-002 determinism + ADR-003 Rule 3 spirit).
  - `serializeBuffer(buffer): string` and `deserializeBuffer(json): DelayedEffectsBuffer` — JSON wrappers around the Zod schema; `deserializeBuffer` throws on `null` deltas / malformed objects (AC-SER-03 sibling).

## Out of Scope

- DB persistence wiring (story 015 — append-only `world_snapshots` row).
- The `runTick()` Step 1 caller that uses `popEffectsDueAt` (story 004).

## Acceptance Criteria

1. `DelayedEffect` permits negative `delta` values (C1b, C4 in bad range, C12, C15, C18a all produce negative deltas in the buffer).
2. `popEffectsDueAt([{applyAt:2,toNode:'field_quality',delta:9,edgeId:'C1a'},{applyAt:5,toNode:'fan_momentum',delta:-1.8,edgeId:'C15'}], 2)` returns `{ due: [<applyAt=2 entry>], remaining: [<applyAt=5 entry>] }`.
3. `popEffectsDueAt(buffer, 3)` with the above input returns `{ due: [], remaining: [both entries] }` — past-week effects are NOT silently dropped (AC-DEL-03 invariant).
4. `popEffectsDueAt` does NOT consume effects with `applyAt < currentWeek` either (those are an error condition — log + skip, but do not apply retroactively).
5. `enqueueEffect` returns a new array; the original buffer is `===` unchanged.
6. `DelayedEffectJsonSchema.parse({applyAt: null, ...})` throws a `ZodError` — null fields fail validation.
7. `serializeBuffer` → `deserializeBuffer` round-trip preserves `applyAt`, `toNode`, `delta`, `edgeId` exactly. Test with a buffer of 3 effects including one negative delta (AC-SER-04 mirror).
8. Buffer carries an effect with `applyAt = W + 2` correctly across two `popEffectsDueAt` calls (one at W+1 returning empty `due`, one at W+2 returning the effect).

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/delayed-effects-buffer.test.ts`:

- `popEffectsDueAt` happy path (AC #2).
- Future-week effect not consumed at earlier week (AC #3, #8).
- Past-week effect not consumed (AC #4) — verifies the bug "applyAt < currentWeek is silently consumed" cannot occur.
- `enqueueEffect` returns a new reference (AC #5).
- Zod rejects null (AC #6).
- Round-trip test with negative delta (AC #7).

## Dependencies

- **Upstream blocker**: CASCADE-ENGINE-001 (imports `NodeId`).
- **Downstream blockers**: 004 (runTick Step 1 uses `popEffectsDueAt`), 015 (persistence wires `serializeBuffer`/`deserializeBuffer`).

## Estimate

**1 day.** Small pure data module; well-scoped helpers; round-trip test.

## Notes / Gotchas

- The buffer is an array, not a Map. Per control-manifest Forbidden, JSON-serialized payloads must not contain `Map<>`. The buffer is serialized into `world_snapshots.delayed_effects` per ADR-005.
- `popEffectsDueAt` returns immutable copies. The `runTick()` caller composes the `remaining` array with `newDelayedEffects` from Step 2's delay-routed edges to produce the next tick's buffer.
- Zod schemas live in this file; the API layer (story 015) re-uses them at the read boundary — no duplicate schemas.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 8/8 passing
**Deviations**: None
**Scope note**: `cascade-types.ts` forward-ref `DelayedEffect` updated to align field names (`applyAtWeek`→`applyAt`, `nodeId`→`toNode`, `source`→`edgeId`). Comment in cascade-types.ts already anticipated this update (story 003). 110/110 total package tests pass.
**Test Evidence**: Logic — unit test at `packages/shared/tests/cascade-engine/delayed-effects-buffer.test.ts` — 22/22 passing
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, all suggestions applied)

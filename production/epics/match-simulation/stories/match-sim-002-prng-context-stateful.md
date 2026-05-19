---
Story: MATCH-SIM-002
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-01 (determinism with default decisions), AC-MATCH-02 (determinism with scripted decisions across pause boundaries)
Governing ADR: ADR-002 (createSimContext + seedrandom discipline), ADR-013 (Option B PRNG state persistence)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/prng-state.test.ts
---

# Story: Stateful PRNG Factory + Serialization for Re-enqueue

## Goal

Provide a `createMatchSimContext(seed: string)` factory that constructs a `SimContext` whose PRNG can be **serialized** (`rngState: string`) at any point and **rehydrated** to continue the same stream — the cornerstone of ADR-013 Option B (re-enqueue determinism across pause boundaries).

ADR-002's `createSimContext()` uses `seedrandom(seed, { state: false })` — which does NOT support `.state()` (returns `undefined`). The match worker needs a separate factory that uses `{ state: true }`. The slice hit this exact gotcha and documented the workaround.

## Scope

In `packages/shared/src/sim/sports/football/match-prng.ts` (new):

- `createMatchSimContext(seed: string, worldClock: number): SimContext` — returns `{ seed, worldClock, rng }` where `rng` is `seedrandom(seed, { state: true })`. The returned PRNG callable supports `.state()` natively.
- `serializeRngState(rng: PRNG): string` — returns `JSON.stringify(rng.state())`.
- `rehydrateRng(seed: string, state: string): PRNG` — returns `seedrandom('', { state: JSON.parse(state) })`. The seed argument to `seedrandom` is ignored when `state` is provided (verified by slice); we pass the original seed only for debugging.
- `createMatchSimContextFromSnapshot(seed: string, worldClock: number, rngState: string): SimContext` — same shape as `createMatchSimContext` but rehydrates from a serialized state.

In `packages/shared/package.json`:

- Pin `seedrandom@3.0.5` **exactly** (no `^`) — per GDD R4 warning: "un cambio de versión menor puede alterar el formato de estado serializado e invalidar todos los snapshots live."

## Out of Scope

- ADR-002 amendment (sync chore — separate from this story).
- DB persistence of `rngState` (story 015).
- Integration with the match worker (story 016).

## Acceptance Criteria

- [ ] **Stream determinism**: `createMatchSimContext('seed-A', 0).rng()` and a fresh `createMatchSimContext('seed-A', 0).rng()` produce the same first 1000 values.
- [ ] **State capture works**: `ctx.rng.state()` returns a non-undefined object (the very bug the slice documented). Type: `{ i: number; j: number; S: number[] }` per seedrandom internals.
- [ ] **Round-trip determinism (AC-MATCH-02 foundation)**: Generate 45 rng() values from `ctx1 = createMatchSimContext('seed-A', 0)`. Capture `state = serializeRngState(ctx1.rng)`. Construct `ctx2 = createMatchSimContextFromSnapshot('seed-A', 0, state)`. Generate 45 more values from `ctx2.rng`. Generate 90 values from a fresh `ctx3 = createMatchSimContext('seed-A', 0)`. **Then** the concatenated [ctx1 first 45 + ctx2 next 45] equals ctx3's 90 values, element-by-element.
- [ ] **JSON shape**: `JSON.parse(serializeRngState(rng))` has keys `i`, `j`, `S` (or whatever seedrandom @3.0.5 exposes — verify against slice's working serialization).
- [ ] **`seedrandom` is pinned exactly**: `packages/shared/package.json` shows `"seedrandom": "3.0.5"` (no `^`, no `~`). A unit test reads the package.json and asserts the value.
- [ ] **No `Math.random()` in this file**: lint rule + grep check.

## Implementation Notes

*From ADR-013 §PRNG Reproducibility:*

- "Option B: Persist PRNG state. MatchSessionSnapshot includes the serialized PRNG state. seedrandom supports serialization natively via `.state()` and `seedrandom('', { state })`."
- Option A (fixed rng() consumption per tick) was rejected as brittle. Do NOT implement that pattern.

*From GDD R4 R6:*

- ADR-002 still uses `{ state: false }`. After this story, the slice's match worker creates its own context (not `createSimContext` from ADR-002). ADR-002 should be amended in a sync chore to accept a `{ persistState?: boolean }` parameter — out of scope for this story.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/prng-state.test.ts`:

- `createMatchSimContext` produces deterministic streams (1000 values match across two instances).
- `.state()` returns defined object (the slice gotcha — REGRESSION TEST).
- Serialize → rehydrate → continuation produces identical sequence to a fresh straight-through generation. This is the canonical "Option B works" test.
- `seedrandom` version is pinned in `package.json`.

## Dependencies

- **Upstream**: 001 (no type imports yet, but follows after types are defined).
- **Downstream blockers**: 013 (simulateMatch — calls `createMatchSimContext`), 014 (MatchSession FSM transitions persist `rngState`), 016 (match worker — rehydrates `rngState`), 017 (Hono routes — does not directly rehydrate but creates context on `/start`), 018 (determinism integration test — proves pause-and-resume == one-shot).

## Estimate

**1 day.** Small module, but the AC-MATCH-02 cornerstone test (round-trip continuation) is the critical correctness gate. Budget time for chasing the seedrandom typing quirks (slice has the playbook).

## QA Test Cases

**Test file**: `packages/shared/tests/match-sim/prng-state.test.ts`
_(Use `packages/shared/tests/match-sim/` not `tests/unit/match-sim/`)_

**Estimated test count**: ~8 unit tests

### PRNG factory and serialization
- `test_match_sim_context_stream_determinism_1000_values`: two fresh contexts with same seed produce identical first 1000 rng() values
- `test_match_sim_context_rng_state_not_undefined`: `ctx.rng.state()` is NOT undefined — catches the documented gotcha
- `test_match_sim_context_state_json_has_seedrandom_keys`: parsed state has keys i, j, S (seedrandom@3.0.5 shape)
- `test_match_sim_context_round_trip_determinism_45_plus_45_equals_90`: ctx1[0..44] + ctx2[45..89] == ctx3[0..89] (AC-MATCH-02 cornerstone)
- `test_match_sim_context_rehydrated_continues_at_position_46`: snapshot from position 45 → rehydrated ctx produces value [45], not [0]
- `test_seedrandom_version_pinned_exactly_no_caret`: package.json has `"seedrandom": "3.0.5"` — no ^ or ~ (prevents silent state-format breaks in production)
- `test_no_math_random_in_match_prng_file`: grep/static assertion — no Math.random() in match-prng.ts (control-manifest)

## Notes / Gotchas

- **The slice gotcha**: `seedrandom(seed)` (no options) returns a PRNG where `.state()` is `undefined`. This is silent — no error thrown. The slice's match worker was broken until `{ state: true }` was added. This story enshrines that fix.
- **`seedrandom('', { state: parsedState })` ignores the empty-string seed** — the state alone determines the next value. Slice verified.
- **TypeScript types for seedrandom@3.0.5**: `@types/seedrandom` types `.state()` as `{ i: number; j: number; S: number[] }` but the `state` option type on the factory is loose. Use a typed wrapper to keep call sites clean.
- **Version pin**: if anyone adds `"seedrandom": "^3.0.5"` later (npm install --save), patch upgrades that change the state shape would invalidate all in-flight live matches in production. The exact pin + the unit test gating it is the trip-wire.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 6/6 passing
**Deviations**:
  - ADVISORY: `createMatchSimContext` returns `{ ctx, rng }` instead of just `SimContext` — exposes raw PRNG for serialization without changing the SimContext interface. Documented in JSDoc.
  - ADVISORY: `prevState: defaultWorldState()` is a placeholder — story 013 (match worker) will pass the real preMatchSnapshot WorldState.
**Test Evidence**: Logic — `packages/shared/tests/match-sim/prng-state.test.ts` — 9/9 passing (227/227 suite)
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, _seed param, carry comment, regex hardened)

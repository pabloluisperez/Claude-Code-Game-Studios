---
Story: MATCH-SIM-004
Status: Pending
Type: Logic
GDD Requirement: AC-MATCH-09 (F3 initial momentum in [45,55]), AC-MATCH-10 (F4 momentum clamped [20,80])
Governing ADR: ADR-007 (FootballPlugin formulas), ADR-002 (deterministic rng())
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/momentum.test.ts
---

# Story: F3 home_momentum_initial + F4 momentum_delta (with 3-5-2 formation amplifier)

## Goal

Implement the two momentum formulas:

- **F3**: `home_momentum_initial = 50 + (field_quality - 50)/100 × 5 + (fan_attendance - 50)/100 × 5` — derived from WorldState at match start.
- **F4**: per-tick `momentum_delta`, driven by midfielder passing/vision balance plus a `rng() × 2 - 1` noise term, with the **3-5-2 amplifier**: `formation_momentum_mod = 1.1` if `homeFormation === '3-5-2'` else `1.0`. The momentum is then clamped to `[20, 80]`.

Both functions read WorldState (read-only) and home/away midfielders. F4 is the FIRST per-tick formula that consumes `ctx.rng()` — its discipline (one `rng()` call per tick, regardless of branch) anchors AC-MATCH-01/02 determinism.

## Scope

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function homeMomentumInitial(snapshot: PreMatchSnapshot): number` — F3. Output range invariant [45, 55] for `field_quality, fan_attendance ∈ [0, 100]`.
- `export function momentumDelta(ctx: SimContext, homeMids: PlayerStats[], awayMids: PlayerStats[], homeFormation: FormationPreset): number` — F4 single-tick delta. Calls `ctx.rng()` **exactly once** at the noise term. The 3-5-2 amplifier multiplies BOTH `pass_home` and `vis_home` contributions (`formation_momentum_mod_home × pass_home`, `... × vis_home`).
- `export function applyMomentumDelta(prev: number, delta: number): number` — `clamp(prev + delta, 20, 80)`.

In `packages/shared/src/sim/sports/football/football-constants.ts` (new — referenced by future stories):

- `FORMATION_MOMENTUM_MOD: Record<FormationPreset, number>` — `{ '4-4-2': 1.0, '4-3-3': 1.0, '3-5-2': 1.1, '5-3-2': 1.0 }`. Used by F4 only.

## Out of Scope

- F5 P_attack (story 005) — consumes `home_momentum[t]` but does not modify it.
- Cross-tick momentum accumulation (lives in the per-tick loop, story 013).
- Substitution effects on midfielder composition (story 014 — substitutions replace players in `currentLineupHome`; F4 reads the current state of MIDs each tick).

## Acceptance Criteria

- [ ] **AC-MATCH-09**: `homeMomentumInitial({ field_quality: 70, fan_attendance: 60 })` = `51.5` (exact). For any `field_quality, fan_attendance ∈ [0, 100]`, the output is in `[45, 55]` inclusive (sample 10,000 random pairs).
- [ ] **AC-MATCH-10**: Given a home team with `passing=95, vision=95` for all 4 MIDs vs. an away team with `passing=5, vision=5`, simulate 90 ticks of momentum starting from `home_momentum_initial = 50`. Assert `min(history) >= 20` AND `max(history) <= 80` (hard clamp). Reverse the matchup (weak home vs strong away) — assert symmetric invariant on the lower bound.
- [ ] **3-5-2 amplifier**: with `homeFormation = '3-5-2'`, the technique-driven component of `momentumDelta` (with the same MID stats and `rng()=0.5` → noise=0) is `1.1×` the same delta with `homeFormation = '4-4-2'`. Test with `pass_home=70, pass_away=50, vis_home=60, vis_away=50`: 4-4-2 delta (excluding rng) = `(20/100)×3 + (10/100)×2 = 0.6 + 0.2 = 0.8`; 3-5-2 delta = `(77-50)/100×3 + (66-50)/100×2 = 0.81 + 0.32 = 1.13`.
- [ ] **3-5-2 mod applies to home only**: `awayFormation = '3-5-2'` does NOT amplify the away midfielders' contribution. (Per GDD F4 — the variable is `formation_momentum_mod_home`, not symmetric.)
- [ ] **Single `rng()` call per tick**: spy on `ctx.rng` — `momentumDelta` invokes it exactly once. CRITICAL for AC-MATCH-01/02 determinism across pause boundaries.
- [ ] **Noise range**: with `rng()` returning `0`, the noise contribution is `-1`. With `rng()` returning `0.999...`, the noise contribution is `+1` (or `0.998` — half-open interval). Verifies the `rng() × 2 - 1` mapping.
- [ ] **Clamp invariant**: `applyMomentumDelta(80, +10)` = `80`. `applyMomentumDelta(20, -10)` = `20`. `applyMomentumDelta(50, 0)` = `50`.
- [ ] **Empty-MIDs guard**: if `homeMids.length === 0` (edge: all home MIDs sent off), the `avg()` helper returns 0 (per the slice's helper convention); `pass_home = 0`; the delta still computes without `NaN`.

## QA Test Cases

**Test file**: `packages/shared/tests/match-sim/momentum.test.ts`
_(Use `packages/shared/tests/match-sim/` not `tests/unit/match-sim/`)_

**Estimated test count**: ~12 unit tests

### F3 — homeMomentumInitial
- `test_f3_exact_value_known_inputs`: homeMomentumInitial({field_quality:70, fan_attendance:60}) = 51.5 (AC-MATCH-09)
- `test_f3_range_invariant_10000_random_pairs`: output ∈ [45, 55] for field_quality, fan_attendance ∈ [0,100]

### F4 — momentumDelta + applyMomentumDelta
- `test_f4_example_from_gdd_implementation_notes`: pass=65, away_pass=60, vis=60, away_vis=57, rng=0.6, 4-4-2 → delta=0.41
- `test_f4_90_tick_simulation_hard_clamp`: dominant vs weak — all momentum values ∈ [20, 80] (AC-MATCH-10)
- `test_f4_352_amplifier_is_1_1x_vs_442`: same MID stats, 3-5-2 → 1.1× the 4-4-2 technique component (noise=0)
- `test_f4_352_applies_to_home_only`: awayFormation='3-5-2' → no amplifier on away contribution
- `test_f4_single_rng_call_per_tick`: vi.fn spy on ctx.rng → called exactly once per momentumDelta call (CRITICAL for AC-MATCH-01/02)
- `test_f4_noise_rng_0_gives_minus_1`: noise = -1.0 with rng()=0
- `test_f4_noise_rng_1_gives_plus_1`: noise ≈ +1.0 with rng()=0.999
- `test_f4_clamp_at_max`: applyMomentumDelta(80, +10) = 80
- `test_f4_clamp_at_min`: applyMomentumDelta(20, -10) = 20
- `test_f4_no_nan_when_home_mids_empty`: homeMids=[] → delta computes without NaN

## Implementation Notes

*From GDD F3 + F4:*

- F4 example: `pass_home=65, pass_away=60, vis_home=60, vis_away=57, rng()=0.6, 4-4-2`: `(65-60)/100×3.0 + (60-57)/100×2.0 + 0.2 = 0.41`. Use this as a unit test fixture.
- The 3-5-2 amplifier is the slice-validated technique-bonus mechanism. Other formations do NOT modify momentum (mod = 1.0).
- The rng() call must happen unconditionally — do NOT short-circuit "if home strongly dominates, skip noise". Determinism contract requires one rng() per tick.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/momentum.test.ts`:

- AC-MATCH-09 exact value + range invariant over 10,000 samples.
- AC-MATCH-10 90-tick simulation, dominant-vs-weak both directions.
- 3-5-2 amplifier comparison test (4-4-2 vs 3-5-2 with identical MIDs).
- 3-5-2 applies to home only (awayFormation 3-5-2 produces baseline delta).
- rng() invocation count: exactly 1 per momentumDelta call (use vi.fn spy).
- Noise mapping: rng=0 → -1, rng=0.999 → +0.998.
- Clamp on edges (50+10 at 80; 50-10 at 20; 50+0 = 50).
- Empty MIDs → no NaN.

## Dependencies

- **Upstream**: 001 (types), 002 (PRNG factory for tests), 003 (no direct dep, but F4 conventionally follows F3).
- **Downstream blockers**: 005 (F5 reads home_momentum[t]), 013 (per-tick simulation loop calls momentumDelta each tick).

## Estimate

**1 day.** F3 is trivial; F4 is straightforward but the single-rng()-per-tick invariant is the kind of thing that breaks silently if not unit-tested explicitly.

## Notes / Gotchas

- **The 90-tick clamp test (AC-MATCH-10)**: with rng noise, momentum can drift in surprising ways. Use seed `'test:momentum:clamp'` for reproducibility. The slice's match-determinism.test.ts has a similar pattern.
- **`rng()` order**: F4's `rng()` is the FIRST `rng()` call of each tick in the per-tick algorithm (story 013). If F4 ever gets multiple `rng()` calls (e.g., for separate pass/vision noise), the determinism tests will need updating AND the snapshot's `prngState` capture point becomes ambiguous. Stick to one rng() per F4 invocation.
- **3-5-2 ratio of 1.1**: this is the slice / GDD-canonical value. Future tuning may shift it; keep in FOOTBALL_CONSTANTS for easy adjustment.

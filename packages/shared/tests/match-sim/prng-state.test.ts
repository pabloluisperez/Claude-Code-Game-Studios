/**
 * Tests for stateful PRNG factory and serialization — MATCH-SIM-002.
 *
 * Covers all 6 Acceptance Criteria:
 *   AC-1  Stream determinism: same seed → same 1000 values
 *   AC-2  State capture is not undefined (the documented slice gotcha)
 *   AC-3  Round-trip determinism: 45 + 45 == 90 (AC-MATCH-02 cornerstone)
 *   AC-4  Serialized JSON shape has seedrandom Arc4 keys i, j, S
 *   AC-5  seedrandom version pinned exactly (no ^ or ~)
 *   AC-6  No Math.random() in match-prng.ts (control-manifest)
 *
 * Naming convention: test_[system]_[scenario]_[expected_result]
 * Story: MATCH-SIM-002
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import seedrandom from 'seedrandom';
import {
  createMatchSimContext,
  createMatchSimContextFromSnapshot,
  serializeRngState,
  rehydrateRng,
} from '../../src/sim/sports/football/match-prng.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect `n` values from any () => number callable. */
function collect(fn: () => number, n: number): number[] {
  return Array.from({ length: n }, () => fn());
}

// ── AC-1: Stream determinism ─────────────────────────────────────────────────

describe('match-prng — stream determinism (AC-1)', () => {
  it('test_match_prng_stream_determinism_1000_values', () => {
    // Arrange
    const { ctx: ctx1 } = createMatchSimContext('seed-A', 0);
    const { ctx: ctx2 } = createMatchSimContext('seed-A', 0);

    // Act
    const stream1 = collect(ctx1.rng, 1000);
    const stream2 = collect(ctx2.rng, 1000);

    // Assert: identical first 1000 values from the same seed
    expect(stream1).toEqual(stream2);
  });

  it('test_match_prng_different_seeds_produce_different_streams', () => {
    // Arrange
    const { ctx: ctxA } = createMatchSimContext('seed-A', 0);
    const { ctx: ctxB } = createMatchSimContext('seed-B', 0);

    // Act
    const streamA = collect(ctxA.rng, 10);
    const streamB = collect(ctxB.rng, 10);

    // Assert: different seeds must not produce identical sequences
    expect(streamA).not.toEqual(streamB);
  });
});

// ── AC-2: State capture is not undefined ─────────────────────────────────────

describe('match-prng — state capture not undefined (AC-2, slice gotcha regression)', () => {
  it('test_match_prng_state_capture_not_undefined', () => {
    // Arrange: the stateful rng is returned alongside the context
    const { rng } = createMatchSimContext('seed-A', 0);

    // Advance 10 positions to get a mid-stream state
    collect(rng, 10);

    // Act
    const state = rng.state();

    // Assert: state is NOT undefined — this catches the slice gotcha where
    // seedrandom(seed) without { state: true } silently returns undefined here
    expect(state).toBeDefined();
    expect(state).not.toBeNull();
  });

  it('test_match_prng_state_is_serializable_to_json', () => {
    // Arrange
    const { rng } = createMatchSimContext('seed-A', 0);
    collect(rng, 5);

    // Act: serialization must not throw and produce a non-empty string
    const serialized = serializeRngState(rng);

    // Assert
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);
    // Must be valid JSON
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

// ── AC-3: Round-trip determinism (AC-MATCH-02 cornerstone) ───────────────────

describe('match-prng — round-trip determinism 45+45=90 (AC-3, AC-MATCH-02)', () => {
  it('test_match_prng_round_trip_determinism_45_plus_45_equals_90', () => {
    // This is the CRITICAL test for ADR-013 Option B correctness.
    // A paused match at tick 45 must resume identically to a straight-through run.

    // Arrange: use the raw seedrandom functions directly (public API under test)
    const rng1 = seedrandom('seed-A', { state: true });

    // Act Part 1: collect first 45 values and capture state
    const first45 = collect(rng1, 45);
    const state = serializeRngState(rng1);

    // Act Part 2: rehydrate and collect next 45
    const rng2 = rehydrateRng('seed-A', state);
    const second45 = collect(rng2, 45);

    // Act Part 3: fresh straight-through run for 90 values (the ground truth)
    const rng3 = seedrandom('seed-A', { state: true });
    const full90 = collect(rng3, 90);

    // Assert: [first45 + second45] must equal full90 element-by-element
    expect(full90.slice(0, 45)).toEqual(first45);
    expect(full90.slice(45, 90)).toEqual(second45);
  });

  it('test_match_prng_context_from_snapshot_continues_at_position_46', () => {
    // Arrange: create a context, advance 45 ticks, serialize
    const { ctx: ctx1, rng: rng1 } = createMatchSimContext('seed-A', 0);
    const first45 = collect(ctx1.rng, 45);
    const state = serializeRngState(rng1);

    // Act: create a resumed context from the snapshot
    const { ctx: ctx2 } = createMatchSimContextFromSnapshot('seed-A', 0, state);
    const second45 = collect(ctx2.rng, 45);

    // Arrange: fresh straight-through for comparison
    const { ctx: ctx3 } = createMatchSimContext('seed-A', 0);
    const full90 = collect(ctx3.rng, 90);

    // Assert: the snapshot-resumed context continues at exactly position 46
    expect(full90.slice(0, 45)).toEqual(first45);
    expect(full90.slice(45, 90)).toEqual(second45);
  });
});

// ── AC-4: JSON shape has Arc4 keys ────────────────────────────────────────────

describe('match-prng — serialized JSON has seedrandom Arc4 keys (AC-4)', () => {
  it('test_match_prng_state_json_has_seedrandom_keys', () => {
    // Arrange
    const { rng } = createMatchSimContext('seed-A', 0);
    collect(rng, 20);

    // Act
    const serialized = serializeRngState(rng);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    // Assert: seedrandom@3.0.5 Arc4 state shape has keys i, j, S
    expect(parsed).toHaveProperty('i');
    expect(parsed).toHaveProperty('j');
    expect(parsed).toHaveProperty('S');
    expect(typeof parsed['i']).toBe('number');
    expect(typeof parsed['j']).toBe('number');
    expect(Array.isArray(parsed['S'])).toBe(true);
  });
});

// ── AC-5: seedrandom version pinned exactly ───────────────────────────────────

describe('match-prng — seedrandom version pin (AC-5)', () => {
  it('test_seedrandom_version_pinned_exactly_no_caret', () => {
    // Arrange: read the package.json directly (filesystem, not module resolution)
    // The exact pin prevents patch upgrades from silently changing the serialized
    // state format and invalidating all in-flight live matches in production.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '../../package.json');
    const pkgRaw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
    };

    // Act
    const seedrandomVersion = pkg.dependencies?.['seedrandom'];

    // Assert: must be exactly "3.0.5" — no ^ or ~ prefix
    expect(seedrandomVersion).toBeDefined();
    expect(seedrandomVersion).toBe('3.0.5');
    expect(seedrandomVersion).not.toMatch(/^\^/);
    expect(seedrandomVersion).not.toMatch(/^~/);
  });
});

// ── AC-6: No Math.random() in source file ─────────────────────────────────────

describe('match-prng — no Math.random() in source (AC-6, control-manifest)', () => {
  it('test_no_math_random_in_match_prng_file', () => {
    // Arrange: read the source file via filesystem path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const srcPath = join(
      __dirname,
      '../../src/sim/sports/football/match-prng.ts',
    );
    const content = readFileSync(srcPath, 'utf-8');

    // Act + Assert: no Math.random() CALLS are allowed — control-manifest enforcement.
    // Regex matches call-site syntax only, not comments mentioning the string.
    expect(content).not.toMatch(/\bMath\.random\s*\(/);
  });
});

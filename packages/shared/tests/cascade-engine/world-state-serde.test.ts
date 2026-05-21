/**
 * Unit tests for WorldState + DelayedEffectsBuffer serialization.
 *
 * Covers CASCADE-015 ACs:
 *   AC-SER-01: 6-decimal precision round-trip
 *   AC-SER-02 (control-manifest adjusted): result is Record, NOT Map
 *   AC-SER-03: malformed JSON throws ZodError with offending-node message
 *   AC-SER-04: DelayedEffectsBuffer round-trip preserves 3 effects incl. C15 case
 *   AC-SER-09: missing-node payload from raw SQL gets rejected by Zod
 *
 * Story: CASCADE-ENGINE-015
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  serializeWorldState,
  deserializeWorldState,
  serializeDelayedEffectsBuffer,
  deserializeDelayedEffectsBuffer,
  WorldStateJsonSchema,
} from '../../src/sim/world-state-serde.js';
import {
  defaultWorldState,
  NODE_IDS,
  type WorldState,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

// ── AC-SER-01: precision ─────────────────────────────────────────────────────

describe('CASCADE-ENGINE-015 — AC-SER-01 (precision)', () => {
  it('test_serde_worldstate_preserves_six_decimals_round_trip', () => {
    const state: WorldState = {
      ...defaultWorldState(),
      fan_momentum: 58.123456789,
    };
    const json = serializeWorldState(state);
    const restored = deserializeWorldState(json);
    // JSON preserves IEEE-754 doubles exactly — match to 6 decimals min.
    expect(restored.fan_momentum).toBeCloseTo(58.123456789, 6);
  });
});

// ── AC-SER-02: control-manifest deviation — Record not Map ───────────────────

describe('CASCADE-ENGINE-015 — AC-SER-02 (Record not Map per control-manifest)', () => {
  it('test_serde_deserialize_returns_record_not_map_instance', () => {
    // Per control-manifest Foundation Forbidden ❌: no Map<> in JSON payloads.
    // The original GDD AC-SER-02 said "result instanceof Map === true"; we
    // intentionally deviate. The deserializer returns a plain object with all
    // NodeIds as keys.
    const state = defaultWorldState();
    const json = serializeWorldState(state);
    const restored = deserializeWorldState(json);
    // Must NOT be a Map.
    expect(restored).not.toBeInstanceOf(Map);
    // Must be a plain object with all NodeIds as own properties.
    for (const id of NODE_IDS) {
      expect(id in restored).toBe(true);
      expect(typeof restored[id]).toBe('number');
    }
  });
});

// ── AC-SER-03: null/undefined rejection ──────────────────────────────────────

describe('CASCADE-ENGINE-015 — AC-SER-03 (null-rejection)', () => {
  it('test_serde_deserialize_null_value_throws_zod_with_node_name', () => {
    // Build a state then poke a null into the JSON.
    const corruptObj = { ...defaultWorldState(), fan_momentum: null };
    const corruptJson = JSON.stringify(corruptObj);

    expect(() => deserializeWorldState(corruptJson)).toThrow(z.ZodError);

    // Drill into the error to confirm fan_momentum is identified.
    try {
      deserializeWorldState(corruptJson);
    } catch (e) {
      if (!(e instanceof z.ZodError)) throw e;
      const issuePath = e.issues.map((i) => i.path.join('.')).join(',');
      expect(issuePath).toContain('fan_momentum');
    }
  });

  it('test_serde_deserialize_string_value_throws_zod', () => {
    const corruptObj = { ...defaultWorldState(), team_fitness: 'high' };
    const corruptJson = JSON.stringify(corruptObj);
    expect(() => deserializeWorldState(corruptJson)).toThrow(z.ZodError);
  });
});

// ── AC-SER-04: DelayedEffectsBuffer round-trip ───────────────────────────────

describe('CASCADE-ENGINE-015 — AC-SER-04 (DelayedEffectsBuffer round-trip)', () => {
  it('test_serde_delayed_buffer_three_effects_including_c15_negative_delta', () => {
    const buffer: DelayedEffectsBuffer = [
      { applyAt: 5, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' }, // C15 case
      { applyAt: 6, toNode: 'team_fitness', delta: 0.4, edgeId: 'C5a' },
      { applyAt: 7, toNode: 'player_happiness', delta: -0.3, edgeId: 'C17' },
    ];
    const json = serializeDelayedEffectsBuffer(buffer);
    const restored = deserializeDelayedEffectsBuffer(json);
    expect(restored.length).toBe(3);
    expect(restored[0]).toEqual(buffer[0]);
    expect(restored[1]).toEqual(buffer[1]);
    expect(restored[2]).toEqual(buffer[2]);
    // Specifically verify the C15 negative-delta case.
    const c15 = restored.find((e) => e.edgeId === 'C15');
    expect(c15?.delta).toBeCloseTo(-1.8, 6);
  });

  it('test_serde_delayed_buffer_empty_round_trips_to_empty_array', () => {
    const empty: DelayedEffectsBuffer = [];
    const restored = deserializeDelayedEffectsBuffer(
      serializeDelayedEffectsBuffer(empty),
    );
    expect(restored).toEqual([]);
  });
});

// ── AC-SER-09: schema validation rejects malformed (missing NodeIds) ─────────

describe('CASCADE-ENGINE-015 — AC-SER-09 (schema validation rejects malformed)', () => {
  it('test_serde_world_state_missing_required_nodes_rejected_by_zod', () => {
    // Simulates a row inserted via raw SQL with an incomplete payload.
    const malformedJson = JSON.stringify({ foo: 1 });
    expect(() => deserializeWorldState(malformedJson)).toThrow(z.ZodError);
  });

  it('test_serde_world_state_partial_payload_lists_missing_nodes', () => {
    // Confirm the error message names the missing fields (operational debuggability).
    const state = defaultWorldState();
    const partial = { ...state };
    // Drop a known node.
    delete (partial as Partial<WorldState>).fan_momentum;
    delete (partial as Partial<WorldState>).team_fitness;
    const json = JSON.stringify(partial);

    try {
      deserializeWorldState(json);
      throw new Error('Expected ZodError, got success');
    } catch (e) {
      if (!(e instanceof z.ZodError)) throw e;
      const msg = e.issues.map((i) => i.message).join(' | ');
      expect(msg).toContain('fan_momentum');
      expect(msg).toContain('team_fitness');
    }
  });

  it('test_serde_zod_schema_directly_accepts_default_world_state', () => {
    // Sanity check the schema accepts the canonical default state object.
    const state = defaultWorldState();
    const parsed = WorldStateJsonSchema.parse(state);
    for (const id of NODE_IDS) {
      expect(parsed[id]).toBe(state[id]);
    }
  });
});

/**
 * Story: CASCADE-ENGINE-003
 * GDD: cascade-engine.md §Delayed Effects
 * ADR: ADR-003 Rule 3 (pure helpers), ADR-005 (persistence boundary), ADR-002 (no random/Date.now)
 * Control Manifest: 2026-05-19
 *
 * Test naming convention: `test_[system]_[scenario]_[expected_result]` per
 *   .claude/rules/test-standards.md.
 *
 * All 8 acceptance criteria are covered by named test functions.
 */

import { describe, expect, it } from 'vitest';
import {
  type DelayedEffect,
  type DelayedEffectsBuffer,
  DelayedEffectJsonSchema,
  DelayedEffectsJsonSchema,
  popEffectsDueAt,
  enqueueEffect,
  serializeBuffer,
  deserializeBuffer,
} from '../../src/sim/delayed-effects.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Canonical two-effect buffer from story spec (AC #2 and #3)
const EFFECT_C1a: DelayedEffect = {
  applyAt: 2,
  toNode: 'field_quality',
  delta: 9,
  edgeId: 'C1a',
};
const EFFECT_C15: DelayedEffect = {
  applyAt: 5,
  toNode: 'fan_momentum',
  delta: -1.8,
  edgeId: 'C15',
};
const BUFFER_TWO: DelayedEffectsBuffer = [EFFECT_C1a, EFFECT_C15];

// ── AC #1: Negative deltas are valid ─────────────────────────────────────────

describe('DelayedEffect — negative delta', () => {
  it('test_delayed_effect_allows_negative_delta', () => {
    // Arrange
    const effect: DelayedEffect = {
      applyAt: 3,
      toNode: 'fan_momentum',
      delta: -5.5,
      edgeId: 'C15',
    };
    // Act + Assert: TypeScript type allows negative; Zod schema allows negative.
    expect(effect.delta).toBe(-5.5);
    expect(effect.delta).toBeLessThan(0);
    // Zod schema must accept it without throwing.
    const parsed = DelayedEffectJsonSchema.safeParse(effect);
    expect(parsed.success).toBe(true);
  });
});

// ── AC #2: popEffectsDueAt correct split at week=2 ───────────────────────────

describe('popEffectsDueAt — correct due and remaining', () => {
  it('test_pop_effects_due_at_returns_correct_due_and_remaining', () => {
    // Arrange: buffer = [{applyAt:2,toNode:'field_quality',delta:9,edgeId:'C1a'},
    //                    {applyAt:5,toNode:'fan_momentum',delta:-1.8,edgeId:'C15'}]
    // Act: currentWeek = 2
    const { due, remaining } = popEffectsDueAt(BUFFER_TWO, 2);
    // Assert
    expect(due).toHaveLength(1);
    expect(due[0].edgeId).toBe('C1a');
    expect(due[0].applyAt).toBe(2);
    expect(due[0].toNode).toBe('field_quality');
    expect(due[0].delta).toBe(9);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].edgeId).toBe('C15');
    expect(remaining[0].applyAt).toBe(5);
  });
});

// ── AC #3: popEffectsDueAt at week=3 — neither effect is due ─────────────────

describe('popEffectsDueAt — week=3 returns empty due', () => {
  it('test_pop_effects_due_at_week3_returns_empty_due_both_in_remaining', () => {
    // Arrange: same buffer; applyAt=2 is now a PAST effect, applyAt=5 is future.
    // Act: currentWeek = 3
    const { due, remaining } = popEffectsDueAt(BUFFER_TWO, 3);
    // Assert: nothing is due at week=3
    expect(due).toHaveLength(0);
    // Both effects go to remaining — past effect (applyAt=2) is kept, not dropped.
    expect(remaining).toHaveLength(2);
    const remainingEdgeIds = remaining.map((e) => e.edgeId);
    expect(remainingEdgeIds).toContain('C1a');
    expect(remainingEdgeIds).toContain('C15');
  });
});

// ── AC #4: Past-week effects are not consumed ─────────────────────────────────

describe('popEffectsDueAt — past effects are not consumed', () => {
  it('test_pop_effects_due_at_does_not_consume_past_week_effect', () => {
    // Arrange: effect with applyAt=1, evaluated at week=3 (past)
    const pastEffect: DelayedEffect = {
      applyAt: 1,
      toNode: 'field_quality',
      delta: 4,
      edgeId: 'C1a',
    };
    const buffer: DelayedEffectsBuffer = [pastEffect];
    // Act
    const { due, remaining } = popEffectsDueAt(buffer, 3);
    // Assert: past effect is NOT in due — it stays in remaining
    expect(due).toHaveLength(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].edgeId).toBe('C1a');
    expect(remaining[0].applyAt).toBe(1);
  });
});

// ── AC #5: enqueueEffect is pure and non-mutating ────────────────────────────

describe('enqueueEffect — immutability and correctness', () => {
  it('test_enqueue_effect_returns_new_array_original_unchanged', () => {
    // Arrange
    const original: DelayedEffectsBuffer = [EFFECT_C1a];
    const newEffect: DelayedEffect = {
      applyAt: 5,
      toNode: 'fan_momentum',
      delta: -1.8,
      edgeId: 'C15',
    };
    // Act
    const result = enqueueEffect(original, newEffect);
    // Assert: result is a new array reference
    expect(result).not.toBe(original);
    // Result has both effects
    expect(result).toHaveLength(2);
    expect(result[0].edgeId).toBe('C1a');
    expect(result[1].edgeId).toBe('C15');
    // Original is unchanged (=== still length 1)
    expect(original).toHaveLength(1);
  });

  it('test_enqueue_effect_on_empty_buffer', () => {
    // Arrange
    const empty: DelayedEffectsBuffer = [];
    const effect: DelayedEffect = {
      applyAt: 3,
      toNode: 'team_fitness',
      delta: 5,
      edgeId: 'C4',
    };
    // Act
    const result = enqueueEffect(empty, effect);
    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].edgeId).toBe('C4');
    // Empty array reference unchanged
    expect(empty).toHaveLength(0);
  });
});

// ── AC #6: Zod schema validation ─────────────────────────────────────────────

describe('DelayedEffectJsonSchema — field validation', () => {
  it('test_delayed_effect_json_schema_rejects_null_applyAt', () => {
    // Arrange: applyAt is null
    const input = { applyAt: null, toNode: 'field_quality', delta: 5, edgeId: 'C1a' };
    // Act
    const result = DelayedEffectJsonSchema.safeParse(input);
    // Assert
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_null_toNode', () => {
    // Arrange: toNode is null
    const input = { applyAt: 2, toNode: null, delta: 5, edgeId: 'C1a' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_null_delta', () => {
    // Arrange: delta is null
    const input = { applyAt: 2, toNode: 'field_quality', delta: null, edgeId: 'C1a' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_null_edgeId', () => {
    // Arrange: edgeId is null
    const input = { applyAt: 2, toNode: 'field_quality', delta: 5, edgeId: null };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_empty_string_toNode', () => {
    // Arrange: toNode is empty string (min(1) requirement)
    const input = { applyAt: 2, toNode: '', delta: 5, edgeId: 'C1a' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_empty_string_edgeId', () => {
    // Arrange: edgeId is empty string
    const input = { applyAt: 2, toNode: 'field_quality', delta: 5, edgeId: '' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_accepts_negative_delta', () => {
    // Arrange: delta is negative — must be accepted (no min constraint)
    const input = { applyAt: 5, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' };
    // Act
    const result = DelayedEffectJsonSchema.safeParse(input);
    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delta).toBe(-1.8);
    }
  });

  it('test_delayed_effect_json_schema_rejects_non_integer_applyAt', () => {
    // Arrange: applyAt must be int per schema
    const input = { applyAt: 2.5, toNode: 'field_quality', delta: 5, edgeId: 'C1a' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('test_delayed_effect_json_schema_rejects_zero_applyAt', () => {
    // Arrange: applyAt must be positive (> 0) per schema
    const input = { applyAt: 0, toNode: 'field_quality', delta: 5, edgeId: 'C1a' };
    const result = DelayedEffectJsonSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ── AC #7: serialize/deserialize round-trip ───────────────────────────────────

describe('serializeBuffer / deserializeBuffer — round-trip', () => {
  it('test_serialize_deserialize_round_trip_preserves_all_fields_including_negative_delta', () => {
    // Arrange: 3 effects — 2 with negative delta, 1 positive
    const buffer: DelayedEffectsBuffer = [
      { applyAt: 2, toNode: 'field_quality', delta: 9, edgeId: 'C1a' },
      { applyAt: 5, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' },
      { applyAt: 3, toNode: 'team_fitness', delta: -4.2, edgeId: 'C12' },
    ];
    // Act
    const json = serializeBuffer(buffer);
    const restored = deserializeBuffer(json);
    // Assert: all fields preserved
    expect(restored).toHaveLength(3);
    expect(restored[0].applyAt).toBe(2);
    expect(restored[0].toNode).toBe('field_quality');
    expect(restored[0].delta).toBe(9);
    expect(restored[0].edgeId).toBe('C1a');
    expect(restored[1].delta).toBe(-1.8);
    expect(restored[1].toNode).toBe('fan_momentum');
    expect(restored[2].delta).toBe(-4.2);
    expect(restored[2].toNode).toBe('team_fitness');
  });

  it('test_serialize_deserialize_empty_buffer_round_trip', () => {
    // Arrange
    const buffer: DelayedEffectsBuffer = [];
    // Act
    const json = serializeBuffer(buffer);
    const restored = deserializeBuffer(json);
    // Assert
    expect(restored).toHaveLength(0);
  });

  it('test_deserialize_buffer_throws_on_malformed_json', () => {
    // Arrange: invalid JSON string
    const badJson = '{ not valid json at all %%% ';
    // Act + Assert
    expect(() => deserializeBuffer(badJson)).toThrow();
  });

  it('test_deserialize_buffer_throws_on_null_applyAt_in_json', () => {
    // Arrange: valid JSON but null applyAt fails Zod validation
    const badJson = JSON.stringify([
      { applyAt: null, toNode: 'field_quality', delta: 5, edgeId: 'C1a' },
    ]);
    // Act + Assert
    expect(() => deserializeBuffer(badJson)).toThrow();
  });

  it('test_deserialize_buffer_throws_on_missing_required_field', () => {
    // Arrange: missing 'edgeId' field — Zod must reject
    const badJson = JSON.stringify([
      { applyAt: 2, toNode: 'field_quality', delta: 5 },
    ]);
    // Act + Assert
    expect(() => deserializeBuffer(badJson)).toThrow();
  });
});

// ── AC #8: delay=2 effect survives two pop calls, consumed on third ───────────

describe('popEffectsDueAt — delay-2 effect lifecycle (C15 simulation)', () => {
  it('test_delay2_effect_survives_two_pop_calls_consumed_on_third', () => {
    // Arrange: single effect with applyAt=7 (simulating delay=2 from week=5)
    const effect: DelayedEffect = {
      applyAt: 7,
      toNode: 'fan_momentum',
      delta: -1.8,
      edgeId: 'C15',
    };
    let buffer: DelayedEffectsBuffer = [effect];

    // Act: week=5 — not yet due (future)
    const result5 = popEffectsDueAt(buffer, 5);
    // Assert: not consumed at week=5
    expect(result5.due).toHaveLength(0);
    expect(result5.remaining).toHaveLength(1);
    buffer = result5.remaining;

    // Act: week=6 — still not due (future)
    const result6 = popEffectsDueAt(buffer, 6);
    // Assert: not consumed at week=6
    expect(result6.due).toHaveLength(0);
    expect(result6.remaining).toHaveLength(1);
    buffer = result6.remaining;

    // Act: week=7 — now due (applyAt === currentWeek)
    const result7 = popEffectsDueAt(buffer, 7);
    // Assert: consumed at week=7
    expect(result7.due).toHaveLength(1);
    expect(result7.due[0].edgeId).toBe('C15');
    expect(result7.due[0].delta).toBe(-1.8);
    expect(result7.remaining).toHaveLength(0);
  });
});

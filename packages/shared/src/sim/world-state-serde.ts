/**
 * WorldState + DelayedEffectsBuffer serialization boundary.
 *
 * Per ADR-005: `world_snapshots.world_state` is jsonb. This module is the
 * canonical serializer/deserializer + Zod validator for the JSON payload.
 *
 * Per control-manifest Foundation Forbidden ❌: NO `Map<>` in JSON payloads.
 * `WorldState` is `Record<NodeId, number>`. The deserializer returns Record,
 * NOT `instanceof Map`. This is an intentional deviation from the original
 * cascade-engine.md GDD AC-SER-02 wording ("result instanceof Map === true")
 * — the control-manifest is the authority over the GDD on this point.
 *
 * Story: CASCADE-ENGINE-015
 * Control Manifest: 2026-05-19
 */

import { z } from 'zod';
import { NODE_IDS, type NodeId, type WorldState } from './cascade-types.js';
import {
  DelayedEffectsJsonSchema,
  type DelayedEffectsBuffer,
} from './delayed-effects.js';

// ── Zod schema ────────────────────────────────────────────────────────────────

/**
 * Validates that a parsed JSON value is a complete WorldState.
 *
 * All 20+ NodeIds must be present as keys, all values must be finite numbers.
 * Per AC-SER-03: null / undefined / missing nodes throw a ZodError naming the
 * offending node.
 */
export const WorldStateJsonSchema = z
  .record(z.string(), z.number().finite())
  .refine(
    (obj) => NODE_IDS.every((id) => id in obj),
    (obj) => ({
      message: `Missing required NodeIds: ${NODE_IDS.filter((id) => !(id in obj)).join(', ')}`,
    }),
  )
  .transform((obj) => obj as WorldState);

// ── Serialize / deserialize ──────────────────────────────────────────────────

/** Convert a WorldState to a JSON string. JSON.stringify of a Record is canonical. */
export function serializeWorldState(state: Readonly<WorldState>): string {
  return JSON.stringify(state);
}

/**
 * Parse a JSON string into a WorldState. Validates against `WorldStateJsonSchema`.
 *
 * Throws `ZodError` if the JSON is malformed, contains nulls/non-numbers, or
 * is missing required NodeIds. Per control-manifest, the result is a plain
 * `Record<NodeId, number>` — never a `Map<>`.
 */
export function deserializeWorldState(json: string): WorldState {
  const parsed = JSON.parse(json) as unknown;
  return WorldStateJsonSchema.parse(parsed);
}

/** Convert a DelayedEffectsBuffer to a JSON string. */
export function serializeDelayedEffectsBuffer(
  buffer: DelayedEffectsBuffer,
): string {
  return JSON.stringify(buffer);
}

/** Parse a JSON string into a DelayedEffectsBuffer. Validated via Zod. */
export function deserializeDelayedEffectsBuffer(
  json: string,
): DelayedEffectsBuffer {
  const parsed = JSON.parse(json) as unknown;
  // `DelayedEffectJsonSchema` validates `toNode` as a non-empty string; the
  // `NodeId` union narrowing is a TypeScript-only concern. The cast at this
  // boundary is intentional and matches the documented schema comment.
  return DelayedEffectsJsonSchema.parse(parsed) as DelayedEffectsBuffer;
}

// ── Combined payload (one snapshot = state + buffer) ─────────────────────────

/**
 * A complete snapshot payload — what `saveTickResult` stores as one
 * `world_snapshots` row's jsonb columns.
 */
export interface SnapshotPayload {
  readonly worldState: WorldState;
  readonly delayedEffectsBuffer: DelayedEffectsBuffer;
}

export const SnapshotPayloadJsonSchema = z.object({
  worldState: WorldStateJsonSchema,
  delayedEffectsBuffer: DelayedEffectsJsonSchema,
});

/** Re-export NodeIds for consumers verifying full key coverage post-deserialize. */
export { NODE_IDS };
export type { NodeId };

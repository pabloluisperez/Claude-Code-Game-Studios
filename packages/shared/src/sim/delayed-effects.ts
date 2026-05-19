/**
 * DelayedEffect + DelayedEffectsBuffer — the carrier of every delay > 0
 * across the cascade engine.
 *
 * Per ADR-003 Rule 5: delays are first-class design intent. This buffer
 * carries effects like C1a (1w), C4 (1w), C9a (1w), C15 (2w) across ticks.
 * `runTick()` Step 1 (story 004) consumes effects via `popEffectsDueAt`.
 *
 * Per ADR-005: `serializeBuffer`/`deserializeBuffer` are the persistence
 * boundary for `world_snapshots.delayed_effects` (story 015).
 *
 * Per control-manifest Forbidden: buffer is array[], NOT Map<> — JSON-safe.
 *
 * Story: CASCADE-ENGINE-003
 * Control Manifest: 2026-05-19
 */

import { z } from 'zod';
import type { NodeId } from './cascade-types.js';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A single delayed effect scheduled by an edge with delay > 0.
 *
 * `applyAt` is the absolute game-week at which `runTick()` Step 1 will
 * consume this effect. Past effects (applyAt < currentWeek) are NOT applied
 * retroactively — they remain in the buffer as an invariant-violation marker
 * and a console.warn is emitted.
 *
 * `delta` is SIGNED: negative values are valid (e.g. C15 erodes fan_momentum).
 * Clamping to node bounds is `runTick()`'s responsibility, not this buffer's.
 */
export interface DelayedEffect {
  readonly applyAt: number;   // absolute game-week when consumed by runTick() Step 1
  readonly toNode: NodeId;    // target node
  readonly delta: number;     // SIGNED — negative deltas are valid
  readonly edgeId: string;    // for CascadeLog audit trail
}

/**
 * Immutable ordered list of pending delayed effects.
 * Maintained as a plain array so it is JSON-serializable.
 */
export type DelayedEffectsBuffer = readonly DelayedEffect[];

// ── Zod schemas ───────────────────────────────────────────────────────────────

/**
 * Zod schema for a single DelayedEffect, used at the JSON persistence boundary.
 * `delta` has no min/max — clamping is runTick()'s responsibility.
 * `toNode` is validated as non-empty string (NodeId union check is a TS concern).
 */
export const DelayedEffectJsonSchema = z.object({
  applyAt: z.number().int().positive(),
  toNode: z.string().min(1),
  delta: z.number(),
  edgeId: z.string().min(1),
});

/**
 * Zod schema for a full DelayedEffectsBuffer (array of effects).
 */
export const DelayedEffectsJsonSchema = z.array(DelayedEffectJsonSchema);

// ── Helper functions (pure — no mutation, no I/O) ─────────────────────────────

/**
 * Splits the buffer into effects due this week and all others.
 *
 * `due`: effects where `applyAt === currentWeek` (exact match).
 * `remaining`: ALL other effects — both future AND past.
 *
 * Past effects (`applyAt < currentWeek`) are NOT applied retroactively.
 * They remain in `remaining` and a `console.warn` is emitted describing
 * the invariant violation. Silently dropping them would hide bugs.
 *
 * Per ADR-002: no Date.now(), no Math.random().
 * Per ADR-003 Rule 3: original buffer is never mutated.
 */
export function popEffectsDueAt(
  buffer: DelayedEffectsBuffer,
  currentWeek: number,
): { due: DelayedEffect[]; remaining: DelayedEffect[] } {
  const due: DelayedEffect[] = [];
  const remaining: DelayedEffect[] = [];

  for (const effect of buffer) {
    if (effect.applyAt === currentWeek) {
      due.push(effect);
    } else {
      if (effect.applyAt < currentWeek) {
        console.warn(
          `[delayed-effects] Invariant violation: effect for edge "${effect.edgeId}" ` +
          `targeting "${effect.toNode}" has applyAt=${effect.applyAt} but currentWeek=${currentWeek}. ` +
          `Past effects are not applied retroactively. Effect kept in remaining.`,
        );
      }
      remaining.push(effect);
    }
  }

  return { due, remaining };
}

/**
 * Returns a new buffer with `effect` appended. The original buffer is
 * unchanged (immutability invariant — `===` identity preserved on original).
 *
 * Per ADR-003 Rule 3: pure function, no side effects.
 */
export function enqueueEffect(
  buffer: DelayedEffectsBuffer,
  effect: DelayedEffect,
): DelayedEffectsBuffer {
  return [...buffer, effect];
}

/**
 * Serializes the buffer to a JSON string for persistence.
 * Per ADR-005: this is the persistence boundary for world_snapshots.delayed_effects.
 */
export function serializeBuffer(buffer: DelayedEffectsBuffer): string {
  return JSON.stringify(buffer);
}

/**
 * Deserializes a JSON string back to a validated DelayedEffectsBuffer.
 * Throws on:
 *   - malformed JSON (JSON.parse throws)
 *   - null or missing required fields (Zod throws ZodError)
 *   - wrong field types
 *
 * Per control-manifest: client-supplied state MUST go through Zod validation.
 */
export function deserializeBuffer(json: string): DelayedEffectsBuffer {
  const parsed: unknown = JSON.parse(json);
  const result = DelayedEffectsJsonSchema.parse(parsed);
  return result as DelayedEffectsBuffer;
}

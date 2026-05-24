/**
 * cascade-engine.ts — runTick() pure function, Steps 1–4/6.
 *
 * Per ADR-002: pure function, no side effects, no Math.random(), no Date.now().
 * Per ADR-003 Rule 3: prevState is NEVER mutated.
 * Per ADR-003 Rule 4: clamping applies to the FINAL accumulated delta, not per-edge.
 * Per control-manifest Foundation Layer: ctx.rng() is the ONLY source of randomness.
 *
 * Story: CASCADE-ENGINE-004 (skeleton), CASCADE-ENGINE-005 (Steps 2/3 full impl)
 * Control Manifest: 2026-05-19
 */

import type {
  SimContext,
  WorldState,
  NodeId,
  PlayerDecision,
  TickResult,
  CascadeLog,
  ThresholdCrossing,
} from './cascade-types.js';
import { NODE_RANGES } from './cascade-types.js';
import type { DelayedEffect, DelayedEffectsBuffer } from './delayed-effects.js';
import { popEffectsDueAt } from './delayed-effects.js';
import type { CascadeEdgeDef } from './cascade-graph.js';
import { detectCrossings, THRESHOLDS_MVP } from './threshold-detector.js';

// ── Exported pure utilities ────────────────────────────────────────────────────

/**
 * Clamps `value` to the inclusive range [min, max].
 *
 * Pure function — no imports, no side effects.
 * Per ADR-003 Rule 4: apply to the FINAL accumulated delta, not per-edge.
 */
export function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Main tick function ─────────────────────────────────────────────────────────

/**
 * Advance the world state by one week.
 *
 * Steps implemented:
 *   1. Consume delayed effects due this week (popEffectsDueAt).
 *   2. Evaluate cascade edges — guardFn gate, transferFn call, delay routing.
 *   3. Apply player decisions additively into deltaMap (with decision log).
 *   4. Build nextState by clamping each node's final accumulated delta.
 *   5. Threshold crossing detection — STUB (story 014).
 *   6. Assemble and return TickResult.
 *
 * Invariants:
 *   - `prevState` is NEVER mutated (Readonly<WorldState> enforced by SimContext).
 *   - `buffer` is NEVER mutated (DelayedEffectsBuffer is readonly array).
 *   - Clamping is applied once per node on the final sum (ADR-003 Rule 4).
 *   - `ctx.rng()` is the only source of randomness (ADR-002).
 */
export function runTick(
  ctx: SimContext,
  graph: readonly CascadeEdgeDef[],
  prevState: Readonly<WorldState>,
  decisions: readonly PlayerDecision[],
  buffer: DelayedEffectsBuffer,
): TickResult {
  // ── Step 1: Consume delayed effects due this week ──────────────────────────
  const { due, remaining } = popEffectsDueAt(buffer, ctx.currentWeek);

  const deltaMap = new Map<NodeId, number>();
  const log: CascadeLog[] = [];
  const newDelayedEffects: DelayedEffect[] = [];

  for (const effect of due) {
    const prev = deltaMap.get(effect.toNode) ?? 0;
    deltaMap.set(effect.toNode, prev + effect.delta);
    log.push({
      source: 'delayed',
      edgeId: effect.edgeId,
      nodeId: effect.toNode,
      delta: effect.delta,
      week: ctx.currentWeek,
    });
  }

  // ── Step 2: Evaluate cascade edges ────────────────────────────────────────
  for (const edge of graph) {
    if (edge.guardFn && !edge.guardFn(prevState, ctx)) {
      log.push({
        source: 'guarded',
        edgeId: edge.id,
        nodeId: edge.toNode,
        delta: 0,
        week: ctx.currentWeek,
      });
      continue;
    }
    const fromValue = prevState[edge.fromNode] ?? NODE_RANGES[edge.fromNode]?.default ?? 0;
    const delta = edge.transferFn(prevState, ctx);
    log.push({
      source: 'edge',
      edgeId: edge.id,
      nodeId: edge.toNode,
      delta,
      week: ctx.currentWeek,
      fromNode: edge.fromNode,
      fromValue,
      delay: edge.delay,
    });
    if (edge.delay === 0) {
      deltaMap.set(edge.toNode, (deltaMap.get(edge.toNode) ?? 0) + delta);
    } else {
      newDelayedEffects.push({
        applyAt: ctx.currentWeek + edge.delay,
        toNode: edge.toNode,
        delta,
        edgeId: edge.id,
      });
    }
  }

  // ── Step 3: Apply player decisions ────────────────────────────────────────
  // Per ADR-003 Rule 4: additive composition. Decisions log with source 'decision'
  // (override of story-004's "no decision log" — required for AC #8 completeness).
  for (const decision of decisions) {
    deltaMap.set(decision.nodeId, (deltaMap.get(decision.nodeId) ?? 0) + decision.delta);
    log.push({
      source: 'decision',
      edgeId: decision.source,
      nodeId: decision.nodeId,
      delta: decision.delta,
      week: ctx.currentWeek,
    });
  }

  // ── Step 4: Build nextState with final clamped values ─────────────────────
  // Per ADR-003 Rule 3: prevState is never mutated — always build a fresh object.
  // Per ADR-003 Rule 4: clamping is applied to the FINAL accumulated delta.
  const nextState: WorldState = {} as WorldState;

  for (const key of Object.keys(NODE_RANGES) as NodeId[]) {
    const baseValue = prevState[key] ?? NODE_RANGES[key]?.default ?? 0;
    const delta = deltaMap.get(key) ?? 0;
    nextState[key] = clampToRange(
      baseValue + delta,
      NODE_RANGES[key].min,
      NODE_RANGES[key].max,
    );
  }

  // ── Step 5: Threshold crossing detection (story 014) ──────────────────────
  const thresholdCrossings: readonly ThresholdCrossing[] = detectCrossings(
    prevState,
    nextState,
    THRESHOLDS_MVP,
  );

  // ── Step 6: Assemble and return TickResult ─────────────────────────────────
  return {
    nextState,
    newDelayedEffects: [...remaining, ...newDelayedEffects],
    log,
    thresholdCrossings,
    week: ctx.currentWeek,
  };
}

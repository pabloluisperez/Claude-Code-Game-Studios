// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does the weekly tick algorithm produce deterministic, observable cascades?
// Date: 2026-05-18

import { CASCADE_EDGES, THRESHOLDS } from "./cascade-graph.js";
import type {
  CascadeLogEntry,
  DelayedEffect,
  NodeId,
  PlayerDecisions,
  SimContext,
  ThresholdConfig,
  ThresholdCrossing,
  TickResult,
  WorldState,
} from "./types.js";
import { NODE_RANGES } from "./types.js";

/**
 * Runs one weekly tick of the cascade engine.
 *
 * Algorithm (cascade-engine.md §States and Transitions):
 *   1. Apply matured delayed effects from buffer
 *   2. Evaluate all edges using prevState only (Rule 3)
 *   3. Apply player decisions (direct, delay 0)
 *   4. Clamp to ranges
 *   5. Detect threshold crossings
 *   6. Return TickResult
 *
 * Pure function — given the same inputs, returns the same output.
 * RNG must be seeded by the caller. No I/O. No Math.random.
 */
export function runTick(args: {
  prevState: WorldState;
  delayedBuffer: readonly DelayedEffect[];
  decisions: PlayerDecisions;
  rng: () => number;
  hasMatchThisWeek: boolean;
  currentWeek: number;
}): TickResult {
  const { prevState, delayedBuffer, decisions, rng, hasMatchThisWeek, currentWeek } =
    args;

  // Working copy of state — we mutate this and clamp at the end.
  const nextState: WorldState = { ...prevState };
  const log: CascadeLogEntry[] = [];

  // ── Step 1: matured delayed effects ────────────────────────────────────────
  for (const eff of delayedBuffer) {
    if (eff.applyAtWeek === currentWeek) {
      nextState[eff.toNode] += eff.delta;
      log.push({
        edgeId: eff.sourceEdgeId,
        to: eff.toNode,
        delta: eff.delta,
        delay: 0,
        scheduledFor: currentWeek,
      });
    }
  }

  // ── Step 2: edges ──────────────────────────────────────────────────────────
  const ctx: SimContext = {
    rng,
    prevState,
    hasMatchThisWeek,
    currentWeek,
  };
  const newDelayedEffects: DelayedEffect[] = [];

  for (const edge of CASCADE_EDGES) {
    if (edge.matchWeekOnly && !hasMatchThisWeek) continue;

    const delta = edge.transferFn(ctx);
    if (edge.delay === 0) {
      nextState[edge.to] += delta;
      log.push({
        edgeId: edge.id,
        to: edge.to,
        delta,
        delay: 0,
        scheduledFor: currentWeek,
      });
    } else {
      newDelayedEffects.push({
        toNode: edge.to,
        delta,
        applyAtWeek: currentWeek + edge.delay,
        sourceEdgeId: edge.id,
      });
      log.push({
        edgeId: edge.id,
        to: edge.to,
        delta,
        delay: edge.delay,
        scheduledFor: currentWeek + edge.delay,
      });
    }
  }

  // ── Step 3: player decisions ───────────────────────────────────────────────
  for (const [nodeId, value] of Object.entries(decisions) as Array<[NodeId, number]>) {
    nextState[nodeId] = value;
    log.push({
      edgeId: `decision:${nodeId}`,
      to: nodeId,
      delta: value - prevState[nodeId],
      delay: 0,
      scheduledFor: currentWeek,
    });
  }

  // ── Step 4: clamp ──────────────────────────────────────────────────────────
  for (const key of Object.keys(nextState) as NodeId[]) {
    const [min, max] = NODE_RANGES[key];
    if (nextState[key] < min) nextState[key] = min;
    else if (nextState[key] > max) nextState[key] = max;
  }

  // ── Step 5: threshold crossings ────────────────────────────────────────────
  const thresholdCrossings = detectCrossings(prevState, nextState, THRESHOLDS);

  // ── Step 6 ─────────────────────────────────────────────────────────────────
  return {
    nextState,
    newDelayedEffects,
    log,
    thresholdCrossings,
    week: currentWeek,
  };
}

function detectCrossings(
  prev: WorldState,
  next: WorldState,
  configs: readonly ThresholdConfig[],
): ThresholdCrossing[] {
  const out: ThresholdCrossing[] = [];
  for (const cfg of configs) {
    const prevVal = prev[cfg.nodeId];
    const nextVal = next[cfg.nodeId];
    const crossed =
      cfg.direction === "above"
        ? prevVal <= cfg.value && nextVal > cfg.value
        : prevVal >= cfg.value && nextVal < cfg.value;
    if (crossed) {
      out.push({
        nodeId: cfg.nodeId,
        value: nextVal,
        threshold: cfg.value,
        direction: cfg.direction,
        priority: cfg.priority,
        reason: cfg.reason,
      });
    }
  }
  return out;
}

/**
 * Merges newly emitted delayed effects into the surviving buffer. Effects
 * with `applyAtWeek <= currentWeek` are discarded (already applied or expired).
 */
export function mergeDelayedBuffer(
  prevBuffer: readonly DelayedEffect[],
  newEffects: readonly DelayedEffect[],
  currentWeek: number,
): DelayedEffect[] {
  return [...prevBuffer, ...newEffects].filter((e) => e.applyAtWeek > currentWeek);
}

/**
 * Threshold crossing detection — runTick() Step 5.
 *
 * Detects NEW transitions of node values across configured thresholds, per
 * cascade-engine.md §Threshold Crossings and ADR-008 (BLOCKING vs ADVISORY).
 *
 * - direction `above`: prev <= threshold && next > threshold (crossing UP)
 * - direction `below`: prev >= threshold && next < threshold (crossing DOWN)
 *
 * Strict-inequality on the destination side ensures a node sitting AT a
 * threshold (prev == threshold) only fires when it MOVES through it on a
 * subsequent tick. See AC #12 of CASCADE-ENGINE-014.
 *
 * Story: CASCADE-ENGINE-014
 * Control Manifest: 2026-05-19
 * GDD: design/gdd/cascade-engine.md §Threshold Crossings
 */

import type {
  NodeId,
  ThresholdCrossing,
  WorldState,
} from './cascade-types.js';

/** Configuration for a single threshold the engine watches each tick. */
export interface ThresholdConfig {
  readonly nodeId: NodeId;
  readonly threshold: number;
  readonly direction: 'above' | 'below';
  readonly priority: 'BLOCKING' | 'ADVISORY';
  /** Staff-message template key / event payload context (exact GDD string). */
  readonly reason: string;
}

/**
 * The 7 MVP thresholds from cascade-engine.md §Threshold Crossings.
 * Order matches GDD table order for deterministic crossings array.
 */
export const THRESHOLDS_MVP: readonly ThresholdConfig[] = Object.freeze([
  {
    nodeId: 'corruption_exposure',
    threshold: 80,
    direction: 'above',
    priority: 'BLOCKING',
    reason: 'Escándalo de corrupción — para el advance loop, evento narrativo forzado',
  },
  {
    nodeId: 'fan_momentum',
    threshold: 20,
    direction: 'below',
    priority: 'BLOCKING',
    reason: 'Fan base en crisis — para el advance loop, decisión narrativa forzada',
  },
  {
    nodeId: 'player_happiness',
    threshold: 25,
    direction: 'below',
    priority: 'BLOCKING',
    reason: 'Crisis del vestuario — para el advance loop, decisión narrativa forzada',
  },
  {
    nodeId: 'fan_momentum',
    threshold: 75,
    direction: 'above',
    priority: 'ADVISORY',
    reason: 'Momentum muy alto — staff celebra, mensajes positivos',
  },
  {
    nodeId: 'injury_risk',
    threshold: 70,
    direction: 'above',
    priority: 'ADVISORY',
    reason: 'Riesgo de lesiones crítico — médico advierte',
  },
  {
    nodeId: 'squad_available_pct',
    threshold: 60,
    direction: 'below',
    priority: 'ADVISORY',
    reason: 'Plantilla muy mermada — staff técnico preocupado',
  },
  {
    nodeId: 'field_quality',
    threshold: 30,
    direction: 'below',
    priority: 'ADVISORY',
    reason: 'Campo deteriorado — jardinero pide aumentar presupuesto',
  },
] as const);

/**
 * Compare prevState and nextState (post-clamp) against the configured
 * thresholds. Returns a crossing entry for any NEW transition through the
 * threshold value, regardless of which side the config's "alarm direction"
 * points to.
 *
 * The config's `direction` field indicates the *dangerous* direction (which
 * side is the alarm zone). The output's `direction` reflects the *actual*
 * movement — so an alarm-zone entry AND an alarm-zone exit both surface as
 * crossings (priority and reason are inherited from the same config). This
 * lets downstream consumers display both "scandal triggered" and "scandal
 * resolved" events from the same configured threshold (AC-C18-02b mirror).
 *
 * Pure — no allocation beyond the returned array; safe to call every tick.
 */
export function detectCrossings(
  prevState: Readonly<WorldState>,
  nextState: Readonly<WorldState>,
  configs: readonly ThresholdConfig[] = THRESHOLDS_MVP,
): readonly ThresholdCrossing[] {
  const crossings: ThresholdCrossing[] = [];

  for (const cfg of configs) {
    const prev = prevState[cfg.nodeId];
    const next = nextState[cfg.nodeId];
    if (prev === undefined || next === undefined) continue;

    let actualDirection: 'above' | 'below' | null = null;
    if (prev <= cfg.threshold && next > cfg.threshold) {
      actualDirection = 'above';
    } else if (prev >= cfg.threshold && next < cfg.threshold) {
      actualDirection = 'below';
    }

    if (actualDirection !== null) {
      crossings.push({
        nodeId: cfg.nodeId,
        threshold: cfg.threshold,
        direction: actualDirection,
        priority: cfg.priority,
        previousValue: prev,
        newValue: next,
        reason: cfg.reason,
      });
    }
  }

  return crossings;
}

/**
 * Canonical types for the cascade engine.
 *
 * Per ADR-002 (sim determinism): no I/O, no `Math.random()`, no `Date.now()`.
 * Per ADR-003 Rule 3: edges read `prevState` only; the `Readonly` modifier on
 *   `SimContext.prevState` surfaces violations at compile time.
 * Per ADR-003 Rule 10: cascade graph is data, not code — node ranges live in
 *   `NODE_RANGES` here, not inlined elsewhere.
 * Per ADR-005 + ADR-007 F10 + control-manifest cross-cutting rule:
 *   `WorldState` is `Record<NodeId, number>`, NOT `Map<>`. Map is not JSON-
 *   serializable (`JSON.stringify(new Map())` produces `{}`).
 *
 * Source of truth for the node catalog: `design/gdd/cascade-engine.md`
 *   §Catálogo de Nodos.
 *
 * Story: CASCADE-ENGINE-001
 * Control Manifest: 2026-05-19
 */

// ── Node catalog (20 nodes per cascade-engine.md §Catálogo de Nodos) ──────────

/**
 * The complete set of cascade engine state nodes. Each node is a scalar
 * float (or int for the streak nodes) with bounded range defined in
 * `NODE_RANGES`.
 *
 * Adding a node = add to this union + add a `NODE_RANGES` entry. Every chain
 * file (story 002) imports from here.
 */
export type NodeId =
  // Inputs — player-controlled budgets and intensities (5)
  | 'groundskeeper_budget'
  | 'training_intensity'
  | 'catering_budget'
  | 'ticket_price_index'
  | 'scouting_budget'
  // Internal state — cascade-driven (12)
  | 'field_quality'
  | 'injury_risk'
  | 'team_fitness'
  | 'staff_morale'
  | 'player_happiness'
  | 'fan_momentum'
  | 'fan_attendance'
  | 'consecutive_wins'
  | 'consecutive_losses'
  | 'scouting_points'
  | 'sponsor_quality'
  | 'corruption_exposure'
  // Static / sim-output — read but not driven by cascades (3)
  | 'team_skill'
  | 'match_performance_index'
  | 'squad_available_pct';

/**
 * Per-node bounds + default. Sourced from cascade-engine.md §Catálogo de Nodos.
 * Changing these affects balance — coordinate with /balance-check.
 */
export interface NodeRange {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/**
 * The complete range table. Matches cascade-engine.md §Catálogo de Nodos row-for-row.
 * Any divergence between this table and the GDD is a bug.
 */
export const NODE_RANGES: Readonly<Record<NodeId, NodeRange>> = {
  // Inputs
  groundskeeper_budget: { min: 0, max: 100, default: 50 },
  training_intensity:   { min: 0, max: 100, default: 50 },
  catering_budget:      { min: 0, max: 100, default: 50 },
  ticket_price_index:   { min: 0, max: 100, default: 50 },
  scouting_budget:      { min: 0, max: 100, default: 30 },
  // Internal state
  field_quality:        { min: 0, max: 100, default: 50 },
  injury_risk:          { min: 0, max: 100, default: 20 },
  team_fitness:         { min: 0, max: 100, default: 70 },
  staff_morale:         { min: 0, max: 100, default: 60 },
  player_happiness:     { min: 0, max: 100, default: 60 },
  fan_momentum:         { min: 0, max: 100, default: 60 },
  fan_attendance:       { min: 0, max: 100, default: 40 },
  consecutive_wins:     { min: 0, max: 10,  default: 0 },
  consecutive_losses:   { min: 0, max: 10,  default: 0 },
  scouting_points:      { min: 0, max: 100, default: 0 },
  sponsor_quality:      { min: 0, max: 100, default: 0 },
  corruption_exposure:  { min: 0, max: 100, default: 0 },
  // Static / sim-output
  team_skill:               { min: 0, max: 100, default: 50 },
  match_performance_index:  { min: 0, max: 100, default: 50 },
  squad_available_pct:      { min: 0, max: 100, default: 90 },
} as const;

/**
 * Convenience: ordered list of NodeIds. Useful for iteration in tests and
 * for the graph definition. Order matches NODE_RANGES key order.
 */
export const NODE_IDS: readonly NodeId[] = Object.keys(NODE_RANGES) as NodeId[];

// ── WorldState ────────────────────────────────────────────────────────────────

/**
 * The full state of the cascade engine at one tick. Every NodeId has a number.
 *
 * IMPORTANT: This is `Record<NodeId, number>`, NOT `Map<NodeId, number>`.
 * Map is not JSON-serializable — see header comment and control-manifest.
 */
export type WorldState = Record<NodeId, number>;

/**
 * Build a fresh WorldState from each node's documented default.
 *
 * Used by world-gen (per ADR-016) and by tests that need a baseline.
 * Always returns a new object — never aliases a cached state.
 */
export function defaultWorldState(): WorldState {
  const state = {} as WorldState;
  for (const id of NODE_IDS) {
    state[id] = NODE_RANGES[id].default;
  }
  return state;
}

// ── Simulation context ────────────────────────────────────────────────────────

/**
 * Read-only context passed to every cascade edge's `transferFn`.
 *
 * Per ADR-002:
 * - `rng()` is the ONLY source of randomness.
 * - The function is deterministic in (prevState, decisions, rng-stream).
 *
 * Per ADR-003 Rule 3:
 * - Edges read `prevState`. They never mutate it (enforced by Readonly type).
 *
 * Per cascade-engine.md §Catálogo (C11/C14 guard):
 * - `hasMatchThisWeek` gates match-only chains.
 */
export interface SimContext {
  /** Seeded PRNG returning a float in [0, 1). Never `Math.random()`. */
  readonly rng: () => number;
  /** The week number (1-indexed) being computed. Used for delayed-effect maturation. */
  readonly currentWeek: number;
  /** Whether a fixture for the manager's club is scheduled this week. Gates C11/C14. */
  readonly hasMatchThisWeek: boolean;
  /** The previous tick's WorldState. Edges read from this; they do NOT mutate it. */
  readonly prevState: Readonly<WorldState>;
}

// ── Player decisions ──────────────────────────────────────────────────────────

/**
 * A discrete write into the next tick's state, applied at Step 3 of the tick
 * algorithm (per cascade-engine.md §States and Transitions). Sources include:
 *
 *   - Player UI inputs (training_intensity, ticket_price_index, etc.)
 *   - Event-system resolutions (per ADR-015 EventDecisionPayload resolver)
 *   - Economy weekly flow (per ADR-014 applyWeeklyFlow)
 *
 * `source` is for audit/log only — the engine treats all decisions identically.
 */
export interface PlayerDecision {
  readonly nodeId: NodeId;
  readonly delta: number;
  readonly source: string;
}

// ── Forward refs (populated by stories 003 + 014) ─────────────────────────────

/**
 * Effect scheduled by a delayed edge. Full type body lives in
 * `packages/shared/src/sim/delayed-effects.ts` (story 003).
 */
export interface DelayedEffect {
  readonly nodeId: NodeId;
  readonly delta: number;
  /** Tick index at which this effect matures and is applied (Step 1 of next tick). */
  readonly applyAtWeek: number;
  /** Originating edge id, for audit/log only. */
  readonly source: string;
}

/**
 * Per-edge log entry produced during runTick. Used by tests + admin/debug
 * interface. Full structure may grow in story 014.
 */
export interface CascadeLog {
  readonly edgeId: string;
  readonly nodeId: NodeId;
  readonly delta: number;
  readonly week: number;
}

/**
 * Detected threshold transition. Full type body + crossing detection lives in
 * `packages/shared/src/sim/threshold-detector.ts` (story 014).
 */
export interface ThresholdCrossing {
  readonly nodeId: NodeId;
  readonly threshold: number;
  readonly direction: 'above' | 'below';
  readonly priority: 'BLOCKING' | 'ADVISORY';
  readonly reason: string;
}

/**
 * The complete result of a single tick. Returned by `runTick()` (story 004).
 *
 * `nextState` is always a fresh object — Step 4 clamping has been applied.
 * `newDelayedEffects` are the effects emitted THIS tick that mature in
 *   future ticks. They are NOT yet merged with the inherited buffer; the
 *   caller (advance-worker) merges via `mergeDelayedBuffer()` from
 *   delayed-effects.ts (story 003).
 */
export interface TickResult {
  readonly nextState: WorldState;
  readonly newDelayedEffects: readonly DelayedEffect[];
  readonly log: readonly CascadeLog[];
  readonly thresholdCrossings: readonly ThresholdCrossing[];
  readonly week: number;
}

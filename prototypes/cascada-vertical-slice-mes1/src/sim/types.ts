// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does the discover-cascades fantasy survive integration with match-sim + economy?
// Date: 2026-05-18

/**
 * NodeId catalog — subset of cascade-engine.md used by this slice.
 * Production code will use the full MVP catalog (~20 nodes).
 */
export type NodeId =
  // Inputs (player-controlled)
  | "training_intensity"
  | "ticket_price_index"
  // Internal state — written by cascades
  | "team_fitness"
  | "staff_morale"
  | "fan_momentum"
  | "fan_attendance"
  | "match_performance_index"
  | "injury_risk"
  // Static / context — read-only in the slice
  | "field_quality"
  | "player_happiness"
  | "team_skill"
  | "squad_available_pct"
  | "consecutive_wins"
  | "consecutive_losses";

export type WorldState = Record<NodeId, number>;

/** Per-node range used for clamping at end of tick. */
export const NODE_RANGES: Record<NodeId, readonly [min: number, max: number]> = {
  training_intensity: [0, 100],
  ticket_price_index: [0, 100],
  team_fitness: [0, 100],
  staff_morale: [0, 100],
  fan_momentum: [0, 100],
  fan_attendance: [0, 100],
  match_performance_index: [0, 100],
  injury_risk: [0, 100],
  field_quality: [0, 100],
  player_happiness: [0, 100],
  team_skill: [0, 100],
  squad_available_pct: [0, 100],
  consecutive_wins: [0, 10],
  consecutive_losses: [0, 10],
};

/**
 * Effect scheduled by a delayed edge — applied at the start of the tick
 * matching `applyAtWeek`.
 */
export interface DelayedEffect {
  toNode: NodeId;
  delta: number;
  applyAtWeek: number;
  sourceEdgeId: string;
}

/** Player input for a tick (Step 3 in the algorithm). */
export type PlayerDecisions = Partial<Record<NodeId, number>>;

export type ThresholdPriority = "BLOCKING" | "ADVISORY";
export type ThresholdDirection = "above" | "below";

export interface ThresholdConfig {
  nodeId: NodeId;
  value: number;
  direction: ThresholdDirection;
  priority: ThresholdPriority;
  /** Identifier for downstream consumers (staff-system, event-system). */
  reason: string;
}

export interface ThresholdCrossing {
  nodeId: NodeId;
  value: number;
  threshold: number;
  direction: ThresholdDirection;
  priority: ThresholdPriority;
  reason: string;
}

/**
 * SimContext provided to every edge transferFn. Pure-function contract —
 * no I/O, no Math.random.
 */
export interface SimContext {
  /** Seeded PRNG. */
  rng: () => number;
  /** Read-only previous state (Rule 3 of cascade-engine.md). */
  prevState: Readonly<WorldState>;
  /** Whether this tick has a scheduled match — gates C11, C14. */
  hasMatchThisWeek: boolean;
  /** Current in-game week (used to compute applyAtWeek for delays). */
  currentWeek: number;
}

/** Static definition of one cascade edge. Data, not code (Rule 10). */
export interface CascadeEdgeDef {
  id: string;
  /** Counterintuitive flag for design audit only — no runtime behavior. */
  counterintuitive: boolean;
  /** Display name for log output. */
  description: string;
  /** Delay in weeks (0 = same tick). */
  delay: number;
  /** Node(s) read — for documentation / dependency analysis. */
  reads: readonly NodeId[];
  /** Node written. */
  to: NodeId;
  /** Whether this edge only evaluates on match weeks. */
  matchWeekOnly: boolean;
  /** Pure transfer function — returns delta to add to `to`. */
  transferFn: (ctx: SimContext) => number;
}

/** Entry written to the per-tick log for debug + UI playback. */
export interface CascadeLogEntry {
  edgeId: string;
  to: NodeId;
  delta: number;
  delay: number;
  scheduledFor: number;
}

export interface TickResult {
  nextState: WorldState;
  newDelayedEffects: DelayedEffect[];
  log: CascadeLogEntry[];
  thresholdCrossings: ThresholdCrossing[];
  /** Week number of the tick that just completed. */
  week: number;
}

// ── Match simulation (per match-simulation.md F1-F10) ────────────────────────

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

/**
 * Player stats subset used by the slice's match algorithm.
 * Production version will source these from packages/shared/types/player.ts.
 */
export interface PlayerStats {
  id: string;
  name: string;
  position: PlayerPosition;
  // Universal stats
  skill: number; // [0,100]
  fitness: number; // [0,100]
  morale: number; // [0,100]
  form: number; // [30,90]
  stamina: number; // [40,100] floor 40 per player-management.md
  // Position-specific (only the relevant ones for the player's position are read)
  reflexes?: number;
  handling?: number;
  strength?: number;
  tackling?: number;
  passing?: number;
  vision?: number;
  speed?: number;
  finishing?: number;
}

export type Lineup = readonly PlayerStats[]; // 11 players, 4-4-2: 1 GK, 4 DEF, 4 MID, 2 FWD

export type MatchEventType =
  | "goal"
  | "yellow_card"
  | "injury"
  | "match_start"
  | "half_time"
  | "full_time";

export interface MatchEvent {
  type: MatchEventType;
  minute: number;
  team?: "home" | "away";
  playerId?: string;
  /** Only set on injury events per match-simulation.md §Contrato de Señal Causal. */
  causalNode?: "injury_risk" | null;
  /** Injury severity. */
  severity?: "minor" | "major";
}

/** Inputs to the pure simulateMatch function. */
export interface MatchInput {
  homeClubId: string;
  awayClubId: string;
  homeLineup: Lineup;
  awayLineup: Lineup;
  /** Read-only world state at kickoff. */
  worldState: Readonly<WorldState>;
  /** Which side is the human player's club — for MPI perspective in F8. */
  playerClubSide: "home" | "away";
  /** Deterministic seed for this match. */
  seed: string;
}

/** Pure-function output of simulateMatch. */
export interface MatchOutcome {
  homeScore: number;
  awayScore: number;
  winner: "home" | "away" | "draw";
  events: MatchEvent[];
  /**
   * Deltas applied to the cascade engine WorldState. Per match-simulation.md,
   * only TWO nodes are written: match_performance_index and injury_risk.
   * fan_momentum is propagated by cascade C6, not by the match.
   */
  worldStateDeltas: {
    match_performance_index: number;
    injury_risk: number;
  };
  /**
   * Per-player match rating (F10). Record (NOT Map) for JSON serializability.
   * Slice subset: only players from the player's club with minutes_played ≥ 30.
   */
  playerRatings: Record<string, number>;
}

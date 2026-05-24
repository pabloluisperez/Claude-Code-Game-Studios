/**
 * Match simulation domain types for the football plugin.
 *
 * Per ADR-007 (SportPlugin + MatchOutcome shape): MatchOutcome.worldStateDeltas
 * uses Record<string, number>, NOT Map — per control-manifest §JSON Rule (Map is
 * not JSON-serializable) and GDD R6 fix.
 * Per ADR-013 (MatchSessionSnapshot): MatchSessionState FSM includes 'failed' state.
 *
 * Story: MATCH-SIM-001
 * Control Manifest: 2026-05-19
 */

// ── Player model ──────────────────────────────────────────────────────────────

export type Position = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';

/**
 * Universal player stats plus position-specific optional stats.
 *
 * Position-specific stats are present only when the player's position matches:
 *   - GK: reflexes, handling
 *   - DEF: strength, tackling
 *   - MID: passing, vision
 *   - FWD: speed, finishing
 *
 * `assignedAs` is the emergency goalkeeping marker (AC-MATCH-17): a DEFENDER
 * with assignedAs='GOALKEEPER' has derived reflexes = skill×0.4, handling = skill×0.3
 * computed at conversion time (story 007). The canonical position remains 'DEFENDER'.
 */
export interface PlayerStats {
  readonly id: string;
  readonly position: Position;
  readonly skill: number;      // [0, 100]
  readonly fitness: number;    // [0, 100]
  readonly morale: number;     // [0, 100]
  readonly form: number;       // [30, 90]
  readonly stamina: number;    // [40, 100]
  // Position-specific stats (optional — only present when position matches).
  // Downstream callers: use ?? 50 for default (noUncheckedIndexedAccess returns number|undefined).
  // See football-formulas.ts stat helpers (story 003).
  readonly reflexes?: number;  // GK
  readonly handling?: number;  // GK
  readonly strength?: number;  // DEF
  readonly tackling?: number;  // DEF
  readonly passing?: number;   // MID
  readonly vision?: number;    // MID
  readonly speed?: number;     // FWD
  readonly finishing?: number; // FWD
  // Emergency GK marker — DEF playing as GK (AC-MATCH-17)
  readonly assignedAs?: Position;
}

/** A single player slot in a lineup (11 starters + up to 7 bench, total ≤ 18). */
export interface PlayerSlot {
  readonly player: PlayerStats;
  readonly slotIndex: number;
}

/**
 * An ordered list of player slots for one team.
 * 11 starters + up to 7 bench; total ≤ 18. Preserved across re-enqueue boundaries.
 */
export type Lineup = readonly PlayerSlot[];

// ── Tactical types ────────────────────────────────────────────────────────────

export type FormationPreset = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2';

/**
 * A tactical instruction applied to a team for the full match.
 * Mutually exclusive — only one may be active per team per match (AC-MATCH-29).
 * Stored as TeamInstruction | null in MatchInput and MatchSessionSnapshot.
 */
export type TeamInstruction = 'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER';

// ── Match events ──────────────────────────────────────────────────────────────

/**
 * Discriminated union of all match event types.
 * 'substitution_window' is emitted to MatchSessionSnapshot.eventsAccumulated
 * but is EXCLUDED from MatchOutcome.events (AC-MATCH-30).
 */
export type MatchEventType =
  | 'goal'
  | 'goal_disallowed'
  | 'yellow_card'
  | 'red_card'
  | 'red_downgraded'
  | 'injury'
  | 'substitution'
  | 'substitution_window'
  | 'playing_with_ten'
  | 'var_review'
  | 'forfeit';

/**
 * A single match event.
 *
 * `causal_node` is REQUIRED (not optional) on every event:
 * - For injury events: MUST be 'injury_risk' (AC-MATCH-28).
 * - For all other event types in MVP: null is allowed.
 */
export interface MatchEvent {
  readonly type: MatchEventType;
  readonly minute: number;
  readonly team?: 'home' | 'away' | undefined;
  readonly player_id?: string | undefined;
  /** For injury events: 'injury_risk' (AC-MATCH-28). For all others in MVP: null allowed. */
  readonly causal_node: string | null;
  /**
   * Optional discriminator for sub-types of an event. Examples:
   *   red_card: 'direct' | 'second_yellow'
   *   injury:   'tackle' | 'fatigue'
   * Stays absent for events that have no sub-type.
   */
  readonly reason?: string | undefined;
}

// ── Match input ───────────────────────────────────────────────────────────────

/**
 * Pre-match cascade world-state snapshot loaded once at match-create.
 * All values are numbers sourced from the cascade engine WorldState at the
 * time the match is scheduled.
 */
export interface PreMatchSnapshot {
  readonly team_fitness: number;
  readonly team_skill: number;
  readonly squad_available_pct: number;
  readonly field_quality: number;
  readonly fan_attendance: number;
  readonly staff_morale: number;
  readonly player_happiness: number;
  /**
   * F9 / P_injury: the player's-club injury_risk. Match-sim uses this for
   * own-team injury rolls. Rival injuries use RIVAL_INJURY_RISK_CONST=50.
   * Added 2026-05-19 (MATCH-SIM-009) — flagged for GDD R7 doc fix.
   */
  readonly injury_risk: number;
}

/** Full input contract for the match simulation engine. */
export interface MatchInput {
  readonly seed: string;
  readonly homeLineup: Lineup;
  readonly awayLineup: Lineup;
  readonly homeFormation: FormationPreset;
  readonly awayFormation: FormationPreset;
  readonly homeInstruction: TeamInstruction | null;
  readonly awayInstruction: TeamInstruction | null;
  readonly preMatchSnapshot: PreMatchSnapshot;
  readonly playerClubSide: 'home' | 'away';
  readonly playerClubId: string;
  readonly decisionTimeoutMs?: number;
}

// ── Match outcome ─────────────────────────────────────────────────────────────

/**
 * The final result of a completed match simulation.
 *
 * Invariants:
 * - `winner` is derived from scores — never set independently.
 * - `events` EXCLUDES type='substitution_window' per AC-MATCH-30
 *   (those are accumulated in MatchSessionSnapshot and filtered at outcome stage).
 * - `worldStateDeltas` has EXACTLY 2 keys: 'match_performance_index' and 'injury_risk'
 *   per AC-MATCH-05.
 *   NOTE: ADR-007 line 109 shows ReadonlyMap; superseded by GDD R6 + control-manifest
 *   2026-05-19 — use Record. ADR-007 will be amended in a sync chore after this story lands.
 *   ADR-007 originally used ReadonlyMap — resolved to Record<string, number> per
 *   control-manifest §JSON Rule and GDD R6 fix.
 * - `playerRatings` uses Record<string, number>, NOT Map — per control-manifest §JSON Rule
 *   (GDD originally said Map<player_id, number>; GDD R6 corrected to Record).
 * - `playerRatings` includes only players with ≥30 minutes played (formula F10).
 */
export interface MatchOutcome {
  readonly homeScore: number;
  readonly awayScore: number;
  /** Derived from scores — never set independently. */
  readonly winner: 'home' | 'away' | 'draw';
  /**
   * Match events. EXCLUDES type='substitution_window' per AC-MATCH-30.
   * substitution_window events live in MatchSessionSnapshot.eventsAccumulated.
   */
  readonly events: readonly MatchEvent[];
  /**
   * EXACTLY { match_performance_index, injury_risk } per AC-MATCH-05.
   * Uses Record<string, number>, NOT Map — per control-manifest §JSON Rule.
   */
  readonly worldStateDeltas: Record<string, number>;
  /**
   * Player ratings for players with ≥30 minutes played (formula F10).
   * Record<player_id, rating>. Uses Record, NOT Map — per control-manifest §JSON Rule.
   */
  readonly playerRatings: Record<string, number>;
  readonly finalLineupHome: Lineup;
  readonly finalLineupAway: Lineup;
}

// ── Match session state machine ───────────────────────────────────────────────

/**
 * Finite state machine states for a match session.
 * 'failed' is required by ADR-013 to represent unrecoverable simulation errors.
 * 'archived' allows completed sessions to be moved out of the active query path.
 */
export type MatchSessionState =
  | 'pre_match'
  | 'in_progress'
  | 'paused_for_decision'
  | 'completed'
  | 'failed'      // ADR-013 required state
  | 'archived';

/**
 * The persisted snapshot of a match session across re-enqueue boundaries.
 * Per ADR-013 (MatchSessionSnapshot): this is the BullMQ job payload shape
 * stored in Redis and written to DB at each pause point.
 *
 * Key design decisions:
 * - `eventsAccumulated` INCLUDES substitution_window events (filtered at MatchOutcome stage).
 * - `prngState` is JSON.stringify(seedrandom().state()) — ADR-013 Option B.
 * - `yellowCardsByPlayerId` uses Record, NOT Map — per control-manifest §JSON Rule.
 * - `substitutionsUsed` is the shared pool (voluntary + forced) for the player's team.
 * - `awaySubstitutionsUsed` is the independent rival AI substitution pool.
 */
export interface MatchSessionSnapshot {
  readonly currentTick: number;
  /**
   * INCLUDES substitution_window events. These are filtered out at MatchOutcome
   * construction time per AC-MATCH-30.
   */
  readonly eventsAccumulated: readonly MatchEvent[];
  readonly currentLineupHome: Lineup;
  readonly currentLineupAway: Lineup;
  readonly homeMomentum: number;
  /** Shared substitution pool (voluntary + forced) for the player's team. */
  readonly substitutionsUsed: number;
  /** Independent rival AI substitution pool. */
  readonly awaySubstitutionsUsed: number;
  /** Record<player_id, yellowCardCount>. Uses Record, NOT Map — per control-manifest §JSON Rule. */
  readonly yellowCardsByPlayerId: Record<string, number>;
  readonly currentFormationHome: FormationPreset;
  readonly currentFormationAway: FormationPreset;
  readonly activeInstructionHome: TeamInstruction | null;
  readonly activeInstructionAway: TeamInstruction | null;
  /** JSON.stringify(seedrandom().state()) — ADR-013 Option B for PRNG serialization. */
  readonly prngState: string;
  readonly state: MatchSessionState;
  readonly timeoutJobId: string | null;
}

// ── Socket.IO event types ─────────────────────────────────────────────────────

/**
 * Emitted when the match engine pauses for a player decision.
 * Per GDD §"Tipos de Socket.IO (R6)".
 */
export interface MatchPauseEvent {
  readonly type: 'match:paused';
  readonly sessionId: string;
  readonly minute: number;
  readonly snapshot: MatchSessionSnapshot;
}

/**
 * Emitted when the player submits a decision and the match resumes.
 * Per GDD §"Tipos de Socket.IO (R6)".
 */
export interface MatchResumedEvent {
  readonly type: 'match:resumed';
  readonly sessionId: string;
  readonly minute: number;
}

/**
 * Emitted when the match simulation reaches its final state.
 * Per GDD §"Tipos de Socket.IO (R6)".
 */
export interface MatchCompleteEvent {
  readonly type: 'match:complete';
  readonly sessionId: string;
  readonly outcome: MatchOutcome;
}

// ── Match event emitter interface ─────────────────────────────────────────────

/**
 * Interface the match engine uses to emit events.
 * Required by ADR-013 for testability — allows test doubles to intercept events
 * without running the full match worker or a real Socket.IO server.
 *
 * The union type covers all emittable event shapes; implementations route
 * Socket.IO events and raw MatchEvents to the appropriate channels.
 */
export interface MatchEventEmitter {
  emit(event: MatchPauseEvent | MatchResumedEvent | MatchCompleteEvent | MatchEvent): void;
  getAccumulated(): readonly MatchEvent[];
}

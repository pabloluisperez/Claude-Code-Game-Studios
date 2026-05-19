/**
 * Cascade graph data model — CascadeEdgeDef + CASCADA_FC_GRAPH skeleton.
 *
 * Per ADR-003 Rule 10 "data not code": the entire cascade graph is a data
 * structure in this file. The engine (cascade-engine.ts, story 004) reads it
 * without modification. Adding or re-tuning a cascade = change this file only.
 *
 * Per ADR-003 Rule 3: `transferFn` receives `prevState` and `ctx`. It reads
 * prevState; it NEVER mutates it. `ctx.prevState` is the same snapshot, typed
 * Readonly<WorldState>, surfaced for multi-input edges (C8, C10/C4, C12).
 *
 * Per control-manifest Forbidden:
 *   - All balance constants live here, NEVER inlined in the engine.
 *   - `match_performance_index` may only be written by C11, C14, and C16b (all
 *     three allow-listed below). All other edges writing to it are forbidden.
 *
 * Story: CASCADE-ENGINE-002
 * Control Manifest: 2026-05-19
 * GDD: design/gdd/cascade-engine.md §Catálogo de Cadenas + §Formulas
 */

import type { NodeId, WorldState, SimContext } from './cascade-types.js';
import { NODE_IDS } from './cascade-types.js';

// ── Named constants (GDD §Formulas, verbatim) ─────────────────────────────────
// Balance changes: update ONLY the constant here — never inline a magic number.
// Every constant name below has a 1:1 mapping to the GDD Formulas section.

/** C0 — Natural fitness decay rate toward equilibrium 70. */
export const K_fit_decay = 0.05;

/** C1a — Transfer constant: groundskeeper_budget → field_quality. */
export const K_ground = 0.30;

/** C1b — Threshold above which a field is considered excellent (safe). */
export const T_safe_high = 75;
/** C1b — Threshold at which field mediocrity produces maximum injury risk. */
export const T_danger_peak = 45;
/** C1b — Threshold below which a field is so poor players play cautiously. */
export const T_safe_low = 20;
/** C1b — Fixed negative delta when field_quality ≥ T_safe_high. */
export const K_safe_high = 6.0;
/** C1b — Slope of the danger zone (mediocre field → rising injury risk). */
export const K_danger = 0.25;
/** C1b — Fixed negative delta when field_quality ≤ T_safe_low. */
export const K_safe_low = 3.0;

/** C4 — Maximum fitness gain at sweet spot (training_intensity = 50, full morale). */
export const K_C4 = 8.0;
/** C4 / C12 — Lower threshold of training intensity. Below → undertraining. */
export const T_low = 25;
/** C4 — Upper threshold of training intensity. Above → overtraining. */
export const T_high = 75;
/** C4 — normalizer for the inverted parabola: (T_high - T_low)² / 4. */
export const C4_PARABOLA_NORMALIZER = ((T_high - T_low) ** 2) / 4;
/** C4 / C10 — Minimum effectiveness of training when staff_morale = 0. */
export const MORALE_SCALE_MIN = 0.5;

/** C5a — Fitness delta per point of catering_budget deviation from 50. */
export const K_catering_fit = 3.0;
/** C5b — Staff morale delta per point of catering_budget deviation from 50. */
export const K_catering_moral = 4.0;

/** C6 — Gain constant for match win (MPI ≥ 50). */
export const K_win_base = 8.0;
/** C6 — Loss constant for match defeat (MPI < 50). */
export const K_loss_base = 8.0;

/** C7 — Streak bonus multiplier (quadratic-ish). */
export const K_streak_base = 2.0;

/** C8 — Maximum attendance achievable from momentum alone (+ ATTEND_MIN_BASE). */
export const ATTEND_MAX_BASE = 60;
/** C8 — Minimum attendance (unconditional supporters). */
export const ATTEND_MIN_BASE = 5;
/** C8 — Higher = momentum protects more against high prices. */
export const MOMENTUM_TOLERANCE_DIVISOR = 120;
/** C8 — Attendance bonus per point of ticket_price_index below 50. */
export const PRICE_BONUS_K = 0.25;

/** C9a — Scouting points generated at scouting_budget = 100. */
export const K_scouting = 15.0;
/** C9a — Weekly decay rate of scouting_points (reports become stale). */
export const DECAY_scouting = 0.08;
/** C9b — Minimum scouting_points for C9b to produce any squad benefit. */
export const T_scouting_active = 50;
/** C9b — Maximum squad_available_pct bonus from scouting. */
export const K_scouting_roster = 5.0;

/** C2 — Loss of squad_available_pct per point of injury_risk above base. */
export const K_injury = 0.30;
/** C2 — Baseline injury risk level (no penalty applies below this). */
export const IR_base = 20;

/** C2, C4, C9a, C14 noise amplitudes (±AMP/2 from seeded rng). */
export const NOISE_C2_AMP = 2.0;
export const NOISE_C4_AMP = 2.0;
export const NOISE_C9a_AMP = 2.0;
export const NOISE_C14_AMP = 2.0;

/** C3 — Fitness lost per point of field_quality below T_field_poor. */
export const K_field_fatigue = 0.10;
/** C3 — Threshold below which poor field causes fitness fatigue. */
export const T_field_poor = 40;

/** C11 — Staff morale impact on match performance. */
export const K_morale_perf = 8.0;

/** C12 — Maximum fitness drain (CL=10, training_intensity=100). */
export const K_desperation = 10.0;
/** C12 — Training intensity below which no desperation overtraining occurs. */
export const T_desperation_threshold = 50;
/** C12 — Exponent making damage grow faster with longer losing streaks. */
export const DESPERATION_EXP = 1.5;

/** C13 — Fitness delta per point of squad_available_pct deviation from optimal. */
export const K_squad_fit = 5.0;
/** C13 — Optimal squad availability percentage. */
export const SQ_optimal = 75;

/** C14 — Home field advantage on match performance. */
export const K_home_advantage = 6.0;

/** C15 — Weekly fan_momentum erosion per point of ticket_price above danger threshold. */
export const K_price_erosion = 0.12;
/** C15 — ticket_price_index above which loyalty starts eroding (delay: 2w). */
export const T_price_danger = 65;

/** C16a — player_happiness impact on team_fitness. */
export const K_happy_fit = 4.0;
/** C16b — player_happiness impact on match_performance_index (guard: hasMatchThisWeek). */
export const K_happy_perf = 7.0;

/** C17 — Happiness delta per point of sponsor_quality. */
export const K_sponsor_happy = 5.0;

/** C18a — Weekly decay rate of corruption_exposure. */
export const K_corruption_decay = 0.05;

/** C18b — Fan momentum penalty when corruption scandal breaks (ThresholdCrossing BLOCKING). */
export const SCANDAL_FAN_IMPACT = 30;

// ── CascadeEdgeDef ────────────────────────────────────────────────────────────

/**
 * A single directed edge in the cascade graph.
 *
 * - `fromNode` is the primary driver; other inputs are read via `ctx.prevState`.
 * - `transferFn` returns a delta (NOT the new value). It must be pure.
 * - `guardFn` returning false skips the edge entirely this tick.
 * - `delay` determines when the delta is applied: 0 = this tick, 1+ = future ticks.
 * - `counterintuitive` is metadata only — used by design-review tooling (AC #6).
 *
 * Per control-manifest: transferFn bodies land in stories 006–013. Until then,
 * each `transferFn` below throws with the responsible story ID.
 */
export interface CascadeEdgeDef {
  readonly id: string;
  readonly fromNode: NodeId;
  readonly toNode: NodeId;
  readonly delay: 0 | 1 | 2;
  readonly guardFn?: (prevState: Readonly<WorldState>, ctx: SimContext) => boolean;
  readonly transferFn: (prevState: Readonly<WorldState>, ctx: SimContext) => number;
  /** True for the 7 counterintuitive chains per GDD Core Rule 7. */
  readonly counterintuitive: boolean;
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

/** Shared guard: evaluates only in ticks that have a fixture (C11, C14, C16b). */
const guardHasMatch = (_prevState: Readonly<WorldState>, ctx: SimContext): boolean =>
  ctx.hasMatchThisWeek;

/** C18a guard: corruption decay does NOT apply when already in BLOCKING zone (≥ 80). */
const guardCorruptionDecay = (prevState: Readonly<WorldState>, _ctx: SimContext): boolean =>
  prevState.corruption_exposure < 80;

// ── Placeholder transferFn factory ───────────────────────────────────────────

function notYetImplemented(storyId: string): () => never {
  return (): never => {
    throw new Error(
      `transferFn not yet implemented — see story ${storyId} for the formula body.`
    );
  };
}

// ── CASCADA_FC_GRAPH ──────────────────────────────────────────────────────────

/**
 * The complete cascade graph for Cascada FC MVP.
 *
 * 22 edges. Count: C0, C1a, C1b, C2, C3, C4, C5a, C5b, C6, C7, C8, C9a, C9b,
 * C11, C12, C13, C14, C15, C16a, C16b, C17, C18a.
 *
 * Notable absences:
 * - C10 is NOT an edge — it is a multiplier integrated inside C4's transferFn.
 * - C18b is NOT in the graph — it is an event-system consequence of the
 *   corruption_exposure BLOCKING ThresholdCrossing (ADR-015).
 *
 * Per ADR-003 Rule 3: edges read ctx.prevState. They never write to nextState
 * directly — they return deltas.
 *
 * FROZEN: mutations throw at runtime. TypeScript enforces readonly at compile time.
 */
export const CASCADA_FC_GRAPH: readonly CascadeEdgeDef[] = Object.freeze([
  // ── C0: Natural team_fitness decay toward equilibrium 70 ──────────────────
  // cascade-engine.md §C0
  // Simple mean-reversion: −5% of deviation per week.
  // NOT counterintuitive — it's the "baseline" edge every player feels first.
  {
    id: 'C0',
    fromNode: 'team_fitness',
    toNode: 'team_fitness',
    delay: 0,
    transferFn: (prevState: Readonly<WorldState>) =>
      -K_fit_decay * (prevState.team_fitness - 70),
    counterintuitive: false,
  },

  // ── C1a: groundskeeper_budget → field_quality ─────────────────────────────
  // cascade-engine.md §C1a
  // Linear: (budget − 50) × K_ground. delay:1 — field improves next week.
  {
    id: 'C1a',
    fromNode: 'groundskeeper_budget',
    toNode: 'field_quality',
    delay: 1,
    transferFn: (prevState: Readonly<WorldState>) =>
      (prevState.groundskeeper_budget - 50) * K_ground,
    counterintuitive: false,
  },

  // ── C1b: field_quality → injury_risk (COUNTERINTUITIVE) ───────────────────
  // cascade-engine.md §C1b
  // A mediocre field (20–75) is MORE dangerous than a bad or excellent one.
  // Three-branch piecewise: excellent (−K_safe_high), mediocre (+slope),
  // very poor (−K_safe_low). delay:0 — risk is immediate.
  // Branches (R3 fix: branch A uses ≥75, NOT >75):
  //   F_q ≥ 75            → delta = -K_safe_high                   (excellent → safe)
  //   45 < F_q < 75       → delta = -(F_q - T_danger_peak)×K_danger (upper danger zone)
  //   20 < F_q ≤ 45       → delta = +(T_danger_peak - F_q)×K_danger (mediocre danger peak)
  //   F_q ≤ 20            → delta = -K_safe_low                    (catastrophic → cautious)
  {
    id: 'C1b',
    fromNode: 'field_quality',
    toNode: 'injury_risk',
    delay: 0,
    transferFn: (prevState: Readonly<WorldState>) => {
      const fq = prevState.field_quality;
      if (fq >= T_safe_high)   return -K_safe_high;
      if (fq > T_danger_peak)  return -(fq - T_danger_peak) * K_danger;
      if (fq > T_safe_low)     return (T_danger_peak - fq) * K_danger;
      return -K_safe_low;
    },
    counterintuitive: true,
  },

  // ── C2: injury_risk → squad_available_pct ────────────────────────────────
  // cascade-engine.md §C2
  // Linear penalty above IR_base + noise. delay:1 — injuries take a week to
  // reduce availability (medical assessment lag).
  // Formula: delta = -K_injury × (IR_prev − IR_base) + (rng() − 0.5) × NOISE_C2_AMP
  // Story: CASCADE-ENGINE-007
  {
    id: 'C2',
    fromNode: 'injury_risk',
    toNode: 'squad_available_pct',
    delay: 1,
    transferFn: (prevState: Readonly<WorldState>, ctx: SimContext) => {
      const base = -K_injury * (prevState.injury_risk - IR_base);
      const noise = (ctx.rng() - 0.5) * NOISE_C2_AMP;
      return base + noise;
    },
    counterintuitive: false,
  },

  // ── C3: field_quality → team_fitness ─────────────────────────────────────
  // cascade-engine.md §C3
  // Poor field (< T_field_poor) causes extra fatigue during training.
  // delay:0 — physical toll is immediate.
  // Formula: delta = -K_field_fatigue × max(0, T_field_poor − field_quality)
  // Asymmetric: good fields (≥40) produce zero — they stop hurting, not helping.
  // Story: CASCADE-ENGINE-007
  {
    id: 'C3',
    fromNode: 'field_quality',
    toNode: 'team_fitness',
    delay: 0,
    transferFn: (prevState: Readonly<WorldState>) =>
      -K_field_fatigue * Math.max(0, T_field_poor - prevState.field_quality),
    counterintuitive: false,
  },

  // ── C4: training_intensity → team_fitness (COUNTERINTUITIVE) ──────────────
  // cascade-engine.md §C4
  // Inverted parabola with roots at T_low=25 and T_high=75; peak at intensity=50.
  // Both extremes (overtraining > T_high, undertraining < T_low) HURT fitness.
  // Only the sweet spot [T_low, T_high] benefits fitness.
  // delay:1 — training effects appear next week.
  //
  // C10 staff_morale multiplier integrated here per cascade-engine.md §C10
  // (C10 is NOT a separate edge).
  // Multiplier maps SM ∈ [0,100] → [MORALE_SCALE_MIN, 1.0]:
  //   SM=0   → multiplier = MORALE_SCALE_MIN = 0.5  (50% efficiency, never zero)
  //   SM=50  → multiplier = 0.75
  //   SM=100 → multiplier = 1.0  (full efficiency)
  //
  // Story: CASCADE-ENGINE-008
  {
    id: 'C4',
    fromNode: 'training_intensity',
    toNode: 'team_fitness',
    delay: 1,
    transferFn: (prevState: Readonly<WorldState>, ctx: SimContext) => {
      const SM_prev = prevState.staff_morale;
      const I_train = prevState.training_intensity;
      // C10 multiplier: MORALE_SCALE_MIN + (SM / 100) × (1 − MORALE_SCALE_MIN)
      const K_C4_eff = K_C4 * (MORALE_SCALE_MIN + (SM_prev / 100) * (1 - MORALE_SCALE_MIN));
      // Parabola roots at T_low and T_high; normalizer = (T_high − T_low)² / 4 = 625
      const base = K_C4_eff * (I_train - T_low) * (T_high - I_train) / C4_PARABOLA_NORMALIZER;
      // Symmetric noise: ±NOISE_C4_AMP/2 (seeded rng, never Math.random())
      const noise = (ctx.rng() - 0.5) * NOISE_C4_AMP;
      return base + noise;
    },
    counterintuitive: true,
  },

  // ── C5a: catering_budget → team_fitness ──────────────────────────────────
  // cascade-engine.md §C5a
  // Linear: better catering = better fitness. delay:1 — nutrition takes a week.
  {
    id: 'C5a',
    fromNode: 'catering_budget',
    toNode: 'team_fitness',
    delay: 1,
    transferFn: notYetImplemented('CASCADE-ENGINE-007'),
    counterintuitive: false,
  },

  // ── C5b: catering_budget → staff_morale ──────────────────────────────────
  // cascade-engine.md §C5b
  // Staff morale is more catering-sensitive than players (K_catering_moral > K_catering_fit).
  // delay:1 — morale effects lag one week.
  {
    id: 'C5b',
    fromNode: 'catering_budget',
    toNode: 'staff_morale',
    delay: 1,
    transferFn: notYetImplemented('CASCADE-ENGINE-007'),
    counterintuitive: false,
  },

  // ── C6: match_performance_index → fan_momentum (COUNTERINTUITIVE) ─────────
  // cascade-engine.md §C6
  // Asymmetric hysteresis: wins gain fan_momentum logarithmically (small gain);
  // losses lose fan_momentum quadratically (larger loss at same MPI distance).
  // delay:0 — fan reaction is immediate post-match.
  // Guard note: C6 itself has no hasMatchThisWeek guard — it reads the
  // match_performance_index that was written by match-sim in the same tick.
  // When there is no match, match-sim does not update MPI, so prevState.MPI
  // holds the last match result (which is fine — C6 only produces meaningful
  // deltas when MPI moves).
  {
    id: 'C6',
    fromNode: 'match_performance_index',
    toNode: 'fan_momentum',
    delay: 0,
    transferFn: notYetImplemented('CASCADE-ENGINE-008'),
    counterintuitive: true,
  },

  // ── C7: consecutive_wins → fan_momentum ──────────────────────────────────
  // cascade-engine.md §C7
  // Quadratic bonus: longer win streak → accelerating fan_momentum gain.
  // Reset to 0 on first defeat (via PlayerDecision, not this edge).
  // delay:0 — streak bonus is immediate.
  {
    id: 'C7',
    fromNode: 'consecutive_wins',
    toNode: 'fan_momentum',
    delay: 0,
    transferFn: notYetImplemented('CASCADE-ENGINE-008'),
    counterintuitive: false,
  },

  // ── C8: fan_momentum × ticket_price_index → fan_attendance (COUNTERINTUITIVE)
  // cascade-engine.md §C8
  // Primary driver: fan_momentum. ticket_price_index read via ctx.prevState.
  // Counterintuitive: with HIGH momentum, raising prices barely hurts attendance;
  // with LOW momentum, the same price triggers collapse.
  // fromNode is fan_momentum (the primary driver); ticket_price_index is secondary.
  // delay:0 — price effect on attendance is same week.
  {
    id: 'C8',
    fromNode: 'fan_momentum',
    toNode: 'fan_attendance',
    delay: 0,
    transferFn: notYetImplemented('CASCADE-ENGINE-008'),
    counterintuitive: true,
  },

  // ── C9a: scouting_budget → scouting_points ───────────────────────────────
  // cascade-engine.md §C9a
  // Accumulates scouting_points with decay (reports become stale). noise ±1.
  // delay:1 — scouting intel takes a week to process.
  {
    id: 'C9a',
    fromNode: 'scouting_budget',
    toNode: 'scouting_points',
    delay: 1,
    transferFn: notYetImplemented('CASCADE-ENGINE-009'),
    counterintuitive: false,
  },

  // ── C9b: scouting_points → squad_available_pct ───────────────────────────
  // cascade-engine.md §C9b
  // Threshold gate: only activates when scouting_points > T_scouting_active.
  // delay:0 — C9b evaluates immediately in the same tick as C9a's delta lands.
  // The 3-week total chain delay comes from C9a's delay:1 + C9b's delay:0.
  // (Adding a delay here would make the full chain 4 weeks — GDD says 3.)
  {
    id: 'C9b',
    fromNode: 'scouting_points',
    toNode: 'squad_available_pct',
    delay: 0,
    transferFn: notYetImplemented('CASCADE-ENGINE-009'),
    counterintuitive: false,
  },

  // ── C11: staff_morale → match_performance_index ───────────────────────────
  // cascade-engine.md §C11
  // Guard: only evaluates in ticks with a fixture (hasMatchThisWeek).
  // Without the guard, C11 would silently accumulate MPI in rest weeks
  // (violates P4: weeks without matches must be quiet).
  // Allow-listed as an exception to the "no writing match_performance_index
  // from cascade edges" rule (see control-manifest).
  {
    id: 'C11',
    fromNode: 'staff_morale',
    toNode: 'match_performance_index',
    delay: 0,
    guardFn: guardHasMatch,
    transferFn: notYetImplemented('CASCADE-ENGINE-010'),
    counterintuitive: false,
  },

  // ── C12: consecutive_losses × training_intensity → team_fitness (COUNTERINTUITIVE)
  // cascade-engine.md §C12
  // Desperate overtraining: the coaching staff pushes harder after losses,
  // but only if training_intensity > T_desperation_threshold.
  // Player agency: lowering training_intensity below 50 completely prevents
  // this damage. delay:1 — fatigue accumulates over the week.
  // fromNode is consecutive_losses (primary driver); training_intensity read
  // via ctx.prevState.
  {
    id: 'C12',
    fromNode: 'consecutive_losses',
    toNode: 'team_fitness',
    delay: 1,
    transferFn: notYetImplemented('CASCADE-ENGINE-010'),
    counterintuitive: true,
  },

  // ── C13: squad_available_pct → team_fitness ───────────────────────────────
  // cascade-engine.md §C13
  // Full squad = better group training exercises = higher fitness.
  // delay:1 — group training effect appears next week.
  // Formula: delta = K_squad_fit × (squad_available_pct − SQ_optimal) / 100
  // Sweet spot at SQ_optimal=75; range [-3.75, +1.25].
  // Story: CASCADE-ENGINE-007
  {
    id: 'C13',
    fromNode: 'squad_available_pct',
    toNode: 'team_fitness',
    delay: 1,
    transferFn: (prevState: Readonly<WorldState>) =>
      K_squad_fit * (prevState.squad_available_pct - SQ_optimal) / 100,
    counterintuitive: false,
  },

  // ── C14: field_quality → match_performance_index ─────────────────────────
  // cascade-engine.md §C14
  // Home advantage: own pitch in good condition = slight tactical edge.
  // Guard: only evaluates in ticks with a fixture (hasMatchThisWeek).
  // noise ±1. Allow-listed as exception to the match_performance_index write rule.
  {
    id: 'C14',
    fromNode: 'field_quality',
    toNode: 'match_performance_index',
    delay: 0,
    guardFn: guardHasMatch,
    transferFn: notYetImplemented('CASCADE-ENGINE-010'),
    counterintuitive: false,
  },

  // ── C15: ticket_price_index → fan_momentum (COUNTERINTUITIVE) ─────────────
  // cascade-engine.md §C15
  // Sustained high prices (> T_price_danger = 65) slowly erode loyalty even
  // when the team wins. delay:2 — takes two weeks for fans to react to price.
  // Counterintuitive: lowering price doesn't immediately reverse already-queued
  // DelayedEffects (they are immutable once enqueued per edge-case doc).
  {
    id: 'C15',
    fromNode: 'ticket_price_index',
    toNode: 'fan_momentum',
    delay: 2,
    transferFn: notYetImplemented('CASCADE-ENGINE-009'),
    counterintuitive: true,
  },

  // ── C16a: player_happiness → team_fitness ────────────────────────────────
  // cascade-engine.md §C16a
  // Happy squad = full effort in training. delay:0 — morale impact is immediate.
  // No hasMatchThisWeek guard — C16a applies in all weeks.
  {
    id: 'C16a',
    fromNode: 'player_happiness',
    toNode: 'team_fitness',
    delay: 0,
    transferFn: notYetImplemented('CASCADE-ENGINE-011'),
    counterintuitive: false,
  },

  // ── C16b: player_happiness → match_performance_index ─────────────────────
  // cascade-engine.md §C16b
  // Happy squad = full effort on match day. Guard: hasMatchThisWeek.
  // Larger K than C16a (K_happy_perf=7 vs K_happy_fit=4) — match-day
  // emotional impact outweighs training impact.
  {
    id: 'C16b',
    fromNode: 'player_happiness',
    toNode: 'match_performance_index',
    delay: 0,
    guardFn: guardHasMatch,
    transferFn: notYetImplemented('CASCADE-ENGINE-011'),
    counterintuitive: false,
  },

  // ── C17: sponsor_quality → player_happiness ───────────────────────────────
  // cascade-engine.md §C17
  // Premium sponsors (cars, watches, catering perks) → happier squad.
  // delay:1 — squad notices perks after the deal is announced.
  {
    id: 'C17',
    fromNode: 'sponsor_quality',
    toNode: 'player_happiness',
    delay: 1,
    transferFn: notYetImplemented('CASCADE-ENGINE-011'),
    counterintuitive: false,
  },

  // ── C18a: Weekly corruption_exposure decay ────────────────────────────────
  // cascade-engine.md §C18a
  // Natural decay of corruption exposure (−5% per week) UNLESS already BLOCKING.
  // Guard: does NOT evaluate when corruption_exposure ≥ 80 (BLOCKING zone).
  //   Rationale: when the scandal has already broken, decay must not soften
  //   the impact in the same tick. Decay resumes from the tick following the
  //   event resolution (per GDD §C18a guard note resolving OQ-CASCADE-05).
  // Counterintuitive: decay means doing nothing actually reduces risk — but
  //   once it hits 80 the decay stops, making the timing window visible.
  //   Marked counterintuitive = true per the 7-chain counterintuitive list.
  {
    id: 'C18a',
    fromNode: 'corruption_exposure',
    toNode: 'corruption_exposure',
    delay: 0,
    guardFn: guardCorruptionDecay,
    transferFn: notYetImplemented('CASCADE-ENGINE-013'),
    counterintuitive: true,
  },
] as const);

// ── Startup assertion: unique edge ids ────────────────────────────────────────

/**
 * Called at module load to assert uniqueness of edge ids.
 * Fails fast (throws) if the graph is misconfigured — never silently wrong.
 * Per AC #2 of CASCADE-ENGINE-002.
 */
function assertUniqueEdgeIds(graph: readonly CascadeEdgeDef[]): void {
  const seen = new Set<string>();
  for (const edge of graph) {
    if (seen.has(edge.id)) {
      throw new Error(
        `CASCADA_FC_GRAPH has duplicate edge id: "${edge.id}". ` +
        `Every edge must have a unique id.`
      );
    }
    seen.add(edge.id);
  }
}

assertUniqueEdgeIds(CASCADA_FC_GRAPH);

// ── Validate all NodeIds are known (startup assertion) ────────────────────────

/**
 * Assert that every fromNode and toNode in the graph is a valid NodeId.
 * Catches typos at module load rather than at runtime during a tick.
 * Per AC #3 of CASCADE-ENGINE-002.
 */
function assertValidNodeIds(graph: readonly CascadeEdgeDef[]): void {
  const validIds = new Set<string>(NODE_IDS);
  for (const edge of graph) {
    if (!validIds.has(edge.fromNode)) {
      throw new Error(
        `Edge "${edge.id}" has unknown fromNode: "${edge.fromNode}".`
      );
    }
    if (!validIds.has(edge.toNode)) {
      throw new Error(
        `Edge "${edge.id}" has unknown toNode: "${edge.toNode}".`
      );
    }
  }
}

assertValidNodeIds(CASCADA_FC_GRAPH);

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Return all edges whose `toNode === target`.
 *
 * Used by `runTick()` Step 2 to accumulate additive deltas per node.
 * Per ADR-003 Rule 4: multiple edges writing to the same node produce an
 * additive sum — not a last-write-wins override.
 *
 * Returns a new array each call (CASCADA_FC_GRAPH is frozen; caller is free
 * to sort / filter the result without affecting the source).
 */
export function getEdgesByTarget(nodeId: NodeId): CascadeEdgeDef[] {
  return CASCADA_FC_GRAPH.filter((edge) => edge.toNode === nodeId);
}

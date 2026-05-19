/**
 * Cross-formula balance constants for the football match simulator.
 *
 * Pure data module — imported by football-formulas.ts and the per-tick loop
 * (story 013). Keeping these in a separate file makes tuning passes (changing
 * one constant value) low-risk and trivially reviewable.
 *
 * Story: MATCH-SIM-004
 * Control Manifest: 2026-05-19
 */

import type { FormationPreset, TeamInstruction } from './football-types.js';

/**
 * Per-formation momentum amplifier applied ONLY to the home team's technical
 * contribution in F4. 3-5-2 has the documented technique-bonus per GDD §F4.
 * Other formations apply no modifier.
 */
export const FORMATION_MOMENTUM_MOD: Readonly<Record<FormationPreset, number>> = Object.freeze({
  '4-4-2': 1.0,
  '4-3-3': 1.0,
  '3-5-2': 1.1,
  '5-3-2': 1.0,
});

/** F4 — momentum delta weight on midfielder passing diff. */
export const F4_W_PASSING = 3.0;
/** F4 — momentum delta weight on midfielder vision diff. */
export const F4_W_VISION = 2.0;
/** F4 — noise multiplier for the single rng() call. delta_noise = rng()×2 - 1. */
export const F4_NOISE_RANGE = 2.0;

/** Momentum clamp lower bound (per GDD AC-MATCH-10). */
export const MOMENTUM_MIN = 20;
/** Momentum clamp upper bound. */
export const MOMENTUM_MAX = 80;

// ── F5: P_attack ──────────────────────────────────────────────────────────────

/** F5 base per-tick attack rate (per team, before modifiers). */
export const BASE_ATTACK_RATE = 0.15;

/** F5 — per-formation attack-rate multiplier. */
export const FORMATION_ATTACK_MOD: Readonly<Record<FormationPreset, number>> = Object.freeze({
  '4-4-2': 1.0,
  '4-3-3': 1.2,
  '3-5-2': 0.9,
  '5-3-2': 0.75,
});

/** F5 — momentum > this threshold (strict) enables the COUNTER away bonus. */
export const COUNTER_MOMENTUM_THRESHOLD = 65;
/** F5 — multiplicative bonus applied to P_attack_away when COUNTER conditions met. */
export const COUNTER_BONUS_FACTOR = 1.1;
/** F5 — speed-bonus weight on P_attack (`avgFwdSpeed/100 × this`). */
export const SPEED_BONUS_WEIGHT = 0.03;

/**
 * F5 — instruction-driven multiplier on the per-team base rate.
 * COUNTER is intentionally 1.0 here: COUNTER applies a separate conditional
 * bonus to P_attack_away (see COUNTER_BONUS_FACTOR), not a base-rate modifier.
 */
export function instructionAttackMod(
  instruction: TeamInstruction | null,
): number {
  if (instruction === 'PRESS_HIGH') return 1.05;
  if (instruction === 'HOLD_SHAPE') return 0.95;
  return 1.0;
}

// ── F6: P_shot ────────────────────────────────────────────────────────────────

/**
 * F6 — per-formation DEFENDER-team modifier on `def_ctx_adj`.
 *
 *   def_ctx_adj = def_ctx / (FORMATION_DEFENSE_MOD × HOLD_SHAPE_MOD?)
 *
 * Higher mod = LARGER divisor = SMALLER def_ctx_adj = MORE shots conceded.
 * Counterintuitive at first glance: a defender on 4-3-3 has chosen offense
 * over defensive shape, so they concede more shots. Do NOT invert this.
 */
export const FORMATION_DEFENSE_MOD: Readonly<Record<FormationPreset, number>> = Object.freeze({
  '4-4-2': 1.0,
  '4-3-3': 1.15, // less defensive integrity → more shots conceded
  '3-5-2': 1.05,
  '5-3-2': 0.85, // tighter shape → fewer shots conceded
});

/** F6 — HOLD_SHAPE modifier when the DEFENDER team has it active. */
export const HOLD_SHAPE_MOD = 0.9;

/** F6 — clamp range for the final P_shot (per AC-MATCH-12). */
export const P_SHOT_CLAMP_MIN = 0.1;
export const P_SHOT_CLAMP_MAX = 0.7;

/** F6 — fallback when att_ctx + def_ctx_adj evaluates to NaN or <= 0. */
export const P_SHOT_FALLBACK_NAN = 0.1;

/** F6 — global multiplier on `att_ctx / sum` before clamping. */
export const P_SHOT_MULTIPLIER = 0.8;

// ── F7: P_goal ────────────────────────────────────────────────────────────────

/** F7 — clamp range for the final P_goal (per AC-MATCH-13). */
export const P_GOAL_CLAMP_MIN = 0.05;
export const P_GOAL_CLAMP_MAX = 0.45;

/**
 * F7 — fallback when goal_att + gk_def is NaN or ≤ 0.
 * Set to 0.25 (the midpoint) per GDD: "ambos sin habilidad = partido de calle".
 */
export const P_GOAL_FALLBACK_NAN = 0.25;

/** F7 — global multiplier on `goal_att / sum` before clamping. */
export const P_GOAL_MULTIPLIER = 0.65;

// ── Card detection ────────────────────────────────────────────────────────────

/** Tick minutes at which card-check windows fire (per GDD step 5). */
export const CARD_CHECK_TICKS: readonly number[] = Object.freeze([15, 30, 45, 60, 75, 90]);

/** Card — baseline yellow probability per tackle check. */
export const P_YELLOW_BASE = 0.12;
/** Card — fitness-fatigue multiplier when effective_fitness < threshold. */
export const P_YELLOW_FITNESS_MULTIPLIER = 1.5;
/** Card — strict-less-than threshold for the fatigue multiplier. */
export const P_YELLOW_FITNESS_THRESHOLD = 40;
/** Card — direct red probability per tackle check (~1 every 28 matches). */
export const P_RED_DIRECT = 0.003;

// ── Injury detection ──────────────────────────────────────────────────────────

/** Injury base rate before fatigue/risk modulation. */
export const P_INJURY_BASE = 0.08;
/** Rival-team injury_risk constant (per GDD line 113: rival doesn't see club WorldState). */
export const RIVAL_INJURY_RISK_CONST = 50;
/** Fixed-tick injury check windows (per GDD Step 6: 45, 90 + goal/card ticks). */
export const INJURY_CHECK_TICKS_FIXED: readonly number[] = Object.freeze([45, 90]);
/** Default minor-vs-major severity split (50/50 — OQ-MATCH-INJ-01 pending). */
export const P_INJURY_MAJOR_THRESHOLD = 0.5;

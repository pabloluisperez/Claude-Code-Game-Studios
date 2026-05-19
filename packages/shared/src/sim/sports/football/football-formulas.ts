/**
 * Football match-simulation formulas (F1–F7 in MVP).
 *
 * All functions in this module MUST be pure: no `ctx.rng()`, no `Math.random()`,
 * no `Date.now()`, no I/O. Per ADR-002, randomness is injected at the call site
 * via the stateful PRNG (see match-prng.ts). Formulas here are deterministic.
 *
 * Per ADR-007 / cascade-engine.md: F1 clamping at 0 is part of the formula
 * (not a downstream Edge Case). Multiple downstream formulas (F2, F7, F10)
 * consume effectiveFitness — a negative value would silently mis-compute.
 *
 * Position-stat accessors default to 50 (the slice-validated convention) when
 * the underlying stat is undefined. This prevents NaN propagation in F5/F6/F7
 * for generated players missing a positional stat. The exception is the
 * emergency goalkeeper derivation (AC-MATCH-17): a DEFENDER with
 * assignedAs='GOALKEEPER' gets reflexes = skill×0.4 and handling = skill×0.3.
 *
 * Story: MATCH-SIM-003
 * Control Manifest: 2026-05-19
 * GDD: design/gdd/match-simulation.md §F1, §F2 + AC-MATCH-07/08/17
 */

import type {
  FormationPreset,
  PlayerStats,
  PreMatchSnapshot,
  TeamInstruction,
} from './football-types.js';
import type { SimContext } from '../../cascade-types.js';
import {
  BASE_ATTACK_RATE,
  CARD_CHECK_TICKS,
  COUNTER_BONUS_FACTOR,
  COUNTER_MOMENTUM_THRESHOLD,
  F4_NOISE_RANGE,
  F4_W_PASSING,
  F4_W_VISION,
  FORMATION_ATTACK_MOD,
  FORMATION_DEFENSE_MOD,
  FORMATION_MOMENTUM_MOD,
  HOLD_SHAPE_MOD,
  MOMENTUM_MAX,
  MOMENTUM_MIN,
  P_GOAL_CLAMP_MAX,
  P_GOAL_CLAMP_MIN,
  P_GOAL_FALLBACK_NAN,
  P_GOAL_MULTIPLIER,
  P_SHOT_CLAMP_MAX,
  P_SHOT_CLAMP_MIN,
  P_SHOT_FALLBACK_NAN,
  P_SHOT_MULTIPLIER,
  P_YELLOW_BASE,
  P_YELLOW_FITNESS_MULTIPLIER,
  P_YELLOW_FITNESS_THRESHOLD,
  SPEED_BONUS_WEIGHT,
  instructionAttackMod,
} from './football-constants.js';

// ── Balance constants ─────────────────────────────────────────────────────────

/**
 * Maximum fitness decay across a full match for a player with stamina=0.
 * Linear interpolation: actual decay scales by `t/90 × (1 − stamina/100)`.
 * Source: GDD §F1.
 */
export const FITNESS_DECAY_MAX = 15;

/** F2 weight on `skill` (long-term ability). */
export const F2_W_SKILL = 0.35;
/** F2 weight on `form` (recent performance). */
export const F2_W_FORM = 0.2;
/** F2 weight on `morale` (mental state). */
export const F2_W_MORALE = 0.15;
/** F2 weight on `effectiveFitness` (in-match conditioning). */
export const F2_W_FITNESS = 0.3;

/** Emergency-GK reflex derivation factor (AC-MATCH-17). */
export const EMERGENCY_GK_REFLEX_FACTOR = 0.4;
/** Emergency-GK handling derivation factor (AC-MATCH-17). */
export const EMERGENCY_GK_HANDLING_FACTOR = 0.3;

/** Default value for absent position-specific stats (slice convention). */
export const STAT_DEFAULT = 50;

// ── F1: effectiveFitness ──────────────────────────────────────────────────────

/**
 * F1 — effective fitness at minute `t` of the match.
 *
 *   effectiveFitness = max(0, fitness − (t/90) × (1 − stamina/100) × FITNESS_DECAY_MAX)
 *
 * Linear decay across the 90-minute match, modulated by stamina (higher stamina
 * means less decay). Clamped to 0 to prevent negative propagation downstream.
 *
 * @param player - any PlayerStats record (must have fitness + stamina)
 * @param t - match minute in [0, 90] (no clamp on input — caller's responsibility)
 * @returns effective fitness in [0, 100]; clamped to 0 at the negative bound
 */
export function effectiveFitness(player: Readonly<PlayerStats>, t: number): number {
  const decay = (t / 90) * (1 - player.stamina / 100) * FITNESS_DECAY_MAX;
  return Math.max(0, player.fitness - decay);
}

// ── F2: effectiveRating ───────────────────────────────────────────────────────

/**
 * F2 — composite effective rating used by F5/F6/F7/F10.
 *
 *   effectiveRating = skill×0.35 + form×0.20 + morale×0.15 + effectiveFitness(t)×0.30
 *
 * Weights sum to 1.0 — preserve this invariant in tuning.
 *
 * @param player - any PlayerStats record
 * @param t - match minute (passed through to F1)
 * @returns composite rating, typically in [13, 96.25] for valid player inputs
 */
export function effectiveRating(player: Readonly<PlayerStats>, t: number): number {
  const ef = effectiveFitness(player, t);
  return (
    player.skill * F2_W_SKILL +
    player.form * F2_W_FORM +
    player.morale * F2_W_MORALE +
    ef * F2_W_FITNESS
  );
}

// ── Position-stat accessors ───────────────────────────────────────────────────
// Defensive against `noUncheckedIndexedAccess` (returns number | undefined).
// Emergency-GK derivation lives in getReflexes/getHandling.

/** Midfielder passing stat; defaults to STAT_DEFAULT. */
export function getPassing(player: Readonly<PlayerStats>): number {
  return player.passing ?? STAT_DEFAULT;
}

/** Midfielder vision stat; defaults to STAT_DEFAULT. */
export function getVision(player: Readonly<PlayerStats>): number {
  return player.vision ?? STAT_DEFAULT;
}

/** Forward speed stat; defaults to STAT_DEFAULT. */
export function getSpeed(player: Readonly<PlayerStats>): number {
  return player.speed ?? STAT_DEFAULT;
}

/** Forward finishing stat; defaults to STAT_DEFAULT. */
export function getFinishing(player: Readonly<PlayerStats>): number {
  return player.finishing ?? STAT_DEFAULT;
}

/** Defender strength stat; defaults to STAT_DEFAULT. */
export function getStrength(player: Readonly<PlayerStats>): number {
  return player.strength ?? STAT_DEFAULT;
}

/** Defender tackling stat; defaults to STAT_DEFAULT. */
export function getTackling(player: Readonly<PlayerStats>): number {
  return player.tackling ?? STAT_DEFAULT;
}

/**
 * Goalkeeper reflexes. AC-MATCH-17 emergency GK: a DEFENDER with
 * assignedAs='GOALKEEPER' has reflexes derived from skill × EMERGENCY_GK_REFLEX_FACTOR.
 */
export function getReflexes(player: Readonly<PlayerStats>): number {
  if (isEmergencyGoalkeeper(player)) {
    return player.skill * EMERGENCY_GK_REFLEX_FACTOR;
  }
  return player.reflexes ?? STAT_DEFAULT;
}

/**
 * Goalkeeper handling. AC-MATCH-17 emergency GK: derived from skill × EMERGENCY_GK_HANDLING_FACTOR.
 */
export function getHandling(player: Readonly<PlayerStats>): number {
  if (isEmergencyGoalkeeper(player)) {
    return player.skill * EMERGENCY_GK_HANDLING_FACTOR;
  }
  return player.handling ?? STAT_DEFAULT;
}

/** Returns true when a DEFENDER is currently filling the goalkeeper slot. */
function isEmergencyGoalkeeper(player: Readonly<PlayerStats>): boolean {
  return player.position === 'DEFENDER' && player.assignedAs === 'GOALKEEPER';
}

// ── F3: homeMomentumInitial ───────────────────────────────────────────────────

/**
 * F3 — pre-match home momentum derived from the world snapshot.
 *
 *   home_momentum_initial = 50 + (field_quality - 50)/100 × 5
 *                              + (fan_attendance - 50)/100 × 5
 *
 * For inputs in [0, 100] each, output is in [45, 55] inclusive.
 *
 * @param snapshot - PreMatchSnapshot capture (field_quality + fan_attendance)
 * @returns initial momentum value, always in [45, 55] for valid inputs
 */
export function homeMomentumInitial(snapshot: Readonly<PreMatchSnapshot>): number {
  return (
    50 +
    ((snapshot.field_quality - 50) / 100) * 5 +
    ((snapshot.fan_attendance - 50) / 100) * 5
  );
}

// ── F4: momentumDelta ─────────────────────────────────────────────────────────

/**
 * Returns the mean of a (read-only) list of numbers. Returns 0 for empty input,
 * which avoids NaN propagation when all home MIDs have been sent off.
 */
function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * F4 — single-tick momentum delta driven by midfielder passing/vision balance.
 *
 *   pass_home = avg(home MID passing) × FORMATION_MOMENTUM_MOD[homeFormation]
 *   vis_home  = avg(home MID vision)  × FORMATION_MOMENTUM_MOD[homeFormation]
 *   pass_away = avg(away MID passing)
 *   vis_away  = avg(away MID vision)
 *
 *   delta = (pass_home - pass_away)/100 × F4_W_PASSING
 *         + (vis_home  - vis_away )/100 × F4_W_VISION
 *         + (rng()×2 - 1)
 *
 * CRITICAL invariant: exactly ONE `ctx.rng()` call per invocation. This anchors
 * AC-MATCH-01/02 determinism across pause/resume boundaries.
 *
 * The 3-5-2 amplifier (FORMATION_MOMENTUM_MOD['3-5-2'] = 1.1) applies ONLY to
 * the home team's contribution (per GDD §F4 — `formation_momentum_mod_home`,
 * not symmetric).
 *
 * @param ctx - SimContext (provides `rng()`)
 * @param homeMids - the home team's midfielders (may be empty after red cards)
 * @param awayMids - the away team's midfielders
 * @param homeFormation - the home team's current formation
 * @returns momentum delta (typically in [-2, +2] across normal stat ranges)
 */
export function momentumDelta(
  ctx: SimContext,
  homeMids: readonly Readonly<PlayerStats>[],
  awayMids: readonly Readonly<PlayerStats>[],
  homeFormation: FormationPreset,
): number {
  const homeMod = FORMATION_MOMENTUM_MOD[homeFormation];

  const passHome = avg(homeMids.map((p) => getPassing(p))) * homeMod;
  const visHome = avg(homeMids.map((p) => getVision(p))) * homeMod;
  const passAway = avg(awayMids.map((p) => getPassing(p)));
  const visAway = avg(awayMids.map((p) => getVision(p)));

  const technique =
    ((passHome - passAway) / 100) * F4_W_PASSING +
    ((visHome - visAway) / 100) * F4_W_VISION;

  // Exactly one rng() call per tick. Do not branch here.
  const noise = ctx.rng() * F4_NOISE_RANGE - 1;

  return technique + noise;
}

/**
 * Apply a momentum delta with the hard [MOMENTUM_MIN, MOMENTUM_MAX] clamp.
 * Per GDD AC-MATCH-10, momentum stays bounded regardless of accumulated drift.
 */
export function applyMomentumDelta(prev: number, delta: number): number {
  const next = prev + delta;
  if (next < MOMENTUM_MIN) return MOMENTUM_MIN;
  if (next > MOMENTUM_MAX) return MOMENTUM_MAX;
  return next;
}

// ── F5: P_attack + single-roll attack resolution ──────────────────────────────

/**
 * Per-team inputs to F5's attack probability calculation.
 * Decouples the formula from the larger match-input plumbing.
 */
export interface TeamPAttackContext {
  readonly formation: FormationPreset;
  readonly instruction: TeamInstruction | null;
  readonly avgFwdSpeed: number;
}

/**
 * F5 — base rate component (formation + instruction + momentum normalization).
 *
 *   base = BASE_ATTACK_RATE × FORMATION_ATTACK_MOD[formation]
 *               × instructionAttackMod(instruction)
 *               × (momentum / 100)
 *
 * Exposed separately for AC-MATCH-31's exact-ratio test (the speed bonus
 * doesn't scale with formation, so the full P_attack ratio is slightly less
 * than the formation_mod ratio — assert on this term to get the exact 1.2).
 */
export function pAttackBaseComponent(
  team: Readonly<TeamPAttackContext>,
  momentum: number,
): number {
  const formationMod = FORMATION_ATTACK_MOD[team.formation];
  const instructionMod = instructionAttackMod(team.instruction);
  return BASE_ATTACK_RATE * formationMod * instructionMod * (momentum / 100);
}

/** F5 speed-bonus component (linear in `avgFwdSpeed`). */
export function pAttackSpeedBonus(avgFwdSpeed: number): number {
  return (avgFwdSpeed / 100) * SPEED_BONUS_WEIGHT;
}

/**
 * F5 — P_attack for the HOME team.
 *
 * COUNTER never applies to the home team (per AC-MATCH-26; enforced in
 * computePAttackAway via the explicit "instruction !== 'COUNTER' for home"
 * convention plus HTTP-layer rejection in story 017).
 *
 * @param home - home team's F5 inputs
 * @param momentum - current `home_momentum[t]` value (already clamped 20-80)
 */
export function computePAttackHome(
  home: Readonly<TeamPAttackContext>,
  momentum: number,
): number {
  return pAttackBaseComponent(home, momentum) + pAttackSpeedBonus(home.avgFwdSpeed);
}

/**
 * F5 — P_attack for the AWAY team.
 *
 * If `instruction === 'COUNTER'` AND `momentum > COUNTER_MOMENTUM_THRESHOLD`,
 * the full P_attack is multiplied by `COUNTER_BONUS_FACTOR` (1.10). Below the
 * threshold (≤ 65), COUNTER has no effect on the away team's P_attack — per
 * AC-MATCH-26 case 1.
 *
 * @param away - away team's F5 inputs
 * @param momentum - current `home_momentum[t]` value (NOT away_momentum — the
 *                   counter check is gated on home dominance)
 */
export function computePAttackAway(
  away: Readonly<TeamPAttackContext>,
  momentum: number,
): number {
  const base =
    pAttackBaseComponent(away, momentum) + pAttackSpeedBonus(away.avgFwdSpeed);
  if (away.instruction === 'COUNTER' && momentum > COUNTER_MOMENTUM_THRESHOLD) {
    return base * COUNTER_BONUS_FACTOR;
  }
  return base;
}

/**
 * Resolve the per-tick attack roll with a SINGLE `ctx.rng()` call.
 *
 *   roll = ctx.rng()
 *   roll < pAttackHome                  → 'home'
 *   roll < pAttackHome + pAttackAway    → 'away'
 *   else                                → 'none'
 *
 * Per ADR-002 + AC-MATCH-01/02, exactly one rng() call per tick anchors
 * deterministic replay across pause/resume boundaries.
 *
 * Caller must ensure `pAttackHome + pAttackAway < 1.0` (GDD §F5 invariant);
 * we do not throw if violated to keep the function pure, but the result
 * would be biased toward 'away' since the home branch saturates first.
 */
export function resolveAttackRoll(
  ctx: SimContext,
  pAttackHome: number,
  pAttackAway: number,
): 'home' | 'away' | 'none' {
  const roll = ctx.rng();
  if (roll < pAttackHome) return 'home';
  if (roll < pAttackHome + pAttackAway) return 'away';
  return 'none';
}

// ── F6: P_shot ────────────────────────────────────────────────────────────────

/**
 * Inputs to F6's shot probability calculation.
 * The defender's instruction is reduced to a boolean (`HOLD_SHAPE` only) since
 * other instructions don't modify P_shot per GDD §F6.
 */
export interface PShotArgs {
  readonly attacker: Readonly<PlayerStats>;
  readonly attackingMids: readonly Readonly<PlayerStats>[];
  readonly defender: Readonly<PlayerStats>;
  readonly defenderFormation: FormationPreset;
  readonly defenderHasHoldShape: boolean;
  readonly t: number;
}

/**
 * F6 — probability that an attack reaches a shot.
 *
 *   att_ctx = (effectiveRating(attacker, t) × 0.4
 *           +  getSpeed(attacker)            × 0.3
 *           +  avg(attackingMids.vision)     × 0.3) / 100
 *
 *   def_ctx = (effectiveRating(defender, t) × 0.4
 *           +  getStrength(defender)         × 0.3
 *           +  getTackling(defender)         × 0.3) / 100
 *
 *   def_ctx_adj = def_ctx / (FORMATION_DEFENSE_MOD × HOLD_SHAPE_MOD?)
 *
 *   raw  = (att_ctx / (att_ctx + def_ctx_adj)) × P_SHOT_MULTIPLIER
 *   P_shot = clamp(raw, P_SHOT_CLAMP_MIN, P_SHOT_CLAMP_MAX)
 *
 * NaN guard: if `att_ctx + def_ctx_adj <= 0` (or NaN), fall back to
 * P_SHOT_FALLBACK_NAN. Uses `!(x > 0)` form so both NaN and 0 are caught.
 *
 * Pure — no rng(). Per-tick caller (story 013) is responsible for picking
 * which DEF is "the defender" for this attack (highest-rated DEF on the field).
 */
export function pShot(args: PShotArgs): number {
  const ef_att = effectiveRating(args.attacker, args.t);
  const speed_att = getSpeed(args.attacker);
  const visionMids = args.attackingMids.map((p) => getVision(p));
  const vis_mids = avg(visionMids);

  const ef_def = effectiveRating(args.defender, args.t);
  const str_def = getStrength(args.defender);
  const tac_def = getTackling(args.defender);

  const att_ctx = (ef_att * 0.4 + speed_att * 0.3 + vis_mids * 0.3) / 100;
  const def_ctx = (ef_def * 0.4 + str_def * 0.3 + tac_def * 0.3) / 100;

  const formationMod = FORMATION_DEFENSE_MOD[args.defenderFormation];
  const holdShapeMod = args.defenderHasHoldShape ? HOLD_SHAPE_MOD : 1.0;
  const def_ctx_adj = def_ctx / (formationMod * holdShapeMod);

  const sum = att_ctx + def_ctx_adj;
  // !(x > 0) catches both NaN (NaN > 0 → false) and sum ≤ 0
  if (!(sum > 0)) return P_SHOT_FALLBACK_NAN;

  const raw = (att_ctx / sum) * P_SHOT_MULTIPLIER;
  if (raw < P_SHOT_CLAMP_MIN) return P_SHOT_CLAMP_MIN;
  if (raw > P_SHOT_CLAMP_MAX) return P_SHOT_CLAMP_MAX;
  return raw;
}

// ── F7: P_goal ────────────────────────────────────────────────────────────────

/**
 * F7 — probability that a shot becomes a goal.
 *
 *   goal_att = (finishing × 0.6 + effectiveRating(att, t) × 0.4) / 100
 *   gk_def   = (reflexes  × 0.5 + handling × 0.3 + effectiveFitness(gk, t) × 0.2) / 100
 *
 *   raw = (goal_att / (goal_att + gk_def)) × P_GOAL_MULTIPLIER
 *   P_goal = clamp(raw, P_GOAL_CLAMP_MIN, P_GOAL_CLAMP_MAX)
 *
 * Emergency DEF-portero (AC-MATCH-17): `getReflexes` and `getHandling` from
 * the position-stat accessors automatically derive `skill × 0.4` and `skill × 0.3`
 * when the keeper is a DEFENDER playing as GK. F7 needs no special-case branch.
 *
 * NaN guard: if `goal_att + gk_def ≤ 0` (or NaN), return P_GOAL_FALLBACK_NAN = 0.25
 * (midpoint — "ambos sin habilidad = partido de calle"). The `!(x > 0)` form
 * catches both NaN and ≤ 0.
 *
 * Pure — no rng(). Caller (story 013) fires this when F6 says "shot".
 */
export function pGoal(
  attacker: Readonly<PlayerStats>,
  keeper: Readonly<PlayerStats>,
  t: number,
): number {
  const goal_att = (getFinishing(attacker) * 0.6 + effectiveRating(attacker, t) * 0.4) / 100;
  const gk_def =
    (getReflexes(keeper) * 0.5 +
      getHandling(keeper) * 0.3 +
      effectiveFitness(keeper, t) * 0.2) /
    100;

  const sum = goal_att + gk_def;
  if (!(sum > 0)) return P_GOAL_FALLBACK_NAN;

  const raw = (goal_att / sum) * P_GOAL_MULTIPLIER;
  if (raw < P_GOAL_CLAMP_MIN) return P_GOAL_CLAMP_MIN;
  if (raw > P_GOAL_CLAMP_MAX) return P_GOAL_CLAMP_MAX;
  return raw;
}

// ── Card detection helpers ────────────────────────────────────────────────────

/**
 * P_yellow — per-tackle-check yellow probability for the defender.
 *
 *   P_yellow = (1 − tackling/100) × P_YELLOW_BASE
 *               × (effectiveFitness(t) < P_YELLOW_FITNESS_THRESHOLD
 *                  ? P_YELLOW_FITNESS_MULTIPLIER
 *                  : 1)
 *
 * Pure — no rng(). The rng() roll happens in `resolveCardCheck` (football-cards.ts).
 */
export function pYellow(defender: Readonly<PlayerStats>, t: number): number {
  const tacklingRatio = 1 - getTackling(defender) / 100;
  const ef = effectiveFitness(defender, t);
  const fatigueMod = ef < P_YELLOW_FITNESS_THRESHOLD ? P_YELLOW_FITNESS_MULTIPLIER : 1;
  return tacklingRatio * P_YELLOW_BASE * fatigueMod;
}

/**
 * Returns true when this tick is a card-check window AND the away team's
 * attack roll succeeded on this tick (per GDD step 5: "ticks múltiplo de 15
 * cuando P_attack_away fue positivo en ese tick").
 */
export function shouldRunCardCheck(
  tick: number,
  attackHappenedThisTick: boolean,
): boolean {
  return attackHappenedThisTick && CARD_CHECK_TICKS.includes(tick);
}

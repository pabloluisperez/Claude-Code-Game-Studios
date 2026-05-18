// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does the deterministic 90-tick football sim produce credible MPI/score outputs from real player stats?
// Date: 2026-05-18

import seedrandom from "seedrandom";
import type {
  Lineup,
  MatchEvent,
  MatchInput,
  MatchOutcome,
  PlayerStats,
  WorldState,
} from "./types.js";

/**
 * simulateMatch — pure function (ADR-007 contract, slice subset).
 *
 * Skips for Day 3 slice (added later):
 *   - Manager pauses + substitutions (Day 6 — interactive match, re-enqueue per ADR-013)
 *   - VAR overturns
 *   - Red cards
 *   - Formation variants (4-4-2 only; mods = 1.0)
 *   - Manager instructions (no PRESS_HIGH/HOLD_SHAPE/COUNTER)
 *   - Rival AI tactical changes
 *
 * Implements:
 *   - F1 effective_fitness, F2 effective_rating
 *   - F3 momentum_initial, F4 momentum_delta
 *   - F5 P_attack, F6 P_shot, F7 P_goal
 *   - F8 MPI delta, F9 injury_risk delta
 *   - F10 per-player match_rating (output for player-management)
 *   - Card detection at multiples of 15 (yellow only)
 *   - Injury detection on goal/card ticks + ticks 45 and 90
 */

// ── Constants ────────────────────────────────────────────────────────────────

const FITNESS_DECAY_MAX = 15;
const BASE_ATTACK_RATE = 0.15;
const INJURY_RISK_PER_INJURY = 5;
const INJURY_INTENSITY_BONUS = 3;
const RIVAL_INJURY_RISK_CONST = 50;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function byPosition(lineup: Lineup, pos: PlayerStats["position"]): PlayerStats[] {
  return lineup.filter((p) => p.position === pos);
}

// ── F1: Fitness efectiva durante el partido ──────────────────────────────────

export function effectiveFitness(player: PlayerStats, t: number): number {
  const decay = (t / 90) * (1 - player.stamina / 100) * FITNESS_DECAY_MAX;
  return Math.max(0, player.fitness - decay);
}

// ── F2: Rating efectivo del jugador ──────────────────────────────────────────

export function effectiveRating(player: PlayerStats, t: number): number {
  return (
    player.skill * 0.35 +
    player.form * 0.2 +
    player.morale * 0.15 +
    effectiveFitness(player, t) * 0.3
  );
}

// ── F3: Momentum inicial del partido ─────────────────────────────────────────

function initialMomentum(worldState: Readonly<WorldState>): number {
  return (
    50 +
    ((worldState.field_quality - 50) / 100) * 5 +
    ((worldState.fan_attendance - 50) / 100) * 5
  );
}

// ── F4: Delta de momentum por tick ───────────────────────────────────────────

function momentumDelta(
  homeMids: PlayerStats[],
  awayMids: PlayerStats[],
  rng: () => number,
): number {
  const passHome = avg(homeMids.map((m) => m.passing ?? 50));
  const passAway = avg(awayMids.map((m) => m.passing ?? 50));
  const visHome = avg(homeMids.map((m) => m.vision ?? 50));
  const visAway = avg(awayMids.map((m) => m.vision ?? 50));
  return (
    ((passHome - passAway) / 100) * 3.0 +
    ((visHome - visAway) / 100) * 2.0 +
    (rng() * 2 - 1)
  );
}

// ── F5: P_attack ─────────────────────────────────────────────────────────────

function pAttack(
  fwds: PlayerStats[],
  momentumNormalized: number,
): number {
  const avgSpeed = avg(fwds.map((f) => f.speed ?? 50));
  return BASE_ATTACK_RATE * momentumNormalized + (avgSpeed / 100) * 0.03;
}

// ── F6: P_shot ───────────────────────────────────────────────────────────────

function pShot(
  attacker: PlayerStats,
  attackingMids: PlayerStats[],
  defender: PlayerStats,
  t: number,
): number {
  const fwdRating = effectiveRating(attacker, t);
  const attCtx =
    (fwdRating * 0.4 + (attacker.speed ?? 50) * 0.3 + avg(attackingMids.map((m) => m.vision ?? 50)) * 0.3) /
    100;
  const defRating = effectiveRating(defender, t);
  const defCtx =
    (defRating * 0.4 + (defender.strength ?? 50) * 0.3 + (defender.tackling ?? 50) * 0.3) / 100;
  const sum = attCtx + defCtx;
  if (sum <= 0) return 0.1;
  return clamp((attCtx / sum) * 0.8, 0.1, 0.7);
}

// ── F7: P_goal ───────────────────────────────────────────────────────────────

function pGoal(attacker: PlayerStats, keeper: PlayerStats, t: number): number {
  const goalAtt =
    ((attacker.finishing ?? 50) * 0.6 + effectiveRating(attacker, t) * 0.4) / 100;
  const gkDef =
    ((keeper.reflexes ?? 50) * 0.5 +
      (keeper.handling ?? 50) * 0.3 +
      effectiveFitness(keeper, t) * 0.2) /
    100;
  const sum = goalAtt + gkDef;
  if (sum <= 0) return 0.25;
  return clamp((goalAtt / sum) * 0.65, 0.05, 0.45);
}

// ── F8: MPI delta ────────────────────────────────────────────────────────────

function mpiDelta(args: {
  homeScore: number;
  awayScore: number;
  playerClubSide: "home" | "away";
}): number {
  const { homeScore, awayScore, playerClubSide } = args;
  const isHome = playerClubSide === "home";
  const playerScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  const goalDiff = Math.abs(homeScore - awayScore);

  let delta: number;
  if (playerScore > oppScore) {
    // Win
    delta = 10 + goalDiff * 5;
  } else if (playerScore < oppScore) {
    // Loss
    delta = -10 - goalDiff * 5;
  } else {
    // Draw
    delta = isHome ? -3 : +1;
  }
  return clamp(delta, -30, 30);
}

// ── F9: injury_risk delta ────────────────────────────────────────────────────

function injuryRiskDelta(events: readonly MatchEvent[]): number {
  const injuryCount = events.filter((e) => e.type === "injury").length;
  const yellowCount = events.filter((e) => e.type === "yellow_card").length;
  const highIntensity = yellowCount > 3 ? 1 : 0;
  const delta =
    injuryCount * INJURY_RISK_PER_INJURY + highIntensity * INJURY_INTENSITY_BONUS;
  return clamp(delta, 0, 15);
}

// ── F10: per-player match rating ─────────────────────────────────────────────

function buildPlayerRatings(
  lineup: Lineup,
  minutesPlayed: Map<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of lineup) {
    const mins = minutesPlayed.get(p.id) ?? 90;
    if (mins < 30) continue;
    out[p.id] = effectiveRating(p, 90);
  }
  return out;
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Pure deterministic simulation of one match.
 * Given the same MatchInput, returns the same MatchOutcome.
 */
export function simulateMatch(input: MatchInput): MatchOutcome {
  const rngFactory = seedrandom(input.seed);
  const rng = (): number => rngFactory.double();

  const homeFwds = byPosition(input.homeLineup, "FWD");
  const homeMids = byPosition(input.homeLineup, "MID");
  const homeDefs = byPosition(input.homeLineup, "DEF");
  const homeGk = byPosition(input.homeLineup, "GK")[0]!;
  const awayFwds = byPosition(input.awayLineup, "FWD");
  const awayMids = byPosition(input.awayLineup, "MID");
  const awayDefs = byPosition(input.awayLineup, "DEF");
  const awayGk = byPosition(input.awayLineup, "GK")[0]!;

  let momentum = clamp(initialMomentum(input.worldState), 20, 80);
  let homeScore = 0;
  let awayScore = 0;
  const events: MatchEvent[] = [];
  const yellowsByPlayer = new Map<string, number>();
  const minutesPlayed = new Map<string, number>();
  for (const p of input.homeLineup) minutesPlayed.set(p.id, 90);
  for (const p of input.awayLineup) minutesPlayed.set(p.id, 90);

  events.push({ type: "match_start", minute: 0 });

  for (let t = 1; t <= 90; t++) {
    // ── F4: momentum tick ──────────────────────────────────────────────────
    momentum = clamp(momentum + momentumDelta(homeMids, awayMids, rng), 20, 80);

    // ── F5: attack roll ────────────────────────────────────────────────────
    const pHome = pAttack(homeFwds, momentum / 100);
    const pAway = pAttack(awayFwds, 1 - momentum / 100);
    const attackRoll = rng();

    let attackingSide: "home" | "away" | null = null;
    if (attackRoll < pHome) attackingSide = "home";
    else if (attackRoll < pHome + pAway) attackingSide = "away";

    if (attackingSide) {
      const attFwds = attackingSide === "home" ? homeFwds : awayFwds;
      const attMids = attackingSide === "home" ? homeMids : awayMids;
      const defDefs = attackingSide === "home" ? awayDefs : homeDefs;
      const defGk = attackingSide === "home" ? awayGk : homeGk;

      // Pick attacker (highest-rated FWD) and main defender (highest-rated DEF)
      const attacker = pickBest(attFwds, t);
      const defender = pickBest(defDefs, t);

      // ── F6: shot? ────────────────────────────────────────────────────────
      const shotProb = pShot(attacker, attMids, defender, t);
      if (rng() < shotProb) {
        // ── F7: goal? ───────────────────────────────────────────────────────
        const goalProb = pGoal(attacker, defGk, t);
        if (rng() < goalProb) {
          events.push({
            type: "goal",
            minute: t,
            team: attackingSide,
            playerId: attacker.id,
          });
          if (attackingSide === "home") homeScore++;
          else awayScore++;
          // Injury check on goal ticks
          maybeInjury(t, attackingSide, attFwds, defDefs, input, events, rng);
        }
      }
    }

    // ── CARDS: tarjetas en ticks 15/30/45/60/75/90 cuando hubo ataque rival ─
    if (t % 15 === 0 && attackingSide !== null) {
      const cardSide = attackingSide === "home" ? "away" : "home";
      const cardDefs = cardSide === "home" ? homeDefs : awayDefs;
      const def = pickBest(cardDefs, t);
      const fitness = effectiveFitness(def, t);
      const pYellow =
        (1 - (def.tackling ?? 50) / 100) * 0.12 * (fitness < 40 ? 1.5 : 1.0);
      if (rng() < pYellow) {
        const prev = yellowsByPlayer.get(def.id) ?? 0;
        yellowsByPlayer.set(def.id, prev + 1);
        events.push({
          type: "yellow_card",
          minute: t,
          team: cardSide,
          playerId: def.id,
        });
        maybeInjury(t, cardSide, [], cardDefs, input, events, rng);
      }
    }

    // ── INJURIES: en ticks 45 y 90 ────────────────────────────────────────
    if (t === 45 || t === 90) {
      maybeInjury(t, "home", homeFwds.concat(homeMids, homeDefs), [], input, events, rng);
      maybeInjury(t, "away", awayFwds.concat(awayMids, awayDefs), [], input, events, rng);
    }

    if (t === 45) events.push({ type: "half_time", minute: 45 });
  }

  events.push({ type: "full_time", minute: 90 });

  const winner = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  const mpi = mpiDelta({ homeScore, awayScore, playerClubSide: input.playerClubSide });
  const injuryDelta = injuryRiskDelta(events);

  const playerLineup =
    input.playerClubSide === "home" ? input.homeLineup : input.awayLineup;
  const playerRatings = buildPlayerRatings(playerLineup, minutesPlayed);

  return {
    homeScore,
    awayScore,
    winner,
    events,
    worldStateDeltas: {
      match_performance_index: mpi,
      injury_risk: injuryDelta,
    },
    playerRatings,
  };
}

function pickBest(players: PlayerStats[], t: number): PlayerStats {
  // Deterministic: take highest effective rating. Ties broken by id order.
  let best = players[0]!;
  let bestRating = effectiveRating(best, t);
  for (let i = 1; i < players.length; i++) {
    const p = players[i]!;
    const r = effectiveRating(p, t);
    if (r > bestRating || (r === bestRating && p.id < best.id)) {
      best = p;
      bestRating = r;
    }
  }
  return best;
}

function maybeInjury(
  t: number,
  side: "home" | "away",
  candidates: PlayerStats[],
  _otherDefs: PlayerStats[],
  input: MatchInput,
  events: MatchEvent[],
  rng: () => number,
): void {
  if (candidates.length === 0) return;
  // Player club uses WorldState.injury_risk; rival uses constant 50 per F9 / match-sim spec
  const playerSide = input.playerClubSide;
  const isPlayerSide = side === playerSide;
  const injuryRiskCtx = isPlayerSide
    ? input.worldState.injury_risk
    : RIVAL_INJURY_RISK_CONST;
  // Pick the candidate with lowest effective_fitness — most likely to break
  let worst = candidates[0]!;
  let worstFit = effectiveFitness(worst, t);
  for (let i = 1; i < candidates.length; i++) {
    const f = effectiveFitness(candidates[i]!, t);
    if (f < worstFit || (f === worstFit && candidates[i]!.id < worst.id)) {
      worst = candidates[i]!;
      worstFit = f;
    }
  }
  const p = (injuryRiskCtx / 100) * 0.08 * (1 - worstFit / 100);
  if (rng() < p) {
    events.push({
      type: "injury",
      minute: t,
      team: side,
      playerId: worst.id,
      causalNode: "injury_risk",
      severity: rng() < 0.3 ? "major" : "minor",
    });
  }
}

// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does the 90-tick sim split cleanly at tick 45 with rng state preserved?
// Date: 2026-05-18 (Day 6 refactor — extracted runMatchTick + snapshot interface for re-enqueue)

import seedrandom from "seedrandom";
import type {
  Lineup,
  MatchEvent,
  MatchInput,
  MatchOutcome,
  PlayerStats,
} from "./types.js";

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

// ── Formulas (F1, F2, F4-F9) ────────────────────────────────────────────────

export function effectiveFitness(player: PlayerStats, t: number): number {
  const decay = (t / 90) * (1 - player.stamina / 100) * FITNESS_DECAY_MAX;
  return Math.max(0, player.fitness - decay);
}

export function effectiveRating(player: PlayerStats, t: number): number {
  return (
    player.skill * 0.35 +
    player.form * 0.2 +
    player.morale * 0.15 +
    effectiveFitness(player, t) * 0.3
  );
}

function initialMomentum(worldState: { field_quality: number; fan_attendance: number }): number {
  return (
    50 +
    ((worldState.field_quality - 50) / 100) * 5 +
    ((worldState.fan_attendance - 50) / 100) * 5
  );
}

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

function pAttack(fwds: PlayerStats[], momentumNormalized: number): number {
  const avgSpeed = avg(fwds.map((f) => f.speed ?? 50));
  return BASE_ATTACK_RATE * momentumNormalized + (avgSpeed / 100) * 0.03;
}

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
  if (playerScore > oppScore) delta = 10 + goalDiff * 5;
  else if (playerScore < oppScore) delta = -10 - goalDiff * 5;
  else delta = isHome ? -3 : +1;
  return clamp(delta, -30, 30);
}

function injuryRiskDelta(events: readonly MatchEvent[]): number {
  const injuryCount = events.filter((e) => e.type === "injury").length;
  const yellowCount = events.filter((e) => e.type === "yellow_card").length;
  const highIntensity = yellowCount > 3 ? 1 : 0;
  const delta =
    injuryCount * INJURY_RISK_PER_INJURY + highIntensity * INJURY_INTENSITY_BONUS;
  return clamp(delta, 0, 15);
}

function pickBest(players: PlayerStats[], t: number): PlayerStats {
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

// ── Match State + per-tick step ──────────────────────────────────────────────

/**
 * Internal match state — captured in MatchSessionSnapshot for re-enqueue.
 * All fields must be JSON-serializable (no Map; arrays/records only).
 */
export interface MatchState {
  homeLineup: PlayerStats[];
  awayLineup: PlayerStats[];
  homeScore: number;
  awayScore: number;
  momentum: number;
  events: MatchEvent[];
  yellowsByPlayer: Record<string, number>;
  /** Player ID → minutes played so far. */
  minutesPlayed: Record<string, number>;
}

/**
 * One match tick. Mutates state in place (helper context, isolated to slice
 * — production would use immutable updates per ADR-002 SimContext discipline).
 */
function runMatchTick(args: {
  state: MatchState;
  t: number;
  rng: () => number;
  worldState: Readonly<{ field_quality: number; fan_attendance: number; injury_risk: number }>;
  playerClubSide: "home" | "away";
}): void {
  const { state, t, rng, worldState, playerClubSide } = args;
  const homeFwds = byPosition(state.homeLineup, "FWD");
  const homeMids = byPosition(state.homeLineup, "MID");
  const homeDefs = byPosition(state.homeLineup, "DEF");
  const homeGk = byPosition(state.homeLineup, "GK")[0]!;
  const awayFwds = byPosition(state.awayLineup, "FWD");
  const awayMids = byPosition(state.awayLineup, "MID");
  const awayDefs = byPosition(state.awayLineup, "DEF");
  const awayGk = byPosition(state.awayLineup, "GK")[0]!;

  // F4: momentum
  state.momentum = clamp(state.momentum + momentumDelta(homeMids, awayMids, rng), 20, 80);

  // F5: attack roll
  const pHome = pAttack(homeFwds, state.momentum / 100);
  const pAway = pAttack(awayFwds, 1 - state.momentum / 100);
  const attackRoll = rng();
  let attackingSide: "home" | "away" | null = null;
  if (attackRoll < pHome) attackingSide = "home";
  else if (attackRoll < pHome + pAway) attackingSide = "away";

  if (attackingSide) {
    const attFwds = attackingSide === "home" ? homeFwds : awayFwds;
    const attMids = attackingSide === "home" ? homeMids : awayMids;
    const defDefs = attackingSide === "home" ? awayDefs : homeDefs;
    const defGk = attackingSide === "home" ? awayGk : homeGk;

    const attacker = pickBest(attFwds, t);
    const defender = pickBest(defDefs, t);

    if (rng() < pShot(attacker, attMids, defender, t)) {
      if (rng() < pGoal(attacker, defGk, t)) {
        state.events.push({
          type: "goal",
          minute: t,
          team: attackingSide,
          playerId: attacker.id,
        });
        if (attackingSide === "home") state.homeScore++;
        else state.awayScore++;
        // Injury check on goal ticks
        maybeInjury(t, attackingSide, attFwds, worldState, playerClubSide, state.events, rng);
      }
    }
  }

  // Cards check (every 15 ticks if there was an attack)
  if (t % 15 === 0 && attackingSide !== null) {
    const cardSide: "home" | "away" = attackingSide === "home" ? "away" : "home";
    const cardDefs = cardSide === "home" ? homeDefs : awayDefs;
    const def = pickBest(cardDefs, t);
    const fitness = effectiveFitness(def, t);
    const pYellow =
      (1 - (def.tackling ?? 50) / 100) * 0.12 * (fitness < 40 ? 1.5 : 1.0);
    if (rng() < pYellow) {
      const prev = state.yellowsByPlayer[def.id] ?? 0;
      state.yellowsByPlayer[def.id] = prev + 1;
      state.events.push({
        type: "yellow_card",
        minute: t,
        team: cardSide,
        playerId: def.id,
      });
      maybeInjury(t, cardSide, cardDefs, worldState, playerClubSide, state.events, rng);
    }
  }

  // Injury checks at ticks 45 and 90
  if (t === 45 || t === 90) {
    maybeInjury(t, "home", homeFwds.concat(homeMids, homeDefs), worldState, playerClubSide, state.events, rng);
    maybeInjury(t, "away", awayFwds.concat(awayMids, awayDefs), worldState, playerClubSide, state.events, rng);
  }

  if (t === 45) state.events.push({ type: "half_time", minute: 45 });
}

function maybeInjury(
  t: number,
  side: "home" | "away",
  candidates: PlayerStats[],
  worldState: Readonly<{ injury_risk: number }>,
  playerClubSide: "home" | "away",
  events: MatchEvent[],
  rng: () => number,
): void {
  if (candidates.length === 0) return;
  const isPlayerSide = side === playerClubSide;
  const injuryRiskCtx = isPlayerSide ? worldState.injury_risk : RIVAL_INJURY_RISK_CONST;
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

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * One-shot simulation. Pure: same MatchInput → same MatchOutcome.
 */
export function simulateMatch(input: MatchInput): MatchOutcome {
  const rngFactory = seedrandom(input.seed, { state: true });
  const rng = (): number => rngFactory.double();
  const state = buildInitialState(input);

  state.events.push({ type: "match_start", minute: 0 });
  for (let t = 1; t <= 90; t++) {
    runMatchTick({
      state,
      t,
      rng,
      worldState: input.worldState,
      playerClubSide: input.playerClubSide,
    });
  }
  state.events.push({ type: "full_time", minute: 90 });

  return finalizeOutcome(state, input);
}

function buildInitialState(input: MatchInput): MatchState {
  const minutes: Record<string, number> = {};
  for (const p of input.homeLineup) minutes[p.id] = 90;
  for (const p of input.awayLineup) minutes[p.id] = 90;
  return {
    homeLineup: [...input.homeLineup],
    awayLineup: [...input.awayLineup],
    homeScore: 0,
    awayScore: 0,
    momentum: clamp(initialMomentum(input.worldState), 20, 80),
    events: [],
    yellowsByPlayer: {},
    minutesPlayed: minutes,
  };
}

function finalizeOutcome(state: MatchState, input: MatchInput): MatchOutcome {
  const winner =
    state.homeScore > state.awayScore
      ? "home"
      : state.awayScore > state.homeScore
        ? "away"
        : "draw";
  const mpi = mpiDelta({
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    playerClubSide: input.playerClubSide,
  });
  const injury = injuryRiskDelta(state.events);

  // Per-player ratings (F10): only the player's team, ≥30 minutes
  const playerLineup =
    input.playerClubSide === "home" ? state.homeLineup : state.awayLineup;
  const playerRatings: Record<string, number> = {};
  for (const p of playerLineup) {
    const mins = state.minutesPlayed[p.id] ?? 90;
    if (mins < 30) continue;
    playerRatings[p.id] = effectiveRating(p, 90);
  }

  return {
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    winner,
    events: state.events,
    worldStateDeltas: {
      match_performance_index: mpi,
      injury_risk: injury,
    },
    playerRatings,
  };
}

// ── Interactive flow (Day 6 — re-enqueue pattern) ───────────────────────────

/**
 * MatchSessionSnapshot per ADR-013 (slice subset).
 * JSON-serializable for round-tripping through the BullMQ queue / DB.
 */
export interface MatchSessionSnapshot {
  currentTick: number;
  state: MatchState;
  /** seedrandom serialized state — Option B per ADR-013. */
  rngState: string;
  /** When the snapshot was last paused for a decision. */
  pausedAt: number | null;
}

const PAUSE_TICK = 45; // Slice only pauses at half-time

/**
 * Run from tick 1 until the first pause point (tick 45).
 * Returns a snapshot ready for re-enqueue.
 */
export function startInteractiveMatch(input: MatchInput): MatchSessionSnapshot {
  const rngFactory = seedrandom(input.seed, { state: true });
  const rng = (): number => rngFactory.double();
  const state = buildInitialState(input);
  state.events.push({ type: "match_start", minute: 0 });

  for (let t = 1; t <= PAUSE_TICK; t++) {
    runMatchTick({
      state,
      t,
      rng,
      worldState: input.worldState,
      playerClubSide: input.playerClubSide,
    });
  }
  // Inject the substitution_window signal event
  state.events.push({
    type: "half_time",
    minute: PAUSE_TICK,
  });

  return {
    currentTick: PAUSE_TICK,
    state,
    rngState: JSON.stringify((rngFactory as unknown as { state: () => unknown }).state()),
    pausedAt: PAUSE_TICK,
  };
}

export interface SubstitutionDecision {
  side: "home" | "away";
  playerOutId: string;
  playerInStats: PlayerStats; // synthetic bench player
}

/**
 * Resume from snapshot, applying any substitution decision, until tick 90.
 * Returns the final outcome.
 */
export function resumeInteractiveMatch(args: {
  snapshot: MatchSessionSnapshot;
  decision: SubstitutionDecision | null;
  input: MatchInput;
}): MatchOutcome {
  const { snapshot, decision, input } = args;
  const state: MatchState = {
    homeLineup: [...snapshot.state.homeLineup],
    awayLineup: [...snapshot.state.awayLineup],
    homeScore: snapshot.state.homeScore,
    awayScore: snapshot.state.awayScore,
    momentum: snapshot.state.momentum,
    events: [...snapshot.state.events],
    yellowsByPlayer: { ...snapshot.state.yellowsByPlayer },
    minutesPlayed: { ...snapshot.state.minutesPlayed },
  };

  // Apply substitution decision
  if (decision) {
    const lineup = decision.side === "home" ? state.homeLineup : state.awayLineup;
    const idx = lineup.findIndex((p) => p.id === decision.playerOutId);
    if (idx >= 0) {
      lineup[idx] = decision.playerInStats;
      state.events.push({
        type: "yellow_card", // placeholder — slice doesn't have a 'substitution' event type yet
        minute: snapshot.currentTick,
        team: decision.side,
        playerId: decision.playerInStats.id,
      });
      // The out-player loses minutes past the sub; in player_in stats are fresh
      state.minutesPlayed[decision.playerOutId] = snapshot.currentTick;
      state.minutesPlayed[decision.playerInStats.id] = 90 - snapshot.currentTick;
    }
  }

  // Restore RNG state (ADR-013 Option B)
  const rngFactory = seedrandom("", { state: JSON.parse(snapshot.rngState) });
  const rng = (): number => rngFactory.double();

  for (let t = snapshot.currentTick + 1; t <= 90; t++) {
    runMatchTick({
      state,
      t,
      rng,
      worldState: input.worldState,
      playerClubSide: input.playerClubSide,
    });
  }
  state.events.push({ type: "full_time", minute: 90 });

  return finalizeOutcome(state, input);
}

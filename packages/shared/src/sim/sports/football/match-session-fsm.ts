/**
 * MatchSession FSM — pure stateful interactive layer on top of the per-tick
 * match simulation.
 *
 * State machine:
 *   pre_match → in_progress → paused_for_decision → in_progress → ... → completed
 *
 *                                  ↘ failed (terminal)
 *
 * Per ADR-013 Option B: the snapshot's `prngState` captures the seedrandom
 * Arc4 cursor AFTER every tick, so a future resume can rehydrate exactly.
 * AC-MATCH-02 verifies split-resume produces identical events to one-shot.
 *
 * This module is PURE — no DB, no Socket.IO, no BullMQ. Those wrap this in
 * stories 015 / 016 / 017 / 018.
 *
 * Story: MATCH-SIM-014
 * Control Manifest: 2026-05-19
 */

import type {
  FormationPreset,
  Lineup,
  MatchEvent,
  MatchInput,
  MatchOutcome,
  MatchSessionSnapshot,
  MatchSessionState,
  PlayerSlot,
  PlayerStats,
  Position,
  TeamInstruction,
} from './football-types.js';
import {
  createMatchSimContext,
  createMatchSimContextFromSnapshot,
  serializeRngState,
  type StatefulPRNG,
} from './match-prng.js';
import {
  applyMomentumDelta,
  computeInjuryRiskDelta,
  computeMpiDelta,
  computePAttackAway,
  computePAttackHome,
  computePlayerRatings,
  effectiveFitness,
  effectiveRating,
  getSpeed,
  homeMomentumInitial,
  momentumDelta,
  pGoal,
  pShot,
  resolveAttackRoll,
  shouldRunCardCheck,
} from './football-formulas.js';
import { resolveCardCheck } from './football-cards.js';
import {
  resolveInjuryCheck,
  shouldRunInjuryCheck,
} from './football-injuries.js';
import { resolveVarReview } from './football-var.js';
import {
  rivalInjurySub,
  rivalSubstitutionPlan,
} from './football-rival-ai.js';
import { buildForfeitOutcome, shouldForfeit } from './match-simulation.js';

// ── Decision types ────────────────────────────────────────────────────────────

export type MatchDecision =
  | { readonly kind: 'no_op' }
  | {
      readonly kind: 'substitution';
      readonly from_player_id: string;
      readonly to_player_id: string;
      readonly team: 'home' | 'away';
    }
  | { readonly kind: 'formation_change'; readonly formation: FormationPreset }
  | {
      readonly kind: 'instruction_change';
      readonly instruction: TeamInstruction | null;
    }
  | { readonly kind: 'emergency_gk_assign'; readonly defender_id: string };

export type PauseType = 'injury_pause' | 'substitution_window' | null;

export interface AdvanceTickResult {
  readonly nextSnapshot: MatchSessionSnapshot;
  readonly newlyEmittedEvents: readonly MatchEvent[];
  readonly pauseType: PauseType;
  readonly matchOutcome: MatchOutcome | null;
}

// ── Tunables ─────────────────────────────────────────────────────────────────

const TOTAL_TICKS = 90;
const SUB_WINDOW_TICKS = new Set([45, 60, 75]);
const MAX_SUBSTITUTIONS = 5;

// ── Lineup helpers ────────────────────────────────────────────────────────────

function splitStartersAndBench(lineup: Lineup): {
  starters: PlayerSlot[];
  bench: PlayerSlot[];
} {
  return { starters: lineup.slice(0, 11), bench: lineup.slice(11) };
}

function getStartersByPosition(
  starters: readonly PlayerSlot[],
  pos: Position,
): PlayerSlot[] {
  return starters.filter(
    (s) => s.player.position === pos || s.player.assignedAs === pos,
  );
}

function pickHighestRated(
  slots: readonly PlayerSlot[],
  t: number,
): PlayerSlot | null {
  if (slots.length === 0) return null;
  let best = slots[0]!;
  let bestRating = effectiveRating(best.player, t);
  for (let i = 1; i < slots.length; i++) {
    const s = slots[i]!;
    const r = effectiveRating(s.player, t);
    if (r > bestRating || (r === bestRating && s.player.id < best.player.id)) {
      best = s;
      bestRating = r;
    }
  }
  return best;
}

function pickLowestFitness(
  slots: readonly PlayerSlot[],
  t: number,
): PlayerSlot | null {
  if (slots.length === 0) return null;
  let worst = slots[0]!;
  let worstFit = effectiveFitness(worst.player, t);
  for (let i = 1; i < slots.length; i++) {
    const s = slots[i]!;
    const f = effectiveFitness(s.player, t);
    if (f < worstFit || (f === worstFit && s.player.id < worst.player.id)) {
      worst = s;
      worstFit = f;
    }
  }
  return worst;
}

function avgFwdSpeed(starters: readonly PlayerSlot[]): number {
  const fwds = starters.filter((s) => s.player.position === 'FORWARD');
  if (fwds.length === 0) return 0;
  let sum = 0;
  for (const s of fwds) sum += getSpeed(s.player);
  return sum / fwds.length;
}

function replaceInLineup(
  lineup: Lineup,
  fromId: string,
  replacement: PlayerSlot,
): Lineup {
  const out: PlayerSlot[] = [];
  let replaced = false;
  let benchRemoved = false;
  for (const slot of lineup) {
    if (!replaced && slot.player.id === fromId) {
      out.push({ player: replacement.player, slotIndex: slot.slotIndex });
      replaced = true;
    } else if (!benchRemoved && slot.player.id === replacement.player.id) {
      benchRemoved = true;
    } else {
      out.push(slot);
    }
  }
  return out;
}

function removePlayerFromLineup(lineup: Lineup, playerId: string): Lineup {
  return lineup.filter((s) => s.player.id !== playerId);
}

// ── Decision validation ──────────────────────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateDecision(
  snapshot: Readonly<MatchSessionSnapshot>,
  decision: MatchDecision,
  playerClubSide: 'home' | 'away',
): ValidationResult {
  if (decision.kind === 'no_op') return { ok: true };

  if (decision.kind === 'substitution') {
    if (decision.team !== playerClubSide) {
      return { ok: false, reason: 'cannot_substitute_for_rival' };
    }
    if (snapshot.substitutionsUsed >= MAX_SUBSTITUTIONS) {
      return { ok: false, reason: 'sub_pool_exhausted' };
    }
    const lineup =
      playerClubSide === 'home'
        ? snapshot.currentLineupHome
        : snapshot.currentLineupAway;
    const { starters, bench } = splitStartersAndBench(lineup);
    const fromOnField = starters.some(
      (s) => s.player.id === decision.from_player_id,
    );
    const toOnBench = bench.some((s) => s.player.id === decision.to_player_id);
    if (!fromOnField || !toOnBench) {
      return { ok: false, reason: 'invalid_decision' };
    }
    return { ok: true };
  }

  if (decision.kind === 'formation_change') {
    const valid: readonly FormationPreset[] = ['4-4-2', '4-3-3', '3-5-2', '5-3-2'];
    if (!valid.includes(decision.formation)) {
      return { ok: false, reason: 'invalid_formation' };
    }
    return { ok: true };
  }

  if (decision.kind === 'instruction_change') {
    const valid: readonly (TeamInstruction | null)[] = [
      null,
      'PRESS_HIGH',
      'HOLD_SHAPE',
      'COUNTER',
    ];
    if (!valid.includes(decision.instruction)) {
      return { ok: false, reason: 'invalid_instruction' };
    }
    if (decision.instruction === 'COUNTER' && playerClubSide === 'home') {
      return { ok: false, reason: 'counter_unavailable_for_home' };
    }
    return { ok: true };
  }

  if (decision.kind === 'emergency_gk_assign') {
    const lineup =
      playerClubSide === 'home'
        ? snapshot.currentLineupHome
        : snapshot.currentLineupAway;
    const def = lineup.find(
      (s) =>
        s.player.id === decision.defender_id && s.player.position === 'DEFENDER',
    );
    if (!def) return { ok: false, reason: 'defender_not_found' };
    return { ok: true };
  }

  return { ok: false, reason: 'unknown_decision' };
}

// ── Decision application ──────────────────────────────────────────────────────

function applyDecisionToSnapshot(
  snapshot: MatchSessionSnapshot,
  decision: MatchDecision,
  playerClubSide: 'home' | 'away',
): MatchSessionSnapshot {
  if (decision.kind === 'no_op') return snapshot;

  if (decision.kind === 'substitution') {
    const isHome = decision.team === 'home';
    const lineup = isHome ? snapshot.currentLineupHome : snapshot.currentLineupAway;
    const replacement = lineup.find(
      (s) => s.player.id === decision.to_player_id,
    );
    if (!replacement) return snapshot;
    const newLineup = replaceInLineup(
      lineup,
      decision.from_player_id,
      replacement,
    );
    const subEvent: MatchEvent = {
      type: 'substitution',
      minute: snapshot.currentTick,
      team: decision.team,
      player_id: decision.to_player_id,
      causal_node: null,
      reason: 'voluntary',
    };
    return {
      ...snapshot,
      currentLineupHome: isHome ? newLineup : snapshot.currentLineupHome,
      currentLineupAway: isHome ? snapshot.currentLineupAway : newLineup,
      substitutionsUsed:
        decision.team === playerClubSide
          ? snapshot.substitutionsUsed + 1
          : snapshot.substitutionsUsed,
      eventsAccumulated: [...snapshot.eventsAccumulated, subEvent],
    };
  }

  if (decision.kind === 'formation_change') {
    const isHome = playerClubSide === 'home';
    return {
      ...snapshot,
      currentFormationHome: isHome ? decision.formation : snapshot.currentFormationHome,
      currentFormationAway: isHome ? snapshot.currentFormationAway : decision.formation,
    };
  }

  if (decision.kind === 'instruction_change') {
    const isHome = playerClubSide === 'home';
    return {
      ...snapshot,
      activeInstructionHome: isHome ? decision.instruction : snapshot.activeInstructionHome,
      activeInstructionAway: isHome ? snapshot.activeInstructionAway : decision.instruction,
    };
  }

  if (decision.kind === 'emergency_gk_assign') {
    const lineup =
      playerClubSide === 'home'
        ? snapshot.currentLineupHome
        : snapshot.currentLineupAway;
    const promoted = lineup.map((s) =>
      s.player.id === decision.defender_id
        ? {
            ...s,
            player: { ...s.player, assignedAs: 'GOALKEEPER' as const },
          }
        : s,
    );
    return {
      ...snapshot,
      currentLineupHome:
        playerClubSide === 'home' ? promoted : snapshot.currentLineupHome,
      currentLineupAway:
        playerClubSide === 'away' ? promoted : snapshot.currentLineupAway,
    };
  }

  return snapshot;
}

function applyDecisions(
  snapshot: MatchSessionSnapshot,
  decisions: readonly MatchDecision[],
  playerClubSide: 'home' | 'away',
): MatchSessionSnapshot {
  // Apply in order: sub → formation → instruction → emergency_gk.
  // We trust the caller (story 017) to send them in sensible order; here we
  // apply as-given to keep the FSM simple.
  let s = snapshot;
  for (const d of decisions) {
    s = applyDecisionToSnapshot(s, d, playerClubSide);
  }
  return s;
}

// ── Snapshot init ─────────────────────────────────────────────────────────────

export function initMatchSession(
  input: Readonly<MatchInput>,
): MatchSessionSnapshot {
  // Forfeit short-circuit: state = 'completed', synthetic outcome.
  if (shouldForfeit(input)) {
    const { rng } = createMatchSimContext(input.seed, 0);
    return {
      currentTick: TOTAL_TICKS,
      eventsAccumulated: buildForfeitOutcome(input).events,
      currentLineupHome: input.homeLineup,
      currentLineupAway: input.awayLineup,
      homeMomentum: 50,
      substitutionsUsed: 0,
      awaySubstitutionsUsed: 0,
      yellowCardsByPlayerId: {},
      currentFormationHome: input.homeFormation,
      currentFormationAway: input.awayFormation,
      activeInstructionHome: input.homeInstruction,
      activeInstructionAway: input.awayInstruction,
      prngState: serializeRngState(rng),
      state: 'completed',
      timeoutJobId: null,
    };
  }

  const { rng } = createMatchSimContext(input.seed, 0);
  return {
    currentTick: 0,
    eventsAccumulated: [],
    currentLineupHome: input.homeLineup,
    currentLineupAway: input.awayLineup,
    homeMomentum: homeMomentumInitial(input.preMatchSnapshot),
    substitutionsUsed: 0,
    awaySubstitutionsUsed: 0,
    yellowCardsByPlayerId: {},
    currentFormationHome: input.homeFormation,
    currentFormationAway: input.awayFormation,
    activeInstructionHome: input.homeInstruction,
    activeInstructionAway: input.awayInstruction,
    prngState: serializeRngState(rng),
    state: 'pre_match',
    timeoutJobId: null,
  };
}

// ── Per-tick execution ────────────────────────────────────────────────────────

interface TickEffects {
  pauseType: PauseType;
  emittedThisTick: MatchEvent[];
}

/**
 * Run a single tick. Mutates the work-snapshot in place (it's not exposed; the
 * caller builds a new immutable snapshot from these mutations).
 */
function runOneTick(
  ctx: ReturnType<typeof createMatchSimContext>['ctx'],
  workState: {
    tick: number;
    homeMomentum: number;
    homeScore: number;
    awayScore: number;
    lineupHome: Lineup;
    lineupAway: Lineup;
    formationHome: FormationPreset;
    formationAway: FormationPreset;
    instructionHome: TeamInstruction | null;
    instructionAway: TeamInstruction | null;
    yellowCardsByPlayerId: Record<string, number>;
    substitutionsUsed: number;
    awaySubstitutionsUsed: number;
    minutesPlayed: Record<string, number>;
    eventsAccumulated: MatchEvent[];
  },
  input: Readonly<MatchInput>,
): TickEffects {
  const t = workState.tick;
  const effects: TickEffects = { pauseType: null, emittedThisTick: [] };

  const homeSplit = splitStartersAndBench(workState.lineupHome);
  const awaySplit = splitStartersAndBench(workState.lineupAway);

  // F4
  const homeMids = homeSplit.starters
    .filter((s) => s.player.position === 'MIDFIELDER')
    .map((s) => s.player);
  const awayMids = awaySplit.starters
    .filter((s) => s.player.position === 'MIDFIELDER')
    .map((s) => s.player);
  const mDelta = momentumDelta(ctx, homeMids, awayMids, workState.formationHome);
  workState.homeMomentum = applyMomentumDelta(workState.homeMomentum, mDelta);

  // F5
  const pAH = computePAttackHome(
    {
      formation: workState.formationHome,
      instruction: workState.instructionHome,
      avgFwdSpeed: avgFwdSpeed(homeSplit.starters),
    },
    workState.homeMomentum,
  );
  const pAA = computePAttackAway(
    {
      formation: workState.formationAway,
      instruction: workState.instructionAway,
      avgFwdSpeed: avgFwdSpeed(awaySplit.starters),
    },
    workState.homeMomentum,
  );
  const attackResolution = resolveAttackRoll(ctx, pAH, pAA);

  let goalThisTick = false;
  let cardThisTick = false;

  if (attackResolution !== 'none') {
    const attackingSide = attackResolution;
    const defendingSide = attackingSide === 'home' ? 'away' : 'home';
    const attackingStarters =
      attackingSide === 'home' ? homeSplit.starters : awaySplit.starters;
    const defendingStarters =
      defendingSide === 'home' ? homeSplit.starters : awaySplit.starters;

    const attackerSlot =
      pickHighestRated(getStartersByPosition(attackingStarters, 'FORWARD'), t) ??
      pickHighestRated(attackingStarters, t);
    const defenderSlot =
      pickHighestRated(getStartersByPosition(defendingStarters, 'DEFENDER'), t) ??
      pickHighestRated(defendingStarters, t);

    if (attackerSlot && defenderSlot) {
      const defenderFormation =
        defendingSide === 'home' ? workState.formationHome : workState.formationAway;
      const defenderHasHoldShape =
        (defendingSide === 'home'
          ? workState.instructionHome
          : workState.instructionAway) === 'HOLD_SHAPE';
      const attackingMids = attackingStarters
        .filter((s) => s.player.position === 'MIDFIELDER')
        .map((s) => s.player);

      const shotProb = pShot({
        attacker: attackerSlot.player,
        attackingMids,
        defender: defenderSlot.player,
        defenderFormation,
        defenderHasHoldShape,
        t,
      });
      if (ctx.rng() < shotProb) {
        const keeperSlot =
          defendingStarters.find((s) => s.player.position === 'GOALKEEPER') ??
          defendingStarters.find((s) => s.player.assignedAs === 'GOALKEEPER');
        if (keeperSlot) {
          const goalProb = pGoal(attackerSlot.player, keeperSlot.player, t);
          if (ctx.rng() < goalProb) {
            const goalEvent: MatchEvent = {
              type: 'goal',
              minute: t,
              team: attackingSide,
              player_id: attackerSlot.player.id,
              causal_node: null,
            };
            const varResult = resolveVarReview({
              ctx,
              tick: t,
              trigger: 'goal',
              triggerEvent: goalEvent,
            });
            workState.eventsAccumulated.push(...varResult.resultingEvents);
            effects.emittedThisTick.push(...varResult.resultingEvents);
            if (varResult.goalCounts) {
              if (attackingSide === 'home') workState.homeScore += 1;
              else workState.awayScore += 1;
              goalThisTick = true;
            }
          }
        }
      }
    }
  }

  // Card check (home)
  if (shouldRunCardCheck(t, attackResolution === 'away')) {
    const def =
      pickHighestRated(getStartersByPosition(homeSplit.starters, 'DEFENDER'), t) ??
      pickHighestRated(homeSplit.starters, t);
    if (def) {
      const r = resolveCardCheck({
        ctx,
        tick: t,
        defender: def.player,
        defenderTeam: 'home',
        yellowCardsByPlayerId: workState.yellowCardsByPlayerId,
      });
      workState.eventsAccumulated.push(...r.events);
      effects.emittedThisTick.push(...r.events);
      if (r.events.length > 0) cardThisTick = true;
      for (const id of Object.keys(r.updatedYellowCounts)) {
        workState.yellowCardsByPlayerId[id] = r.updatedYellowCounts[id]!;
      }
      if (r.playerSentOff) {
        workState.minutesPlayed[def.player.id] = t;
        workState.lineupHome = removePlayerFromLineup(workState.lineupHome, def.player.id);
        const pwt: MatchEvent = {
          type: 'playing_with_ten',
          minute: t,
          team: 'home',
          causal_node: null,
        };
        workState.eventsAccumulated.push(pwt);
        effects.emittedThisTick.push(pwt);
      }
    }
  }
  // Card check (away)
  if (shouldRunCardCheck(t, attackResolution === 'home')) {
    const def =
      pickHighestRated(getStartersByPosition(awaySplit.starters, 'DEFENDER'), t) ??
      pickHighestRated(awaySplit.starters, t);
    if (def) {
      const r = resolveCardCheck({
        ctx,
        tick: t,
        defender: def.player,
        defenderTeam: 'away',
        yellowCardsByPlayerId: workState.yellowCardsByPlayerId,
      });
      workState.eventsAccumulated.push(...r.events);
      effects.emittedThisTick.push(...r.events);
      if (r.events.length > 0) cardThisTick = true;
      for (const id of Object.keys(r.updatedYellowCounts)) {
        workState.yellowCardsByPlayerId[id] = r.updatedYellowCounts[id]!;
      }
      if (r.playerSentOff) {
        workState.minutesPlayed[def.player.id] = t;
        workState.lineupAway = removePlayerFromLineup(workState.lineupAway, def.player.id);
        const pwt: MatchEvent = {
          type: 'playing_with_ten',
          minute: t,
          team: 'away',
          causal_node: null,
        };
        workState.eventsAccumulated.push(pwt);
        effects.emittedThisTick.push(pwt);
      }
    }
  }

  // Injury check
  if (shouldRunInjuryCheck(t, goalThisTick, cardThisTick)) {
    const homeCand = pickLowestFitness(
      splitStartersAndBench(workState.lineupHome).starters,
      t,
    );
    if (homeCand) {
      const r = resolveInjuryCheck({
        ctx,
        tick: t,
        player: homeCand.player,
        playerTeam: 'home',
        playerClubSide: input.playerClubSide,
        preMatchSnapshot: input.preMatchSnapshot,
      });
      if (r.event) {
        workState.eventsAccumulated.push(r.event);
        effects.emittedThisTick.push(r.event);
        workState.minutesPlayed[homeCand.player.id] = t;
        workState.lineupHome = removePlayerFromLineup(
          workState.lineupHome,
          homeCand.player.id,
        );
        // Player-team injury pauses the match (per AC-MATCH-23 prelude)
        if (input.playerClubSide === 'home') {
          effects.pauseType = 'injury_pause';
        }
      }
    }
    const awayCand = pickLowestFitness(
      splitStartersAndBench(workState.lineupAway).starters,
      t,
    );
    if (awayCand) {
      const r = resolveInjuryCheck({
        ctx,
        tick: t,
        player: awayCand.player,
        playerTeam: 'away',
        playerClubSide: input.playerClubSide,
        preMatchSnapshot: input.preMatchSnapshot,
      });
      if (r.event) {
        workState.eventsAccumulated.push(r.event);
        effects.emittedThisTick.push(r.event);
        workState.minutesPlayed[awayCand.player.id] = t;
        if (input.playerClubSide === 'away') {
          effects.pauseType = 'injury_pause';
          workState.lineupAway = removePlayerFromLineup(
            workState.lineupAway,
            awayCand.player.id,
          );
        } else {
          // Rival injury → auto-resolve via rivalInjurySub
          const sub = rivalInjurySub({
            tick: t,
            injuredPlayer: awayCand.player,
            currentLineupAway: splitStartersAndBench(workState.lineupAway).starters,
            bench: splitStartersAndBench(workState.lineupAway).bench,
            awaySubstitutionsUsed: workState.awaySubstitutionsUsed,
          });
          if (sub) {
            workState.lineupAway = replaceInLineup(
              workState.lineupAway,
              awayCand.player.id,
              sub.to,
            );
            workState.minutesPlayed[sub.to.player.id] = workState.minutesPlayed[sub.to.player.id] ?? 0;
            workState.awaySubstitutionsUsed += 1;
            const sEvt: MatchEvent = {
              type: 'substitution',
              minute: t,
              team: 'away',
              player_id: sub.to.player.id,
              causal_node: null,
              reason: 'injury',
            };
            workState.eventsAccumulated.push(sEvt);
            effects.emittedThisTick.push(sEvt);
          } else {
            workState.lineupAway = removePlayerFromLineup(
              workState.lineupAway,
              awayCand.player.id,
            );
          }
        }
      }
    }
  }

  // Substitution window
  if (SUB_WINDOW_TICKS.has(t)) {
    const swEvent: MatchEvent = {
      type: 'substitution_window',
      minute: t,
      causal_node: null,
    };
    workState.eventsAccumulated.push(swEvent);
    effects.emittedThisTick.push(swEvent);
    effects.pauseType = 'substitution_window';
    // Rival AI subs are applied as part of "default decisions" (applyDefaultDecisions)
    // The FSM pauses here — caller decides whether to apply defaults or wait for player decision.
  }

  // Update minutesPlayed
  for (const slot of splitStartersAndBench(workState.lineupHome).starters) {
    workState.minutesPlayed[slot.player.id] =
      (workState.minutesPlayed[slot.player.id] ?? 0) + 1;
  }
  for (const slot of splitStartersAndBench(workState.lineupAway).starters) {
    workState.minutesPlayed[slot.player.id] =
      (workState.minutesPlayed[slot.player.id] ?? 0) + 1;
  }

  return effects;
}

// ── Default decisions applier (used on pause when no player input arrived) ──

export function applyDefaultDecisionsToSnapshot(
  snapshot: MatchSessionSnapshot,
  pauseType: Exclude<PauseType, null>,
): MatchSessionSnapshot {
  if (pauseType !== 'substitution_window') {
    // injury_pause default: 'continue with 10' — no sub. Nothing to do.
    return snapshot;
  }
  // Apply rival AI subs at substitution_window
  const t = snapshot.currentTick;
  const awaySplit = splitStartersAndBench(snapshot.currentLineupAway);
  const rivalSubs = rivalSubstitutionPlan({
    tick: t,
    currentLineupAway: awaySplit.starters,
    bench: awaySplit.bench,
    awaySubstitutionsUsed: snapshot.awaySubstitutionsUsed,
  });
  let lineupAway = snapshot.currentLineupAway;
  let awaySubstitutionsUsed = snapshot.awaySubstitutionsUsed;
  const newEvents: MatchEvent[] = [];
  for (const sub of rivalSubs) {
    lineupAway = replaceInLineup(lineupAway, sub.from.player.id, sub.to);
    awaySubstitutionsUsed += 1;
    newEvents.push({
      type: 'substitution',
      minute: t,
      team: 'away',
      player_id: sub.to.player.id,
      causal_node: null,
      reason: 'scheduled',
    });
  }
  return {
    ...snapshot,
    currentLineupAway: lineupAway,
    awaySubstitutionsUsed,
    eventsAccumulated: [...snapshot.eventsAccumulated, ...newEvents],
  };
}

// ── Build MatchOutcome from a completed snapshot ──────────────────────────────

function buildMatchOutcome(
  snapshot: MatchSessionSnapshot,
  input: Readonly<MatchInput>,
  minutesPlayed: Record<string, number>,
  homeScore: number,
  awayScore: number,
): MatchOutcome {
  const externalEvents = snapshot.eventsAccumulated.filter(
    (e) => e.type !== 'substitution_window',
  );
  const mpiDelta = computeMpiDelta({
    homeScore,
    awayScore,
    playerClubSide: input.playerClubSide,
  });
  const injuryDelta = computeInjuryRiskDelta(externalEvents);

  const finalLineup =
    input.playerClubSide === 'home'
      ? snapshot.currentLineupHome
      : snapshot.currentLineupAway;
  const originalLineup =
    input.playerClubSide === 'home' ? input.homeLineup : input.awayLineup;
  const seen = new Set<string>();
  const ratable: PlayerSlot[] = [];
  for (const slot of [...originalLineup, ...finalLineup]) {
    if (!seen.has(slot.player.id)) {
      seen.add(slot.player.id);
      ratable.push(slot);
    }
  }
  const playerRatings = computePlayerRatings({
    playerLineup: ratable,
    minutesPlayed,
    t: TOTAL_TICKS,
  });

  return {
    homeScore,
    awayScore,
    winner:
      homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw',
    events: externalEvents,
    worldStateDeltas: {
      match_performance_index: mpiDelta,
      injury_risk: injuryDelta,
    },
    playerRatings,
    finalLineupHome: snapshot.currentLineupHome,
    finalLineupAway: snapshot.currentLineupAway,
  };
}

// ── advanceTick — the main FSM driver ─────────────────────────────────────────

export function advanceTick(
  snapshot: Readonly<MatchSessionSnapshot>,
  decisions: readonly MatchDecision[],
  input: Readonly<MatchInput>,
): AdvanceTickResult {
  // No-op when already terminal
  if (snapshot.state === 'completed' || snapshot.state === 'failed') {
    return {
      nextSnapshot: snapshot,
      newlyEmittedEvents: [],
      pauseType: null,
      matchOutcome: null,
    };
  }

  // Apply incoming decisions to the snapshot (lineup/formation/instruction)
  let working = applyDecisions(snapshot, decisions, input.playerClubSide);

  // Rehydrate the PRNG from the captured state
  const { ctx, rng } = createMatchSimContextFromSnapshot(
    input.seed,
    0,
    working.prngState,
  );

  // Migrate snapshot fields into a mutable workState
  const workState = {
    tick: working.currentTick,
    homeMomentum: working.homeMomentum,
    homeScore: 0,
    awayScore: 0,
    lineupHome: working.currentLineupHome,
    lineupAway: working.currentLineupAway,
    formationHome: working.currentFormationHome,
    formationAway: working.currentFormationAway,
    instructionHome: working.activeInstructionHome,
    instructionAway: working.activeInstructionAway,
    yellowCardsByPlayerId: { ...working.yellowCardsByPlayerId },
    substitutionsUsed: working.substitutionsUsed,
    awaySubstitutionsUsed: working.awaySubstitutionsUsed,
    minutesPlayed: {} as Record<string, number>,
    eventsAccumulated: [...working.eventsAccumulated],
  };

  // Reconstruct minutesPlayed and scores from accumulated events.
  // This is required when resuming from a partial snapshot.
  for (const slot of splitStartersAndBench(workState.lineupHome).starters) {
    workState.minutesPlayed[slot.player.id] = workState.tick;
  }
  for (const slot of splitStartersAndBench(workState.lineupAway).starters) {
    workState.minutesPlayed[slot.player.id] = workState.tick;
  }
  for (const e of workState.eventsAccumulated) {
    if (e.type === 'goal') {
      if (e.team === 'home') workState.homeScore += 1;
      else if (e.team === 'away') workState.awayScore += 1;
    }
    // goal_disallowed cancels the prior goal — adjust score
    if (e.type === 'goal_disallowed') {
      if (e.team === 'home') workState.homeScore -= 1;
      else if (e.team === 'away') workState.awayScore -= 1;
    }
  }

  const eventsAtStart = workState.eventsAccumulated.length;
  let pauseType: PauseType = null;

  while (workState.tick < TOTAL_TICKS) {
    workState.tick += 1;
    const effects = runOneTick(ctx, workState, input);
    if (effects.pauseType !== null) {
      pauseType = effects.pauseType;
      break;
    }
  }

  const newlyEmittedEvents = workState.eventsAccumulated.slice(eventsAtStart);
  const reachedEnd = workState.tick >= TOTAL_TICKS;
  const nextState: MatchSessionState = reachedEnd
    ? 'completed'
    : pauseType !== null
      ? 'paused_for_decision'
      : 'in_progress';

  const nextSnapshot: MatchSessionSnapshot = {
    currentTick: workState.tick,
    eventsAccumulated: workState.eventsAccumulated,
    currentLineupHome: workState.lineupHome,
    currentLineupAway: workState.lineupAway,
    homeMomentum: workState.homeMomentum,
    substitutionsUsed: workState.substitutionsUsed,
    awaySubstitutionsUsed: workState.awaySubstitutionsUsed,
    yellowCardsByPlayerId: workState.yellowCardsByPlayerId,
    currentFormationHome: workState.formationHome,
    currentFormationAway: workState.formationAway,
    activeInstructionHome: workState.instructionHome,
    activeInstructionAway: workState.instructionAway,
    prngState: serializeRngState(rng as StatefulPRNG),
    state: nextState,
    timeoutJobId: null,
  };

  const matchOutcome = reachedEnd
    ? buildMatchOutcome(
        nextSnapshot,
        input,
        workState.minutesPlayed,
        workState.homeScore,
        workState.awayScore,
      )
    : null;

  return {
    nextSnapshot,
    newlyEmittedEvents,
    pauseType,
    matchOutcome,
  };
}

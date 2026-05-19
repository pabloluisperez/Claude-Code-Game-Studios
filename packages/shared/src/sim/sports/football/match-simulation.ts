/**
 * Top-level match simulation entry point — pure function path (ADR-007).
 *
 * Owns the **forfeit short-circuit** (AC-MATCH-16): when the player's club
 * has too few players available (`squad_available_pct <= FORFEIT_SQUAD_THRESHOLD`),
 * the match never starts and a synthetic 3-0 loss is returned.
 *
 * Otherwise runs the 90-tick per-tick loop, orchestrating F3..F10 + card +
 * injury + VAR + substitution_window events. ALL randomness is consumed
 * through `ctx.rng()` (created from `input.seed` via `createMatchSimContext`),
 * so the function is deterministic for any given input (AC-MATCH-01).
 *
 * Default decisions: the manager NEVER substitutes voluntarily (player
 * `substitutionsUsed === 0` at end). Rival AI applies its rules (story 012).
 * Pause windows emit `substitution_window` events to the INTERNAL stream;
 * AC-MATCH-30 filters them out of the EXTERNAL `MatchOutcome.events`.
 *
 * Story: MATCH-SIM-013 (extends MATCH-SIM-011 forfeit short-circuit)
 * Control Manifest: 2026-05-19
 */

import type {
  Lineup,
  MatchEvent,
  MatchInput,
  MatchOutcome,
  PlayerSlot,
  PlayerStats,
  Position,
} from './football-types.js';
import { createMatchSimContext } from './match-prng.js';
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
import {
  FORFEIT_LOSER_SCORE,
  FORFEIT_MPI_DELTA,
  FORFEIT_SQUAD_THRESHOLD,
  FORFEIT_WINNER_SCORE,
} from './football-constants.js';

// ── Forfeit (MATCH-SIM-011) ───────────────────────────────────────────────────

export function shouldForfeit(input: Readonly<MatchInput>): boolean {
  return input.preMatchSnapshot.squad_available_pct <= FORFEIT_SQUAD_THRESHOLD;
}

export function buildForfeitOutcome(input: Readonly<MatchInput>): MatchOutcome {
  const isHome = input.playerClubSide === 'home';
  const homeScore = isHome ? FORFEIT_LOSER_SCORE : FORFEIT_WINNER_SCORE;
  const awayScore = isHome ? FORFEIT_WINNER_SCORE : FORFEIT_LOSER_SCORE;
  const event: MatchEvent = {
    type: 'forfeit',
    minute: 0,
    team: input.playerClubSide,
    causal_node: 'squad_available_pct',
  };
  return {
    homeScore,
    awayScore,
    winner: isHome ? 'away' : 'home',
    events: [event],
    worldStateDeltas: {
      match_performance_index: FORFEIT_MPI_DELTA,
      injury_risk: 0,
    },
    playerRatings: {},
    finalLineupHome: input.homeLineup,
    finalLineupAway: input.awayLineup,
  };
}

// ── Lineup helpers (deterministic tiebreakers) ────────────────────────────────

function splitStartersAndBench(lineup: Lineup): { starters: PlayerSlot[]; bench: PlayerSlot[] } {
  // Slots 0..10 are starters; 11+ are bench (per Lineup convention).
  return {
    starters: lineup.slice(0, 11),
    bench: lineup.slice(11),
  };
}

function getStartersByPosition(starters: readonly PlayerSlot[], pos: Position): PlayerSlot[] {
  return starters.filter((s) => s.player.position === pos || s.player.assignedAs === pos);
}

function pickHighestRated(slots: readonly PlayerSlot[], t: number): PlayerSlot | null {
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

function pickLowestFitness(slots: readonly PlayerSlot[], t: number): PlayerSlot | null {
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

function replaceInLineup(lineup: Lineup, fromId: string, replacement: PlayerSlot): Lineup {
  const out: PlayerSlot[] = [];
  let replaced = false;
  let benchRemoved = false;
  for (const slot of lineup) {
    if (!replaced && slot.player.id === fromId) {
      out.push({ player: replacement.player, slotIndex: slot.slotIndex });
      replaced = true;
    } else if (!benchRemoved && slot.player.id === replacement.player.id) {
      // Remove the bench entry of the player coming on
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

// ── Top-level entry ───────────────────────────────────────────────────────────

const TOTAL_TICKS = 90;
const SUB_WINDOW_TICKS = new Set([45, 60, 75]);

export function simulateMatch(input: Readonly<MatchInput>): MatchOutcome {
  if (shouldForfeit(input)) {
    return buildForfeitOutcome(input);
  }

  const { ctx } = createMatchSimContext(input.seed, 0);

  // Mutable per-tick state
  let homeMomentum = homeMomentumInitial(input.preMatchSnapshot);
  let homeScore = 0;
  let awayScore = 0;
  let currentLineupHome: Lineup = input.homeLineup;
  let currentLineupAway: Lineup = input.awayLineup;
  let awaySubstitutionsUsed = 0;
  const yellowCardsByPlayerId: Record<string, number> = {};
  const eventsAccumulated: MatchEvent[] = [];
  const minutesPlayed: Record<string, number> = {};

  // Seed minutesPlayed for all starters at 0
  for (const slot of splitStartersAndBench(currentLineupHome).starters) {
    minutesPlayed[slot.player.id] = 0;
  }
  for (const slot of splitStartersAndBench(currentLineupAway).starters) {
    minutesPlayed[slot.player.id] = 0;
  }

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const homeSplit = splitStartersAndBench(currentLineupHome);
    const awaySplit = splitStartersAndBench(currentLineupAway);

    // ── F4 momentum ────────────────────────────────────────────────────────
    const homeMids = homeSplit.starters.filter((s) => s.player.position === 'MIDFIELDER').map((s) => s.player);
    const awayMids = awaySplit.starters.filter((s) => s.player.position === 'MIDFIELDER').map((s) => s.player);
    const mDelta = momentumDelta(ctx, homeMids, awayMids, input.homeFormation);
    homeMomentum = applyMomentumDelta(homeMomentum, mDelta);

    // ── F5 attack resolution ───────────────────────────────────────────────
    const pAH = computePAttackHome(
      { formation: input.homeFormation, instruction: input.homeInstruction, avgFwdSpeed: avgFwdSpeed(homeSplit.starters) },
      homeMomentum,
    );
    const pAA = computePAttackAway(
      { formation: input.awayFormation, instruction: input.awayInstruction, avgFwdSpeed: avgFwdSpeed(awaySplit.starters) },
      homeMomentum,
    );
    const attackResolution = resolveAttackRoll(ctx, pAH, pAA);

    let goalThisTick = false;
    let cardThisTick = false;

    if (attackResolution !== 'none') {
      const attackingSide = attackResolution;
      const defendingSide = attackingSide === 'home' ? 'away' : 'home';
      const attackingStarters = attackingSide === 'home' ? homeSplit.starters : awaySplit.starters;
      const defendingStarters = defendingSide === 'home' ? homeSplit.starters : awaySplit.starters;

      const attackerSlot = pickHighestRated(getStartersByPosition(attackingStarters, 'FORWARD'), t)
        ?? pickHighestRated(attackingStarters, t);
      const defenderSlot = pickHighestRated(getStartersByPosition(defendingStarters, 'DEFENDER'), t)
        ?? pickHighestRated(defendingStarters, t);

      if (attackerSlot && defenderSlot) {
        const defenderFormation = defendingSide === 'home' ? input.homeFormation : input.awayFormation;
        const defenderHasHoldShape =
          (defendingSide === 'home' ? input.homeInstruction : input.awayInstruction) === 'HOLD_SHAPE';
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
        const shotRoll = ctx.rng();
        if (shotRoll < shotProb) {
          // F7 P_goal
          const keeperSlot =
            defendingStarters.find((s) => s.player.position === 'GOALKEEPER') ??
            defendingStarters.find((s) => s.player.assignedAs === 'GOALKEEPER');
          if (keeperSlot) {
            const goalProb = pGoal(attackerSlot.player, keeperSlot.player, t);
            const goalRoll = ctx.rng();
            if (goalRoll < goalProb) {
              const goalEvent: MatchEvent = {
                type: 'goal',
                minute: t,
                team: attackingSide,
                player_id: attackerSlot.player.id,
                causal_node: null,
              };
              const varResult = resolveVarReview({ ctx, tick: t, trigger: 'goal', triggerEvent: goalEvent });
              eventsAccumulated.push(...varResult.resultingEvents);
              if (varResult.goalCounts) {
                if (attackingSide === 'home') homeScore += 1;
                else awayScore += 1;
                goalThisTick = true;
              }
            }
          }
        }
      }
    }

    // ── Card check ─────────────────────────────────────────────────────────
    if (shouldRunCardCheck(t, attackResolution === 'away')) {
      const def = pickHighestRated(getStartersByPosition(homeSplit.starters, 'DEFENDER'), t)
        ?? pickHighestRated(homeSplit.starters, t);
      if (def) {
        const r = resolveCardCheck({
          ctx,
          tick: t,
          defender: def.player,
          defenderTeam: 'home',
          yellowCardsByPlayerId,
        });
        eventsAccumulated.push(...r.events);
        if (r.events.length > 0) cardThisTick = true;
        // Mutate yellow counts
        for (const id of Object.keys(r.updatedYellowCounts)) {
          yellowCardsByPlayerId[id] = r.updatedYellowCounts[id]!;
        }
        if (r.playerSentOff) {
          minutesPlayed[def.player.id] = t;
          currentLineupHome = removePlayerFromLineup(currentLineupHome, def.player.id);
          eventsAccumulated.push({
            type: 'playing_with_ten',
            minute: t,
            team: 'home',
            causal_node: null,
          });
        }
      }
    }
    if (shouldRunCardCheck(t, attackResolution === 'home')) {
      const def = pickHighestRated(getStartersByPosition(awaySplit.starters, 'DEFENDER'), t)
        ?? pickHighestRated(awaySplit.starters, t);
      if (def) {
        const r = resolveCardCheck({
          ctx,
          tick: t,
          defender: def.player,
          defenderTeam: 'away',
          yellowCardsByPlayerId,
        });
        eventsAccumulated.push(...r.events);
        if (r.events.length > 0) cardThisTick = true;
        for (const id of Object.keys(r.updatedYellowCounts)) {
          yellowCardsByPlayerId[id] = r.updatedYellowCounts[id]!;
        }
        if (r.playerSentOff) {
          minutesPlayed[def.player.id] = t;
          currentLineupAway = removePlayerFromLineup(currentLineupAway, def.player.id);
          eventsAccumulated.push({
            type: 'playing_with_ten',
            minute: t,
            team: 'away',
            causal_node: null,
          });
        }
      }
    }

    // ── Injury check ───────────────────────────────────────────────────────
    if (shouldRunInjuryCheck(t, goalThisTick, cardThisTick)) {
      // Roll for the lowest-fitness starter on each team
      const homeCandidate = pickLowestFitness(splitStartersAndBench(currentLineupHome).starters, t);
      if (homeCandidate) {
        const r = resolveInjuryCheck({
          ctx,
          tick: t,
          player: homeCandidate.player,
          playerTeam: 'home',
          playerClubSide: input.playerClubSide,
          preMatchSnapshot: input.preMatchSnapshot,
        });
        if (r.event) {
          eventsAccumulated.push(r.event);
          minutesPlayed[homeCandidate.player.id] = t;
          currentLineupHome = removePlayerFromLineup(currentLineupHome, homeCandidate.player.id);
        }
      }
      const awayCandidate = pickLowestFitness(splitStartersAndBench(currentLineupAway).starters, t);
      if (awayCandidate) {
        const r = resolveInjuryCheck({
          ctx,
          tick: t,
          player: awayCandidate.player,
          playerTeam: 'away',
          playerClubSide: input.playerClubSide,
          preMatchSnapshot: input.preMatchSnapshot,
        });
        if (r.event) {
          eventsAccumulated.push(r.event);
          minutesPlayed[awayCandidate.player.id] = t;
          // Rival injury sub fallback (story 012)
          const sub = rivalInjurySub({
            tick: t,
            injuredPlayer: awayCandidate.player,
            currentLineupAway: splitStartersAndBench(currentLineupAway).starters,
            bench: splitStartersAndBench(currentLineupAway).bench,
            awaySubstitutionsUsed,
          });
          if (sub) {
            currentLineupAway = replaceInLineup(currentLineupAway, awayCandidate.player.id, sub.to);
            minutesPlayed[sub.to.player.id] = (minutesPlayed[sub.to.player.id] ?? 0);
            awaySubstitutionsUsed += 1;
            eventsAccumulated.push({
              type: 'substitution',
              minute: t,
              team: 'away',
              player_id: sub.to.player.id,
              causal_node: null,
              reason: 'injury',
            });
          } else {
            currentLineupAway = removePlayerFromLineup(currentLineupAway, awayCandidate.player.id);
          }
        }
      }
    }

    // ── Substitution window ────────────────────────────────────────────────
    if (SUB_WINDOW_TICKS.has(t)) {
      eventsAccumulated.push({
        type: 'substitution_window',
        minute: t,
        causal_node: null,
      });
      // Player default = no sub. Rival AI applies its plan.
      const awayNow = splitStartersAndBench(currentLineupAway);
      const rivalSubs = rivalSubstitutionPlan({
        tick: t,
        currentLineupAway: awayNow.starters,
        bench: awayNow.bench,
        awaySubstitutionsUsed,
      });
      for (const sub of rivalSubs) {
        currentLineupAway = replaceInLineup(currentLineupAway, sub.from.player.id, sub.to);
        minutesPlayed[sub.from.player.id] = t;
        minutesPlayed[sub.to.player.id] = (minutesPlayed[sub.to.player.id] ?? 0);
        awaySubstitutionsUsed += 1;
        eventsAccumulated.push({
          type: 'substitution',
          minute: t,
          team: 'away',
          player_id: sub.to.player.id,
          causal_node: null,
          reason: 'scheduled',
        });
      }
    }

    // ── Update minutesPlayed for active starters ───────────────────────────
    for (const slot of splitStartersAndBench(currentLineupHome).starters) {
      minutesPlayed[slot.player.id] = (minutesPlayed[slot.player.id] ?? 0) + 1;
    }
    for (const slot of splitStartersAndBench(currentLineupAway).starters) {
      minutesPlayed[slot.player.id] = (minutesPlayed[slot.player.id] ?? 0) + 1;
    }
  }

  // ── Post-match aggregation ─────────────────────────────────────────────
  const mpiDelta = computeMpiDelta({
    homeScore,
    awayScore,
    playerClubSide: input.playerClubSide,
  });

  // AC-MATCH-30: filter substitution_window from external events
  const externalEvents: MatchEvent[] = eventsAccumulated.filter(
    (e) => e.type !== 'substitution_window',
  );
  const injuryDelta = computeInjuryRiskDelta(externalEvents);

  // F10: rate the player's own-team players (starters + subs who came on)
  // We collect all unique players who appeared in either lineup at any point.
  const playerLineupFinal =
    input.playerClubSide === 'home' ? currentLineupHome : currentLineupAway;
  const playerLineupOriginal =
    input.playerClubSide === 'home' ? input.homeLineup : input.awayLineup;
  const seen = new Set<string>();
  const ratableSlots: PlayerSlot[] = [];
  for (const slot of [...playerLineupOriginal, ...playerLineupFinal]) {
    if (!seen.has(slot.player.id)) {
      seen.add(slot.player.id);
      ratableSlots.push(slot);
    }
  }
  const playerRatings = computePlayerRatings({
    playerLineup: ratableSlots,
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
    finalLineupHome: currentLineupHome,
    finalLineupAway: currentLineupAway,
  };
}

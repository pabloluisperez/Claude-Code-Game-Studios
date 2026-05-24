/**
 * Rival AI — deterministic pre-match formation selection and in-match
 * substitution decisions.
 *
 * Per ADR-007 + GDD §Rival AI Manager: ALL rival decisions are deterministic
 * functions of inputs. No rng() is consumed. This keeps the determinism
 * contract simple: only the player's club + the in-match rolls differ between
 * replays; the rival's reactions to a given state are stable.
 *
 * Story: MATCH-SIM-012
 * Control Manifest: 2026-05-19
 */

import type {
  FormationPreset,
  Lineup,
  PlayerSlot,
  PlayerStats,
  Position,
} from './football-types.js';
import { effectiveFitness, effectiveRating } from './football-formulas.js';

// ── Constants tied to AC-MATCH-32 ────────────────────────────────────────────

/** AC-MATCH-32 — strength_ratio > this → rival picks 4-3-3 (offensive). */
export const RIVAL_STRENGTH_RATIO_STRONG = 1.1;
/** AC-MATCH-32 — strength_ratio < this → rival picks 5-3-2 (defensive). */
export const RIVAL_STRENGTH_RATIO_WEAK = 0.9;
/** AC-MATCH-27 — effective_fitness < this triggers scheduled-window subs. */
export const RIVAL_SUB_FITNESS_THRESHOLD = 40;
/** Maximum substitutions a team may use in a match (per league rules). */
export const MAX_SUBSTITUTIONS = 5;

// ── Pre-match formation selection (AC-MATCH-32) ──────────────────────────────

function meanEffectiveRating(lineup: Lineup, t = 0): number {
  if (lineup.length === 0) return 0;
  let sum = 0;
  for (const slot of lineup) {
    sum += effectiveRating(slot.player, t);
  }
  return sum / lineup.length;
}

/**
 * Pick the rival's formation based on the strength ratio
 * `mean(awayRating) / mean(homeRating)` at match start.
 *
 *   ratio > 1.10  → '4-3-3' (rival significantly stronger)
 *   ratio < 0.90  → '5-3-2' (rival significantly weaker)
 *   otherwise     → '4-4-2'
 *
 * Strict inequalities at both boundaries (1.10 and 0.90 themselves → 4-4-2).
 */
export function selectRivalFormation(
  homeLineup: Lineup,
  awayLineup: Lineup,
): FormationPreset {
  const homeMean = meanEffectiveRating(homeLineup, 0);
  if (homeMean === 0) return '4-4-2';
  const awayMean = meanEffectiveRating(awayLineup, 0);
  const ratio = awayMean / homeMean;
  if (ratio > RIVAL_STRENGTH_RATIO_STRONG) return '4-3-3';
  if (ratio < RIVAL_STRENGTH_RATIO_WEAK) return '5-3-2';
  return '4-4-2';
}

// ── Substitution decisions ────────────────────────────────────────────────────

export interface RivalSubDecision {
  readonly from: PlayerSlot;
  readonly to: PlayerSlot;
}

function pickBestBenchInPosition(
  bench: readonly PlayerSlot[],
  position: Position,
  t: number,
): PlayerSlot | null {
  let best: PlayerSlot | null = null;
  let bestRating = -Infinity;
  for (const slot of bench) {
    if (slot.player.position !== position) continue;
    const r = effectiveRating(slot.player, t);
    if (r > bestRating) {
      best = slot;
      bestRating = r;
    }
  }
  return best;
}

function pickBestBenchAnyPosition(
  bench: readonly PlayerSlot[],
  t: number,
): PlayerSlot | null {
  let best: PlayerSlot | null = null;
  let bestRating = -Infinity;
  for (const slot of bench) {
    const r = effectiveRating(slot.player, t);
    if (r > bestRating) {
      best = slot;
      bestRating = r;
    }
  }
  return best;
}

/**
 * Plan substitutions to make at a scheduled window (tick 45/60/75).
 *
 * Algorithm:
 *   1. Find starters with effectiveFitness(tick) < RIVAL_SUB_FITNESS_THRESHOLD.
 *   2. Sort ascending by effective_fitness (worst first).
 *   3. For each, find the best bench player in MATCHING position.
 *   4. Stop when budget (MAX_SUBSTITUTIONS - awaySubstitutionsUsed) hits 0
 *      OR no more sub candidates remain.
 *
 * Returns the ordered list of decisions (empty when no subs needed).
 */
export function rivalSubstitutionPlan(args: {
  readonly tick: number;
  readonly currentLineupAway: Lineup;
  readonly bench: readonly PlayerSlot[];
  readonly awaySubstitutionsUsed: number;
}): readonly RivalSubDecision[] {
  const { tick, currentLineupAway, bench, awaySubstitutionsUsed } = args;
  const budget = MAX_SUBSTITUTIONS - awaySubstitutionsUsed;
  if (budget <= 0) return [];

  const unfitStarters = currentLineupAway
    .filter((slot) => effectiveFitness(slot.player, tick) < RIVAL_SUB_FITNESS_THRESHOLD)
    .map((slot) => ({ slot, ef: effectiveFitness(slot.player, tick) }))
    .sort((a, b) => a.ef - b.ef);

  const decisions: RivalSubDecision[] = [];
  const usedBenchIds = new Set<string>();
  for (const { slot } of unfitStarters) {
    if (decisions.length >= budget) break;
    const availableBench = bench.filter((b) => !usedBenchIds.has(b.player.id));
    const replacement = pickBestBenchInPosition(availableBench, slot.player.position, tick);
    if (replacement === null) continue;
    usedBenchIds.add(replacement.player.id);
    decisions.push({ from: slot, to: replacement });
  }
  return decisions;
}

/**
 * Forced injury substitution (any-position fallback per GDD line 304).
 * Returns null when no sub is possible (bench empty OR budget exhausted).
 */
export function rivalInjurySub(args: {
  readonly tick: number;
  readonly injuredPlayer: Readonly<PlayerStats>;
  readonly currentLineupAway: Lineup;
  readonly bench: readonly PlayerSlot[];
  readonly awaySubstitutionsUsed: number;
}): RivalSubDecision | null {
  const { tick, injuredPlayer, currentLineupAway, bench, awaySubstitutionsUsed } = args;
  if (awaySubstitutionsUsed >= MAX_SUBSTITUTIONS) return null;
  const injuredSlot = currentLineupAway.find((s) => s.player.id === injuredPlayer.id);
  if (!injuredSlot) return null;

  const samePos = pickBestBenchInPosition(bench, injuredPlayer.position, tick);
  if (samePos) return { from: injuredSlot, to: samePos };

  // Fallback: any position
  const any = pickBestBenchAnyPosition(bench, tick);
  if (any) return { from: injuredSlot, to: any };

  return null;
}

// ── Lineup generation ─────────────────────────────────────────────────────────

const POSITION_MINIMA: Readonly<Record<Position, number>> = Object.freeze({
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 0,
  FORWARD: 2,
});

const LINEUP_SIZE = 11;
const BENCH_SIZE = 7;

/**
 * Pick 11 starters + up to 7 bench from a rival squad.
 *
 * Starters: respect minima (1 GK, 2 DEF, 2 FWD) then fill the remaining 6
 * slots with the top players by effective_rating(t=0).
 *
 * Defensive: if no GK exists in the squad, the best-rated player is selected
 * and marked `assignedAs: 'GOALKEEPER'` (emergency GK per AC-MATCH-17). This
 * mutation produces a new PlayerStats with `assignedAs` set.
 *
 * Bench: top BENCH_SIZE remaining by effective_rating.
 */
export function generateRivalLineup(squad: readonly PlayerStats[]): Lineup {
  if (squad.length < LINEUP_SIZE) {
    throw new Error(`generateRivalLineup: squad too small (${squad.length} < ${LINEUP_SIZE})`);
  }

  const byPosition = new Map<Position, PlayerStats[]>();
  for (const p of squad) {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }
  for (const list of byPosition.values()) {
    list.sort((a, b) => effectiveRating(b, 0) - effectiveRating(a, 0));
  }

  const selected: PlayerStats[] = [];
  const usedIds = new Set<string>();

  // Reserve minima
  let needsEmergencyGK = false;
  for (const position of Object.keys(POSITION_MINIMA) as Position[]) {
    const needed = POSITION_MINIMA[position];
    if (needed === 0) continue;
    const available = byPosition.get(position) ?? [];
    for (let i = 0; i < needed; i++) {
      const p = available[i];
      if (!p) {
        if (position === 'GOALKEEPER') {
          needsEmergencyGK = true;
        }
        break;
      }
      selected.push(p);
      usedIds.add(p.id);
    }
  }

  // Emergency GK promotion if squad has no GOALKEEPER position
  if (needsEmergencyGK) {
    const sortedSquad = [...squad].sort(
      (a, b) => effectiveRating(b, 0) - effectiveRating(a, 0),
    );
    const candidate = sortedSquad.find((p) => !usedIds.has(p.id));
    if (candidate) {
      const promoted: PlayerStats = { ...candidate, assignedAs: 'GOALKEEPER' };
      selected.push(promoted);
      usedIds.add(promoted.id);
    }
  }

  // Fill remaining slots with top by rating
  const remaining = squad
    .filter((p) => !usedIds.has(p.id))
    .sort((a, b) => effectiveRating(b, 0) - effectiveRating(a, 0));
  while (selected.length < LINEUP_SIZE && remaining.length > 0) {
    const next = remaining.shift()!;
    selected.push(next);
    usedIds.add(next.id);
  }

  // Build starters then bench
  const starters: PlayerSlot[] = selected.map((player, slotIndex) => ({ player, slotIndex }));
  const bench: PlayerSlot[] = remaining
    .slice(0, BENCH_SIZE)
    .map((player, i) => ({ player, slotIndex: LINEUP_SIZE + i }));

  return [...starters, ...bench];
}

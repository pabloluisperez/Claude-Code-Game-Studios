/**
 * Quick (batch) match simulator.
 *
 * Produces a deterministic score + minute-by-minute events for one match
 * given just rosters + a seeded PRNG. Used to advance the league on
 * "Avanzar semana" without running the full live FSM.
 *
 * Model:
 *   - Team strength = weighted sum of the four core attributes for the
 *     top-11 by skill:
 *       calidad      40%
 *       velocidad    30%
 *       agresividad  15%
 *       resistencia  15%
 *     scaled by team form (0.5..1.0).
 *   - Expected goals = base 1.2 + 0.04 × (strength − 50) for each side,
 *     plus a 0.25 home advantage bonus.
 *   - Final goals drawn from a clamped Poisson sampler.
 *   - Card propensity scales with team agresividad: at avg 50 ≈ 1
 *     card/match, at 80 ≈ 3 cards. Red cards are 10% of cards.
 *   - Injury propensity scales with combined agresividad of the two
 *     teams: high-aggression matches see more injuries.
 *
 * Story: Quick sim — Velocidad/Resistencia/Agresividad/Calidad model
 * Control Manifest: 2026-05-20
 */

export interface QuickPlayerInput {
  readonly skill: number;
  readonly form: number;
  readonly velocidad?: number;
  readonly resistencia?: number;
  readonly agresividad?: number;
  readonly calidad?: number;
}

export interface QuickMatchEvent {
  readonly minute: number;
  readonly type: 'goal' | 'yellow_card' | 'red_card' | 'injury';
  readonly team: 'home' | 'away';
}

export interface QuickMatchResult {
  readonly homeScore: number;
  readonly awayScore: number;
  readonly winner: 'home' | 'away' | 'draw';
  readonly homeStrength: number;
  readonly awayStrength: number;
  readonly events: readonly QuickMatchEvent[];
}

const TOP_N = 11;
const HOME_ADVANTAGE = 0.25;
const BASE_XG = 1.2;
const STRENGTH_TO_XG = 0.04;
const MAX_GOALS = 8;

interface TeamAggregates {
  strength: number;
  /** Average team agresividad (0-100). */
  aggMean: number;
  /** Average team form (0-100). */
  formMean: number;
}

function aggregates(roster: readonly QuickPlayerInput[]): TeamAggregates {
  if (roster.length === 0) {
    return { strength: 0, aggMean: 50, formMean: 60 };
  }
  const top = [...roster]
    .sort((a, b) => b.skill - a.skill)
    .slice(0, TOP_N);

  const meanVel = top.reduce((s, p) => s + (p.velocidad ?? p.skill), 0) / top.length;
  const meanRes = top.reduce((s, p) => s + (p.resistencia ?? p.skill), 0) / top.length;
  const meanAgg = top.reduce((s, p) => s + (p.agresividad ?? p.skill), 0) / top.length;
  const meanCal = top.reduce((s, p) => s + (p.calidad ?? p.skill), 0) / top.length;
  const meanForm = top.reduce((s, p) => s + p.form, 0) / top.length;

  const raw =
    0.4 * meanCal +
    0.3 * meanVel +
    0.15 * meanAgg +
    0.15 * meanRes;

  // Form scales strength 50%-100%: form 30 → 0.5, form 80 → 1.0.
  const formFactor = 0.5 + 0.5 * Math.min(1, Math.max(0, (meanForm - 30) / 50));

  return {
    strength: raw * formFactor,
    aggMean: meanAgg,
    formMean: meanForm,
  };
}

function poissonDraw(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L && k < MAX_GOALS + 1);
  return Math.min(MAX_GOALS, k - 1);
}

function pickMinute(rng: () => number, used: Set<number>, max = 90): number {
  for (let attempt = 0; attempt < 20; attempt++) {
    const m = 1 + Math.floor(rng() * max);
    if (!used.has(m)) {
      used.add(m);
      return m;
    }
  }
  return 1 + Math.floor(rng() * max);
}

export function quickSimulateMatch(args: {
  readonly homeRoster: readonly QuickPlayerInput[];
  readonly awayRoster: readonly QuickPlayerInput[];
  readonly rng: () => number;
}): QuickMatchResult {
  const home = aggregates(args.homeRoster);
  const away = aggregates(args.awayRoster);

  const homeXg = Math.max(0, BASE_XG + STRENGTH_TO_XG * (home.strength - 50) + HOME_ADVANTAGE);
  const awayXg = Math.max(0, BASE_XG + STRENGTH_TO_XG * (away.strength - 50) - HOME_ADVANTAGE * 0.4);

  const homeScore = poissonDraw(homeXg, args.rng);
  const awayScore = poissonDraw(awayXg, args.rng);

  const winner: 'home' | 'away' | 'draw' =
    homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';

  // ── Event timeline ───────────────────────────────────────────────────
  const usedMinutes = new Set<number>();
  const events: QuickMatchEvent[] = [];

  for (let i = 0; i < homeScore; i++) {
    events.push({ minute: pickMinute(args.rng, usedMinutes), type: 'goal', team: 'home' });
  }
  for (let i = 0; i < awayScore; i++) {
    events.push({ minute: pickMinute(args.rng, usedMinutes), type: 'goal', team: 'away' });
  }

  // Cards — agresividad drives count. At agg 50 → ~1 card; at agg 80 → ~3.
  // Per-team independent rolls.
  function cardsFor(team: 'home' | 'away', aggMean: number) {
    const expected = Math.max(0, (aggMean - 30) / 25); // ~0 at agg 30, ~2 at agg 80
    const count = Math.floor(expected + args.rng() * 0.8);
    for (let i = 0; i < count; i++) {
      // 10% red, rest yellow.
      const isRed = args.rng() < 0.1;
      events.push({
        minute: pickMinute(args.rng, usedMinutes),
        type: isRed ? 'red_card' : 'yellow_card',
        team,
      });
    }
  }
  cardsFor('home', home.aggMean);
  cardsFor('away', away.aggMean);

  // Injuries — both teams' average aggression contributes; ~5% baseline,
  // +1% per point of avg agg above 50.
  const combinedAgg = (home.aggMean + away.aggMean) / 2;
  const injuryProb = 0.05 + Math.max(0, (combinedAgg - 50) / 100);
  if (args.rng() < injuryProb) {
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: 'injury',
      team: args.rng() < 0.5 ? 'home' : 'away',
    });
  }
  // Second injury possible in very high-agg matches.
  if (combinedAgg > 70 && args.rng() < 0.4) {
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: 'injury',
      team: args.rng() < 0.5 ? 'home' : 'away',
    });
  }

  events.sort((a, b) => a.minute - b.minute);

  return {
    homeScore,
    awayScore,
    winner,
    homeStrength: home.strength,
    awayStrength: away.strength,
    events,
  };
}

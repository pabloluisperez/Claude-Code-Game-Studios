/**
 * Quick (batch) match simulator.
 *
 * Produces a deterministic score for one match given just rosters + a seeded
 * PRNG. Used to advance the league on "Avanzar semana" without running the
 * full live FSM (which is reserved for the player's club matches and Socket.IO
 * driven live play).
 *
 * Model:
 *   - Team strength = mean of top-11 player skill, weighted 70/30 against
 *     average form (so form swings can flip an underdog into a draw).
 *   - Expected goals = base 1.2 + 0.04 × (strength − 50) for each side,
 *     plus a 0.25 home advantage bonus.
 *   - Final goals drawn from a clamped Poisson-ish sampler using the PRNG.
 *
 * Story: League follow-up — match-day batch sim
 * Control Manifest: 2026-05-19
 */

export interface QuickPlayerInput {
  readonly skill: number;
  readonly form: number;
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
  /**
   * Synthetic minute-by-minute events (goals + occasional cards/injuries).
   * Goal counts always sum to the final homeScore/awayScore.
   * Useful for the /match/[id] replay view.
   */
  readonly events: readonly QuickMatchEvent[];
}

const TOP_N = 11;
const HOME_ADVANTAGE = 0.25;
const BASE_XG = 1.2;
const STRENGTH_TO_XG = 0.04;
const MAX_GOALS = 8;

function teamStrength(roster: readonly QuickPlayerInput[]): number {
  if (roster.length === 0) return 0;
  const top = [...roster]
    .sort((a, b) => b.skill - a.skill)
    .slice(0, TOP_N);
  const meanSkill = top.reduce((s, p) => s + p.skill, 0) / top.length;
  const meanForm = top.reduce((s, p) => s + p.form, 0) / top.length;
  return 0.7 * meanSkill + 0.3 * meanForm;
}

/**
 * Draw a goal count from a Poisson-ish distribution using a seeded PRNG.
 * We use the Knuth algorithm with a `rng()` source; clamped to [0, MAX_GOALS].
 */
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
  // Avoid same-minute collisions for readability.
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
  const homeStrength = teamStrength(args.homeRoster);
  const awayStrength = teamStrength(args.awayRoster);

  const homeXg = Math.max(
    0,
    BASE_XG + STRENGTH_TO_XG * (homeStrength - 50) + HOME_ADVANTAGE,
  );
  const awayXg = Math.max(
    0,
    BASE_XG + STRENGTH_TO_XG * (awayStrength - 50) - HOME_ADVANTAGE * 0.4,
  );

  const homeScore = poissonDraw(homeXg, args.rng);
  const awayScore = poissonDraw(awayXg, args.rng);

  const winner: 'home' | 'away' | 'draw' =
    homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';

  // Synthetic timeline: goals at random minutes, plus 0-2 cards and 0-1
  // injuries per team for flavour. Sorted by minute.
  const usedMinutes = new Set<number>();
  const events: QuickMatchEvent[] = [];
  for (let i = 0; i < homeScore; i++) {
    events.push({ minute: pickMinute(args.rng, usedMinutes), type: 'goal', team: 'home' });
  }
  for (let i = 0; i < awayScore; i++) {
    events.push({ minute: pickMinute(args.rng, usedMinutes), type: 'goal', team: 'away' });
  }
  const cardCount = Math.floor(args.rng() * 3); // 0..2
  for (let i = 0; i < cardCount; i++) {
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: args.rng() < 0.1 ? 'red_card' : 'yellow_card',
      team: args.rng() < 0.5 ? 'home' : 'away',
    });
  }
  if (args.rng() < 0.15) {
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
    homeStrength,
    awayStrength,
    events,
  };
}

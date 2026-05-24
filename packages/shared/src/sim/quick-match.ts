/**
 * Quick (batch) match simulator.
 *
 * Produces a deterministic score + minute-by-minute events for one match
 * given rosters + a seeded PRNG. Each event is attributed to a specific
 * player (scorer / booked / injured) picked weighted by the relevant
 * attribute.
 *
 * Strength model:
 *   strength = 0.4·calidad + 0.3·velocidad + 0.15·agresividad + 0.15·resistencia
 *   form scales 0.5..1.0 of strength.
 *
 * Event model:
 *   goals      — picked from FWD/MID weighted by calidad
 *   cards      — picked from all players weighted by agresividad
 *   injuries   — picked from all players weighted by (100 − resistencia)
 *
 * Story: Player-attributed events
 * Control Manifest: 2026-05-20
 */

export interface QuickPlayerInput {
  /** Stable id used to attribute events (player_id in match outcome). */
  readonly id?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly position?: 'GK' | 'DEF' | 'MID' | 'FWD';
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
  readonly playerId?: string | undefined;
  readonly playerName?: string | undefined;
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
  aggMean: number;
  formMean: number;
}

function pickTopN(roster: readonly QuickPlayerInput[]): QuickPlayerInput[] {
  return [...roster].sort((a, b) => b.skill - a.skill).slice(0, TOP_N);
}

function aggregates(roster: readonly QuickPlayerInput[]): TeamAggregates {
  if (roster.length === 0) {
    return { strength: 0, aggMean: 50, formMean: 60 };
  }
  const top = pickTopN(roster);
  const meanVel = top.reduce((s, p) => s + (p.velocidad ?? p.skill), 0) / top.length;
  const meanRes = top.reduce((s, p) => s + (p.resistencia ?? p.skill), 0) / top.length;
  const meanAgg = top.reduce((s, p) => s + (p.agresividad ?? p.skill), 0) / top.length;
  const meanCal = top.reduce((s, p) => s + (p.calidad ?? p.skill), 0) / top.length;
  const meanForm = top.reduce((s, p) => s + p.form, 0) / top.length;
  const raw = 0.4 * meanCal + 0.3 * meanVel + 0.15 * meanAgg + 0.15 * meanRes;
  const formFactor = 0.5 + 0.5 * Math.min(1, Math.max(0, (meanForm - 30) / 50));
  return { strength: raw * formFactor, aggMean: meanAgg, formMean: meanForm };
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

/**
 * Pick a player from a roster, weighted by `weightFn(player)`.
 * Returns null if no eligible players. Always deterministic given rng.
 */
function pickWeighted(
  roster: readonly QuickPlayerInput[],
  weightFn: (p: QuickPlayerInput) => number,
  rng: () => number,
): QuickPlayerInput | null {
  if (roster.length === 0) return null;
  const weights = roster.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return roster[Math.floor(rng() * roster.length)] ?? null;
  let acc = rng() * total;
  for (let i = 0; i < roster.length; i++) {
    acc -= weights[i]!;
    if (acc <= 0) return roster[i] ?? null;
  }
  return roster[roster.length - 1] ?? null;
}

function playerLabel(p: QuickPlayerInput): string {
  if (p.lastName) return p.lastName;
  if (p.firstName) return p.firstName;
  return '—';
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

  const usedMinutes = new Set<number>();
  const events: QuickMatchEvent[] = [];

  // Eligible scorers: FWD + MID (and DEF rarely, but we exclude GK).
  // Weight by calidad — premier finishers score more often.
  const homeOutfield = args.homeRoster.filter((p) => p.position !== 'GK');
  const awayOutfield = args.awayRoster.filter((p) => p.position !== 'GK');

  for (let i = 0; i < homeScore; i++) {
    const scorer = pickWeighted(
      homeOutfield,
      (p) => Math.max(1, (p.calidad ?? p.skill) - 30) * (p.position === 'FWD' ? 1.5 : p.position === 'MID' ? 1.0 : 0.4),
      args.rng,
    );
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: 'goal',
      team: 'home',
      playerId: scorer?.id,
      playerName: scorer ? playerLabel(scorer) : undefined,
    });
  }
  for (let i = 0; i < awayScore; i++) {
    const scorer = pickWeighted(
      awayOutfield,
      (p) => Math.max(1, (p.calidad ?? p.skill) - 30) * (p.position === 'FWD' ? 1.5 : p.position === 'MID' ? 1.0 : 0.4),
      args.rng,
    );
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: 'goal',
      team: 'away',
      playerId: scorer?.id,
      playerName: scorer ? playerLabel(scorer) : undefined,
    });
  }

  // Cards — weighted by agresividad.
  function cardsFor(team: 'home' | 'away', roster: readonly QuickPlayerInput[], aggMean: number) {
    const expected = Math.max(0, (aggMean - 30) / 25);
    const count = Math.floor(expected + args.rng() * 0.8);
    for (let i = 0; i < count; i++) {
      const isRed = args.rng() < 0.1;
      const booked = pickWeighted(
        roster,
        (p) => Math.max(1, (p.agresividad ?? p.skill) - 20),
        args.rng,
      );
      events.push({
        minute: pickMinute(args.rng, usedMinutes),
        type: isRed ? 'red_card' : 'yellow_card',
        team,
        playerId: booked?.id,
        playerName: booked ? playerLabel(booked) : undefined,
      });
    }
  }
  cardsFor('home', args.homeRoster, home.aggMean);
  cardsFor('away', args.awayRoster, away.aggMean);

  // Injuries — weighted by (100 − resistencia).
  const combinedAgg = (home.aggMean + away.aggMean) / 2;
  const injuryProb = 0.05 + Math.max(0, (combinedAgg - 50) / 100);
  function pickInjury(team: 'home' | 'away') {
    const roster = team === 'home' ? args.homeRoster : args.awayRoster;
    const victim = pickWeighted(
      roster,
      (p) => Math.max(1, 100 - (p.resistencia ?? p.skill)),
      args.rng,
    );
    events.push({
      minute: pickMinute(args.rng, usedMinutes),
      type: 'injury',
      team,
      playerId: victim?.id,
      playerName: victim ? playerLabel(victim) : undefined,
    });
  }
  if (args.rng() < injuryProb) pickInjury(args.rng() < 0.5 ? 'home' : 'away');
  if (combinedAgg > 70 && args.rng() < 0.4) pickInjury(args.rng() < 0.5 ? 'home' : 'away');

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

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
  /** IDs of the 11 home starters actually used in the sim (manual or auto). */
  readonly homeStarterIds: readonly string[];
  /** IDs of the 11 away starters actually used in the sim (manual or auto). */
  readonly awayStarterIds: readonly string[];
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

/**
 * Resolve the 11 starters for a side. If the manager has chosen a manual XI
 * (`manualIds`), use those players in the order specified — but only players
 * present in `roster` (filters out IDs that aren't on the squad anymore,
 * e.g. transferred out). If fewer than 11 valid IDs remain (e.g. some
 * were suspended and excluded upstream), top up from `roster` sorted by
 * skill so we always field 11 if possible.
 *
 * Falls back to pickTopN by skill when `manualIds` is null/undefined or empty.
 */
function resolveStarters(
  roster: readonly QuickPlayerInput[],
  manualIds: readonly string[] | null | undefined,
): QuickPlayerInput[] {
  if (!manualIds || manualIds.length === 0) return pickTopN(roster);
  const byId = new Map(roster.filter((p) => p.id).map((p) => [p.id!, p]));
  const out: QuickPlayerInput[] = [];
  const used = new Set<string>();
  for (const id of manualIds) {
    const p = byId.get(id);
    if (p) {
      out.push(p);
      used.add(p.id!);
      if (out.length >= TOP_N) break;
    }
  }
  if (out.length < TOP_N) {
    const filler = [...roster]
      .filter((p) => !p.id || !used.has(p.id))
      .sort((a, b) => b.skill - a.skill);
    for (const p of filler) {
      out.push(p);
      if (out.length >= TOP_N) break;
    }
  }
  return out;
}

function aggregates(
  roster: readonly QuickPlayerInput[],
  starters: readonly QuickPlayerInput[],
): TeamAggregates {
  if (roster.length === 0 || starters.length === 0) {
    return { strength: 0, aggMean: 50, formMean: 60 };
  }
  const top = starters;
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
  /** Optional manual XI. If omitted, auto-pick top 11 by skill. */
  readonly homeStarterIds?: readonly string[] | null;
  readonly awayStarterIds?: readonly string[] | null;
  /**
   * IDs of starters who are physically unable to play (injured) but the
   * manager chose to field anyway. They occupy the XI slot but contribute
   * 0 to strength and never appear in events. Effective player count drops
   * by len(unavailable) — team plays with N less players.
   * Pablo 2026-05-26.
   */
  readonly homeUnavailableStarterIds?: ReadonlySet<string>;
  readonly awayUnavailableStarterIds?: ReadonlySet<string>;
  readonly rng: () => number;
}): QuickMatchResult {
  const homeStarters = resolveStarters(args.homeRoster, args.homeStarterIds);
  const awayStarters = resolveStarters(args.awayRoster, args.awayStarterIds);
  // Filter out injured/unavailable players for strength + event picks. They
  // still occupy a slot (manager's tactical choice / forced) — the team plays
  // effectively with fewer players.
  const homeEffective = args.homeUnavailableStarterIds
    ? homeStarters.filter((p) => !p.id || !args.homeUnavailableStarterIds!.has(p.id))
    : homeStarters;
  const awayEffective = args.awayUnavailableStarterIds
    ? awayStarters.filter((p) => !p.id || !args.awayUnavailableStarterIds!.has(p.id))
    : awayStarters;
  const home = aggregates(args.homeRoster, homeEffective);
  const away = aggregates(args.awayRoster, awayEffective);
  // Scale strength by effective player count: a team with 10 plays at 10/11
  // of its potential because the empty slot has no presence on the pitch.
  const homeStrengthFactor = homeEffective.length / TOP_N;
  const awayStrengthFactor = awayEffective.length / TOP_N;
  home.strength *= homeStrengthFactor;
  away.strength *= awayStrengthFactor;

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
  // 2026-05-25: events now come from STARTERS only — bench players can't score.
  // 2026-05-26: events come from EFFECTIVE starters — injured contribute nothing.
  const homeOutfield = homeEffective.filter((p) => p.position !== 'GK');
  const awayOutfield = awayEffective.filter((p) => p.position !== 'GK');

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
  cardsFor('home', homeEffective, home.aggMean);
  cardsFor('away', awayEffective, away.aggMean);

  // Injuries — weighted by (100 − resistencia).
  const combinedAgg = (home.aggMean + away.aggMean) / 2;
  const injuryProb = 0.05 + Math.max(0, (combinedAgg - 50) / 100);
  function pickInjury(team: 'home' | 'away') {
    const roster = team === 'home' ? homeEffective : awayEffective;
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
    homeStarterIds: homeStarters.map((p) => p.id ?? '').filter(Boolean),
    awayStarterIds: awayStarters.map((p) => p.id ?? '').filter(Boolean),
  };
}

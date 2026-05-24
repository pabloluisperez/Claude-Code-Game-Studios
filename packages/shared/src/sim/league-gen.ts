/**
 * League content generators — AI club names, rosters, and double round-robin
 * fixtures for season scheduling.
 *
 * Pure functions only. Takes a seeded PRNG, returns deterministic content.
 *
 * Story: League seeding follow-up to LEAGUE-SYSTEM-001..006
 * Control Manifest: 2026-05-19
 */

import { generateRoster, type GeneratedPlayer } from './player-management/world-gen.js';
import { defaultWorldState } from './cascade-types.js';

const AI_CLUB_PREFIXES = ['CD', 'Real', 'CF', 'AD', 'UD', 'Atlético', 'Club'] as const;
const AI_CLUB_CITIES = [
  'Pinares', 'Calderón', 'Antigua', 'Bara', 'Monteverde', 'Valdés',
  'Pueblonuevo', 'Robledo', 'Lago', 'Soto', 'Cumbres', 'Encinar',
  'Riofrío', 'Aldea', 'Mirador', 'Cima',
] as const;

export interface AiClubSeed {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly baseSkill: number;
  readonly roster: readonly GeneratedPlayer[];
}

/**
 * Generate `count` deterministic AI club seeds. Names are picked without
 * repetition from a pool. Each club gets a roster of 18 players generated
 * by the same PRNG (smaller than the player's 25 to keep DB size lean).
 *
 * `baseSkill` varies in [38, 56] so the user club (50) sits mid-table.
 */
export function generateAiClubs(args: {
  readonly rng: () => number;
  readonly count: number;
  readonly currentWeek: number;
  readonly rosterSize?: number;
  readonly excludeNames?: ReadonlySet<string>;
}): AiClubSeed[] {
  const { rng, count, currentWeek, rosterSize = 18, excludeNames = new Set<string>() } =
    args;

  const seeds: AiClubSeed[] = [];
  const usedCities = new Set<string>();

  for (let i = 0; i < count; i++) {
    const prefix = AI_CLUB_PREFIXES[Math.floor(rng() * AI_CLUB_PREFIXES.length)] ?? 'CD';
    let city: string | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = AI_CLUB_CITIES[Math.floor(rng() * AI_CLUB_CITIES.length)];
      if (candidate && !usedCities.has(candidate)) {
        city = candidate;
        break;
      }
    }
    city = city ?? `Pueblo${i + 1}`;
    usedCities.add(city);

    let name = `${prefix} ${city}`;
    let dedupSuffix = 2;
    while (excludeNames.has(name)) {
      name = `${prefix} ${city} ${dedupSuffix++}`;
    }

    const baseSkill = 38 + Math.floor(rng() * 18); // [38, 56)
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const roster = generateRoster({
      ctx: {
        rng,
        currentWeek,
        hasMatchThisWeek: false,
        prevState: defaultWorldState(),
      },
      clubBaseSkill: baseSkill,
      clubSlug: slug,
      currentWeek,
      rosterSize,
    });

    seeds.push({ slug, name, city, baseSkill, roster });
  }

  return seeds;
}

export interface FixturePair {
  readonly week: number;
  readonly matchday: number;
  readonly homeClubId: string;
  readonly awayClubId: string;
}

/**
 * Generate a double round-robin schedule for `clubIds` (length must be even —
 * the caller adds a sentinel if odd).
 *
 * Uses the standard circle method. Round N+L of leg 2 swaps home/away from
 * leg 1's round N to keep the home/away balance fair.
 *
 * @param clubIds        Even-length array of club UUIDs.
 * @param startWeek      Calendar week of matchday 1.
 * @param weeksBetweenMatchdays  Typically 1.
 * @returns 2*(N-1) matchdays × (N/2) fixtures.
 */
export function generateDoubleRoundRobin(args: {
  readonly clubIds: readonly string[];
  readonly startWeek: number;
  readonly weeksBetweenMatchdays?: number;
}): FixturePair[] {
  const { clubIds, startWeek, weeksBetweenMatchdays = 1 } = args;
  if (clubIds.length < 2) return [];
  if (clubIds.length % 2 !== 0) {
    throw new Error(`generateDoubleRoundRobin requires even club count, got ${clubIds.length}`);
  }

  const n = clubIds.length;
  const halfRounds = n - 1;
  const matchesPerRound = n / 2;

  // Build leg 1 via circle method (club 0 fixed, others rotate).
  const fixtures: FixturePair[] = [];
  const rotation = clubIds.slice(1);

  for (let round = 0; round < halfRounds; round++) {
    const week = startWeek + round * weeksBetweenMatchdays;
    const matchday = round + 1;

    // The fixed club (0) vs rotation[round]
    const opponent = rotation[round]!;
    // Alternate home/away for the fixed club to balance
    const fixedAtHome = round % 2 === 0;
    fixtures.push({
      week,
      matchday,
      homeClubId: fixedAtHome ? clubIds[0]! : opponent,
      awayClubId: fixedAtHome ? opponent : clubIds[0]!,
    });

    // Pair remaining rotation positions inward
    for (let i = 1; i < matchesPerRound; i++) {
      const aIdx = (round + i) % rotation.length;
      const bIdx = (round - i + rotation.length) % rotation.length;
      const a = rotation[aIdx]!;
      const b = rotation[bIdx]!;
      // Stable home/away: even i means a is home
      fixtures.push({
        week,
        matchday,
        homeClubId: i % 2 === 0 ? a : b,
        awayClubId: i % 2 === 0 ? b : a,
      });
    }
  }

  // Leg 2: same pairings, swap home/away, offset week + matchday.
  const leg2: FixturePair[] = fixtures.map((f) => ({
    week: f.week + halfRounds * weeksBetweenMatchdays,
    matchday: f.matchday + halfRounds,
    homeClubId: f.awayClubId,
    awayClubId: f.homeClubId,
  }));

  return [...fixtures, ...leg2];
}

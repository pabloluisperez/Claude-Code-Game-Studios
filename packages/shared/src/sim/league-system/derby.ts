/**
 * Derby detection + rival club identification.
 *
 * Per `design/gdd/league-system.md` AC-LGS-19..22:
 *   - Two clubs are derby rivals when `homeClub.city === awayClub.city`.
 *   - For the player's club, the rival is the first same-city club ordered by
 *     name (lexicographic tiebreak — deterministic when multiple same-city clubs).
 *
 * Pure functions. Used by:
 *   - Story 003 (standings sort: Derby +1 tiebreaker)
 *   - event-system (`derby_match` calendar_event)
 *
 * Story: LEAGUE-SYSTEM-007
 * Control Manifest: 2026-05-19
 */

/** Minimal club shape this module needs — keeps the type loose for shared use. */
export interface DerbyClub {
  readonly id: string;
  readonly name: string;
  readonly city: string;
}

export interface DerbyFixture {
  readonly id: string;
  readonly homeClubId: string;
  readonly awayClubId: string;
}

/** Two clubs are derbies when their `city` matches exactly (case-sensitive). */
export function isDerby(
  home: Readonly<DerbyClub>,
  away: Readonly<DerbyClub>,
): boolean {
  return home.city === away.city;
}

/**
 * Find every fixture in `fixtures` that is a derby (home + away in same city).
 * Returns the fixture IDs in input order.
 */
export function findDerbiesInSeason(
  fixtures: readonly DerbyFixture[],
  clubsById: ReadonlyMap<string, DerbyClub>,
): readonly string[] {
  const out: string[] = [];
  for (const f of fixtures) {
    const home = clubsById.get(f.homeClubId);
    const away = clubsById.get(f.awayClubId);
    if (home && away && isDerby(home, away)) {
      out.push(f.id);
    }
  }
  return out;
}

/**
 * Identify the player's rival club: the first same-city club ordered by name
 * lexicographically (deterministic tiebreak when multiple same-city clubs).
 * Returns null when no other club shares the player's city.
 */
export function getRivalClub(
  playerClub: Readonly<DerbyClub>,
  allClubs: readonly Readonly<DerbyClub>[],
): DerbyClub | null {
  const sameCity = allClubs
    .filter((c) => c.id !== playerClub.id && c.city === playerClub.city)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return sameCity[0] ?? null;
}

/**
 * Build the derby-pair set for use by Story 003's standings sort.
 * Each pair is encoded as a sorted "clubA<<<clubB" string so lookup is O(1).
 */
export function buildDerbyPairSet(
  clubs: readonly Readonly<DerbyClub>[],
): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (let i = 0; i < clubs.length; i++) {
    for (let j = i + 1; j < clubs.length; j++) {
      const a = clubs[i]!;
      const b = clubs[j]!;
      if (a.city === b.city) {
        const key =
          a.id < b.id ? `${a.id}<<<${b.id}` : `${b.id}<<<${a.id}`;
        pairs.add(key);
      }
    }
  }
  return pairs;
}

/** Check whether two clubIds form a derby pair in the prebuilt set. */
export function isDerbyPair(
  clubA: string,
  clubB: string,
  derbyPairs: ReadonlySet<string>,
): boolean {
  const key = clubA < clubB ? `${clubA}<<<${clubB}` : `${clubB}<<<${clubA}`;
  return derbyPairs.has(key);
}

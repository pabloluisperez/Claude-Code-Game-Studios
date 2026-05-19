/**
 * Deterministic double round-robin fixture generation.
 *
 * Per `design/gdd/league-system.md` AC-LGS-01..06 and ADR-011:
 *   - 20 clubs × 38 matchdays × 10 matches = 380 fixtures.
 *   - Each pair plays exactly twice (home/away flip).
 *   - No self-match.
 *   - Same `clubIds` input → identical fixture list.
 *
 * Algorithm: standard circle method (Berger tables). Club at index 0 is fixed;
 * the rest rotate clockwise each matchday. First leg = matchdays 1..N-1 where
 * N=clubCount. Second leg = matchdays N..2(N-1) with home/away flipped.
 *
 * Story: LEAGUE-SYSTEM-002 (TR-LGS-002)
 * Control Manifest: 2026-05-19
 */

export interface FixtureDraft {
  readonly homeClubId: string;
  readonly awayClubId: string;
  readonly week: number;
  readonly matchday: number;
}

export interface RoundRobinArgs {
  readonly clubIds: readonly string[];
  readonly startWeek: number;
}

/**
 * Generate a deterministic double round-robin schedule.
 *
 * For N clubs (must be even): produces N-1 matchdays per leg × 2 legs =
 * 2(N-1) matchdays. Each matchday has N/2 matches. Total: N(N-1) fixtures.
 *
 * The first leg's pairings come from the circle method with club 0 fixed. The
 * second leg reverses home/away of the first leg.
 */
export function generateRoundRobin(args: Readonly<RoundRobinArgs>): readonly FixtureDraft[] {
  const ids = args.clubIds;
  if (ids.length < 2) return [];
  if (ids.length % 2 !== 0) {
    throw new Error(
      `generateRoundRobin requires an even number of clubs (got ${ids.length})`,
    );
  }
  const n = ids.length;
  const matchdaysPerLeg = n - 1;
  const totalMatchdays = 2 * matchdaysPerLeg;
  const fixtures: FixtureDraft[] = [];

  // Circle method: build a working slot array where index 0 is fixed and
  // indices 1..N-1 rotate every matchday.
  const slots: string[] = [...ids];

  // First leg
  for (let md = 0; md < matchdaysPerLeg; md++) {
    const matchday = md + 1;
    const week = args.startWeek + md;
    // Pair index i with index N-1-i for i in 0..N/2-1
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i]!;
      const b = slots[n - 1 - i]!;
      // Alternate home/away based on matchday parity to balance home counts
      const homeIsA = (md + i) % 2 === 0;
      fixtures.push({
        homeClubId: homeIsA ? a : b,
        awayClubId: homeIsA ? b : a,
        week,
        matchday,
      });
    }
    // Rotate: keep slot 0 fixed, shift slots 1..N-1 by one position (clockwise).
    rotateSlots(slots);
  }

  // Second leg: mirror of first leg with home/away flipped.
  for (let md = 0; md < matchdaysPerLeg; md++) {
    const matchday = matchdaysPerLeg + md + 1;
    const week = args.startWeek + matchdaysPerLeg + md;
    const firstLegMd = md + 1;
    const firstLegSlice = fixtures.filter((f) => f.matchday === firstLegMd);
    for (const f of firstLegSlice) {
      fixtures.push({
        homeClubId: f.awayClubId,
        awayClubId: f.homeClubId,
        week,
        matchday,
      });
    }
  }

  // Sanity: total === n * (n-1)
  if (fixtures.length !== n * (n - 1)) {
    throw new Error(
      `Round-robin produced ${fixtures.length} fixtures; expected ${n * (n - 1)}`,
    );
  }
  // Sanity: matchdays exactly 2(N-1)
  // (already implied by loop structure)

  return fixtures;
}

/** Circle-method rotation: keep slot 0 fixed, rotate rest by 1 clockwise. */
function rotateSlots(slots: string[]): void {
  if (slots.length < 3) return;
  const last = slots[slots.length - 1]!;
  for (let i = slots.length - 1; i > 1; i--) {
    slots[i] = slots[i - 1]!;
  }
  slots[1] = last;
}

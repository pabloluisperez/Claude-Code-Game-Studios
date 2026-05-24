// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can we deterministically generate a 20-club double round-robin schedule?
// Date: 2026-05-18

/**
 * Deterministic round-robin fixture generation using the circle method.
 * Pure function — given the same clubIds order, returns identical output.
 *
 * For 20 clubs → 38 matchdays × 10 fixtures = 380 fixtures.
 * Production version goes in packages/shared/src/sim/league-fixtures.ts per ADR-011.
 */
export interface RawFixture {
  homeClubId: string;
  awayClubId: string;
  week: number;
}

export function generateRoundRobin(
  clubIds: readonly string[],
  startWeek = 1,
): RawFixture[] {
  if (clubIds.length % 2 !== 0) {
    throw new Error("Round-robin requires an even number of clubs");
  }
  const n = clubIds.length;
  const halfRounds = n - 1;

  // Circle method: fix index 0, rotate indices 1..n-1.
  let rotation = Array.from({ length: n }, (_, i) => i);
  const firstHalf: RawFixture[] = [];

  for (let round = 0; round < halfRounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i]!;
      const b = rotation[n - 1 - i]!;
      // Alternate home/away by round + slot for balance
      const homeFirst = (round + i) % 2 === 0;
      firstHalf.push({
        homeClubId: clubIds[homeFirst ? a : b]!,
        awayClubId: clubIds[homeFirst ? b : a]!,
        week: startWeek + round,
      });
    }
    // Rotate: fix index 0, shift the rest by one to the right
    const last = rotation[n - 1]!;
    for (let i = n - 1; i > 1; i--) rotation[i] = rotation[i - 1]!;
    rotation[1] = last;
  }

  // Second half: mirror first half with home/away swapped
  const secondHalfStart = startWeek + halfRounds;
  const secondHalf: RawFixture[] = firstHalf.map((f) => ({
    homeClubId: f.awayClubId,
    awayClubId: f.homeClubId,
    week: secondHalfStart + (f.week - startWeek),
  }));

  return [...firstHalf, ...secondHalf];
}

/**
 * Force a club's first 4 matchdays to face a specific opponent list.
 * Used by the slice seed so Real Pueblo plays the BUILD-PLAN rivals in order.
 *
 * Strategy: walk through the generated fixtures and swap pairings as needed
 * so that on week W, the targetClubId is matched against forcedOpponents[W-1].
 * Each swap rebalances the same week to keep the matchday valid (every club
 * plays exactly once).
 */
export function forceTargetSchedule(
  fixtures: RawFixture[],
  targetClubId: string,
  forcedOpponents: readonly string[],
  forcedIsHome: readonly boolean[],
): RawFixture[] {
  const out = fixtures.map((f) => ({ ...f }));
  for (let w = 1; w <= forcedOpponents.length; w++) {
    const desiredOpp = forcedOpponents[w - 1]!;
    const desiredHome = forcedIsHome[w - 1] ?? true;

    // Find the fixture in week w that already involves the target
    const targetFixIdx = out.findIndex(
      (f) =>
        f.week === w && (f.homeClubId === targetClubId || f.awayClubId === targetClubId),
    );
    if (targetFixIdx === -1) continue;
    const targetFix = out[targetFixIdx]!;

    const currentOpp =
      targetFix.homeClubId === targetClubId ? targetFix.awayClubId : targetFix.homeClubId;
    if (currentOpp === desiredOpp) {
      // Already matched — just enforce home/away
      if (desiredHome && targetFix.homeClubId !== targetClubId) {
        const tmp = targetFix.homeClubId;
        targetFix.homeClubId = targetFix.awayClubId;
        targetFix.awayClubId = tmp;
      } else if (!desiredHome && targetFix.awayClubId !== targetClubId) {
        const tmp = targetFix.homeClubId;
        targetFix.homeClubId = targetFix.awayClubId;
        targetFix.awayClubId = tmp;
      }
      continue;
    }

    // Find the fixture in week w that involves desiredOpp
    const oppFixIdx = out.findIndex(
      (f, idx) =>
        idx !== targetFixIdx &&
        f.week === w &&
        (f.homeClubId === desiredOpp || f.awayClubId === desiredOpp),
    );
    if (oppFixIdx === -1) continue;
    const oppFix = out[oppFixIdx]!;

    // Swap: the target's current opp swaps with desiredOpp's current partner.
    const oppPartner =
      oppFix.homeClubId === desiredOpp ? oppFix.awayClubId : oppFix.homeClubId;

    // Rebuild both fixtures with desired matchups
    out[targetFixIdx] = {
      homeClubId: desiredHome ? targetClubId : desiredOpp,
      awayClubId: desiredHome ? desiredOpp : targetClubId,
      week: w,
    };
    out[oppFixIdx] = {
      homeClubId: currentOpp,
      awayClubId: oppPartner,
      week: w,
    };
  }
  return out;
}

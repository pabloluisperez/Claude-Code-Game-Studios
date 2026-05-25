/**
 * F2: free-agent wage offer acceptance. Story SCOUTING-MARKET-003.
 *
 * A free agent's wage threshold drops linearly as the weeks-unsigned counter
 * climbs, up to a maximum 25% discount at 20 weeks. Past 20 weeks the
 * desperation is capped.
 */

export const DESPERATION_DISCOUNT_PCT = 0.25;
export const DESPERATION_WEEKS_FULL_DISCOUNT = 20;

export function freeAgentAcceptance(
  wageOffer: number,
  player: { wageExpectationEurKWeek: number; weeksUnsigned: number },
): boolean {
  const desperation = Math.min(1, Math.max(0, player.weeksUnsigned) / DESPERATION_WEEKS_FULL_DISCOUNT);
  const effectiveThreshold =
    player.wageExpectationEurKWeek * (1 - DESPERATION_DISCOUNT_PCT * desperation);
  return wageOffer >= effectiveThreshold;
}

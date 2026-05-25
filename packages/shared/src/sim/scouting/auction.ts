/**
 * F3: AI club auction acceptance / counter-offer / hard-reject.
 * Story SCOUTING-MARKET-003.
 */

export const AI_NEED_PREMIUM = 0.30;
export const AI_COUNTER_OFFER_MARKUP = 0.15;
export const AI_HARD_REJECT_THRESHOLD = 0.85;

export type AuctionResult =
  | { accepted: true }
  | { accepted: false; counterOfferEurK: number }
  | { accepted: false; hardReject: true };

export function aiClubAcceptance(
  feeOfferedEurK: number,
  player: { transferValueEurK: number },
  ai: { bargainFactor: number; needFactor: number },
): AuctionResult {
  const expectedFee = player.transferValueEurK * ai.bargainFactor;
  const acceptThreshold = expectedFee * (1 + ai.needFactor * AI_NEED_PREMIUM);

  if (feeOfferedEurK >= acceptThreshold) {
    return { accepted: true };
  }

  if (feeOfferedEurK >= expectedFee * AI_HARD_REJECT_THRESHOLD) {
    const counter = expectedFee * (1 + (1 - ai.needFactor) * AI_COUNTER_OFFER_MARKUP);
    return { accepted: false, counterOfferEurK: Math.round(counter) };
  }

  return { accepted: false, hardReject: true };
}

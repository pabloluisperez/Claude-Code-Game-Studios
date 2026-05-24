/**
 * TV Rights module — public exports per ADR-019.
 *
 * Story: TVR-* (epic tv-rights)
 * Control Manifest: 2026-05-19
 */

export * from './types.js';
export * from './constants.js';
export {
  calculateTVRate,
  calculateMidseasonRate,
  getLegalDurations,
  TVRangeError,
} from './rate-calculation.js';
export {
  applyTVCorruptionDelta,
  evaluateThresholdCrossings,
  crossedTVScandalThreshold,
  roundCorruption,
  parseCorruption,
} from './corruption-delta.js';
export {
  generateTVAuctionOffers,
  buildTVAuctionPayload,
  type AuctionContext,
} from './auction.js';
export {
  buildMidseasonOffer,
  TIER_BELOW,
} from './midseason-offer.js';
export {
  applyTVPrePhase,
  applyTVPostPhase,
  type TVTickContract,
} from './tick.js';
export {
  calculateFanAttendanceEffective,
  applyFanLoyaltyRejection,
} from './fan-loyalty.js';

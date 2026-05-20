/**
 * TV Rights orchestration service — wraps sign/reject/rollover/tick operations.
 *
 * All public functions are transaction-scoped (take a tx parameter). The caller
 * is responsible for wrapping in db.transaction().
 *
 * Per ADR-019 §4-§5.
 *
 * Story: TVR-004 + TVR-006 + TVR-007 + TVR-008
 * Control Manifest: 2026-05-19
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import {
  calendarEvents,
  managerProfiles,
  tvContracts,
  worldSnapshots,
  type TVCancelReason,
} from '@smt/db';
import type { db as DBType } from '@smt/db';
import {
  applyFanLoyaltyRejection,
  applyTVPostPhase,
  applyTVPrePhase,
  buildTVAuctionPayload,
  calculateTVRate,
  FAN_LOYALTY_PER_REJECTION,
  parseCorruption,
  TVRangeError,
  XP_NACIONAL_SIGN,
  XP_REGIONAL_SIGN,
  type AuctionContext,
  type TVDivision,
  type TVDurationSeasons,
  type TVMidseasonOfferPayload,
  type TVPostPhaseResult,
  type TVPrePhaseResult,
  type TVStatus,
  type TVTickContract,
  type TVTier,
} from '@smt/shared';
import * as Repo from './repo';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

// ── Sign + Reject (POST endpoints) ───────────────────────────────────────────

export class TVContractConflictError extends Error {
  readonly currentTier: TVTier;
  readonly seasonInContract: number;
  readonly season: number;
  constructor(args: { currentTier: TVTier; seasonInContract: number; season: number }) {
    super('tv_contract_already_active');
    this.name = 'TVContractConflictError';
    this.currentTier = args.currentTier;
    this.seasonInContract = args.seasonInContract;
    this.season = args.season;
  }
}

export class TVOfferExpiredError extends Error {
  constructor(message = 'tv_offer_expired') {
    super(message);
    this.name = 'TVOfferExpiredError';
  }
}

export interface SignContractArgs {
  readonly playthroughId: string;
  readonly offerId: string;
  readonly tier: TVTier;
  readonly durationSeasons: TVDurationSeasons;
  readonly currentDivision: TVDivision;
  readonly season: number;
}

export interface SignContractResult {
  readonly contractId: string;
  readonly weeklyRateEurK: number;
  readonly xpGranted: number;
}

/**
 * Sign a TV contract — atomic:
 *   1. Guard: no active contract for this playthrough
 *   2. Guard: offer event exists and is not consumed
 *   3. Validate F-TV1 (throws TVRangeError → HTTP 400)
 *   4. Resolve event (consumed=true)
 *   5. Insert tv_contract
 *   6. Grant XP if REGIONAL/NACIONAL
 *
 * Throws:
 *   - TVRangeError       → HTTP 400 illegal_tier_duration
 *   - TVContractConflictError → HTTP 409 tv_contract_already_active
 *   - TVOfferExpiredError → HTTP 409 tv_offer_expired
 */
export async function signContract(tx: Tx, args: SignContractArgs): Promise<SignContractResult> {
  const existing = await Repo.findActiveContract(tx, args.playthroughId);
  if (existing) {
    throw new TVContractConflictError({
      currentTier: existing.tier as TVTier,
      seasonInContract: existing.seasonInContract,
      season: existing.season,
    });
  }

  const offer = await tx
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, args.offerId))
    .limit(1);
  const eventRow = offer[0];
  if (!eventRow || eventRow.consumed) {
    throw new TVOfferExpiredError();
  }
  if (eventRow.type !== 'tv_auction') {
    throw new TVOfferExpiredError('tv_offer_wrong_type');
  }

  // F-TV1 — throws TVRangeError mapped by the caller to HTTP 400.
  const rate = calculateTVRate(args.tier, args.currentDivision, args.durationSeasons);

  // Resolve the event
  await tx
    .update(calendarEvents)
    .set({ consumed: true, status: 'resolved', resolvedAt: new Date() })
    .where(eq(calendarEvents.id, args.offerId));

  // Insert contract
  const inserted = await Repo.createContract(tx, {
    playthroughId: args.playthroughId,
    season: args.season,
    tier: args.tier,
    durationSeasons: args.durationSeasons,
    seasonInContract: 1,
    weeklyRateEurK: rate.toFixed(2),
    divisionAtSigning: args.currentDivision,
    status: 'ACTIVE',
    signedAt: new Date(),
  });

  // XP grant
  let xpGranted = 0;
  if (args.tier === 'REGIONAL') xpGranted = XP_REGIONAL_SIGN;
  else if (args.tier === 'NACIONAL') xpGranted = XP_NACIONAL_SIGN;

  // Note: the actual skill update is delegated to manager-rpg's applyXpGrants in a
  // batched flow during advance(). For per-event grants we directly update the
  // financial_acumen skill XP. To keep this simple in MVP, we annotate the event
  // resolution metadata and let manager-rpg pick it up next tick. Future:
  // call manager-rpg service inline.
  if (xpGranted > 0) {
    await tx
      .update(calendarEvents)
      .set({
        metadata: sql`jsonb_set(${calendarEvents.metadata}, '{xp_granted}', ${JSON.stringify({ skillId: 'financial_acumen', xp: xpGranted })}::jsonb)`,
      })
      .where(eq(calendarEvents.id, args.offerId));
  }

  return { contractId: inserted.id, weeklyRateEurK: rate, xpGranted };
}

export interface RejectOfferArgs {
  readonly playthroughId: string;
  readonly offerId: string;
}

export interface RejectOfferResult {
  readonly fanLoyaltyBefore: number;
  readonly fanLoyaltyAfter: number;
  readonly delta: number;
}

/**
 * Reject a tv_auction or tv_midseason_offer event — atomic:
 *   1. Load event; verify not consumed
 *   2. Mark consumed=true
 *   3. Increment fan_loyalty (cap 50) on the manager profile
 *
 * Note: status of tv_contract is NOT changed by rejection (NONE→NONE for tv_auction,
 * CANCELLED→CANCELLED for tv_midseason_offer).
 */
export async function rejectOffer(tx: Tx, args: RejectOfferArgs): Promise<RejectOfferResult> {
  const offer = await tx
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, args.offerId))
    .limit(1);
  const eventRow = offer[0];
  if (!eventRow || eventRow.consumed) {
    throw new TVOfferExpiredError();
  }
  if (eventRow.type !== 'tv_auction' && eventRow.type !== 'tv_midseason_offer') {
    throw new TVOfferExpiredError('tv_offer_wrong_type');
  }

  await tx
    .update(calendarEvents)
    .set({ consumed: true, status: 'resolved', resolvedAt: new Date() })
    .where(eq(calendarEvents.id, args.offerId));

  // Load manager profile + increment fan_loyalty
  const profile = await tx
    .select({ id: managerProfiles.id, fanLoyalty: managerProfiles.fanLoyalty })
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, args.playthroughId))
    .limit(1);
  const fanLoyaltyBefore = profile[0]?.fanLoyalty ?? 0;
  const fanLoyaltyAfter = applyFanLoyaltyRejection(fanLoyaltyBefore);

  if (profile[0]) {
    await tx
      .update(managerProfiles)
      .set({ fanLoyalty: fanLoyaltyAfter })
      .where(eq(managerProfiles.id, profile[0].id));
  }

  return {
    fanLoyaltyBefore,
    fanLoyaltyAfter,
    delta: fanLoyaltyAfter - fanLoyaltyBefore,
  };
}

// ── Tick orchestration (called from advance pipeline) ────────────────────────

export interface TickFlowArgs {
  readonly playthroughId: string;
  readonly week: number;
  readonly season: number;
  readonly currentDivision: TVDivision;
  readonly prevCorruption: number;
  readonly externalCorruptionDelta: number;
}

export interface TickFlowResult {
  readonly revenue: number;
  readonly finalCorruption: number;
  readonly newStatus: TVStatus;
  readonly cancelledThisTick: boolean;
  readonly cancelReason: TVCancelReason | null;
  readonly midseasonOfferGenerated: boolean;
}

/**
 * Run the full 8-step TV Tick Order for a playthrough in a given week.
 *
 *   1-5. applyTVPrePhase (with persistence of new status + midseason offer)
 *   6-8. applyTVPostPhase (with persistence of cancellation if cascade triggers)
 *
 * Returns the per-tick revenue to add to cashflow + final corruption value for
 * the WorldState snapshot.
 */
export async function runTVTick(tx: Tx, args: TickFlowArgs): Promise<TickFlowResult> {
  const contractRow = await Repo.findActiveContract(tx, args.playthroughId);
  const tickContract: TVTickContract | null = contractRow
    ? {
        tier: contractRow.tier as TVTier,
        status: 'ACTIVE',
        weeklyRateEurK: parseCorruption(contractRow.weeklyRateEurK),
      }
    : null;

  // Pre-phase (pasos 1-5)
  const preResult: TVPrePhaseResult = applyTVPrePhase(
    tickContract,
    args.prevCorruption,
    args.week,
    args.currentDivision,
    args.season,
  );

  let midseasonOfferGenerated = false;
  let cancelReason: TVCancelReason | null = null;

  // Persist pre-phase cancellation if it happened
  if (
    contractRow &&
    preResult.newStatus === 'CANCELLED' &&
    tickContract?.status === 'ACTIVE'
  ) {
    await Repo.updateContractStatus(tx, contractRow.id, 'CANCELLED', {
      cancelledReason: 'scrutiny_tv',
      cancelledAt: new Date(),
    });
    cancelReason = 'scrutiny_tv';
    if (preResult.midseasonOffer) {
      await insertMidseasonOfferEvent(tx, args.playthroughId, args.week, preResult.midseasonOffer);
      midseasonOfferGenerated = true;
    }
  }

  // Post-phase (pasos 6-8): cascade injection + threshold re-check
  const statusAfterPrePhase: TVStatus = preResult.newStatus;
  const postResult: TVPostPhaseResult = applyTVPostPhase(
    statusAfterPrePhase,
    contractRow ? (contractRow.tier as TVTier) : null,
    preResult.corruptionAfterTV,
    args.externalCorruptionDelta,
    args.week,
    args.currentDivision,
    args.season,
  );

  if (
    contractRow &&
    postResult.cancelledByCascade &&
    statusAfterPrePhase === 'ACTIVE' // not already cancelled in pre-phase
  ) {
    await Repo.updateContractStatus(tx, contractRow.id, 'CANCELLED', {
      cancelledReason: 'scrutiny_cascade',
      cancelledAt: new Date(),
    });
    cancelReason = 'scrutiny_cascade';
    if (postResult.midseasonOffer && !midseasonOfferGenerated) {
      await insertMidseasonOfferEvent(tx, args.playthroughId, args.week, postResult.midseasonOffer);
      midseasonOfferGenerated = true;
    }
  }

  return {
    revenue: preResult.revenue,
    finalCorruption: postResult.corruptionFinal,
    newStatus: postResult.cancelledByCascade ? 'CANCELLED' : preResult.newStatus,
    cancelledThisTick: cancelReason !== null,
    cancelReason,
    midseasonOfferGenerated,
  };
}

/**
 * Insert a tv_midseason_offer STOP event into calendar_events.
 * Idempotent via the partial UNIQUE index on (playthrough_id, season, type).
 */
async function insertMidseasonOfferEvent(
  tx: Tx,
  playthroughId: string,
  week: number,
  payload: TVMidseasonOfferPayload,
): Promise<void> {
  try {
    await tx.insert(calendarEvents).values({
      playthroughId,
      week,
      season: payload.season,
      type: 'tv_midseason_offer',
      priority: 'STOP',
      status: 'pending',
      consumed: false,
      metadata: payload,
    });
  } catch (err) {
    // Unique-violation = already inserted (retry scenario) — silently skip.
    const code = (err as { code?: string }).code;
    if (code !== '23505') throw err;
  }
}

// ── Season boundary (called from advance pipeline / season manager) ──────────

export interface SeasonEndArgs {
  readonly playthroughId: string;
  readonly season: number;
}

/**
 * Process tv_contract state transitions on season_end (after the full tick for week 38).
 *
 *   - ACTIVE + season_in_contract < duration_seasons → rollover (season_in_contract += 1)
 *   - ACTIVE + season_in_contract = duration_seasons → EXPIRED
 *   - CANCELLED → no-op (reset happens on season_start)
 *   - NONE/EXPIRED → no-op
 */
export async function processSeasonEnd(tx: Tx, args: SeasonEndArgs): Promise<void> {
  const contract = await Repo.findContractForSeason(tx, args.playthroughId, args.season);
  if (!contract) return;

  if (contract.status === 'ACTIVE') {
    if (contract.seasonInContract < contract.durationSeasons) {
      await Repo.incrementSeasonInContract(tx, contract.id);
    } else {
      await Repo.updateContractStatus(tx, contract.id, 'EXPIRED');
    }
  }
  // CANCELLED stays CANCELLED until season_start reset.
}

export interface SeasonStartArgs {
  readonly playthroughId: string;
  readonly newSeason: number;
  readonly ctx: AuctionContext;
}

/**
 * Process tv_contract state transitions + tv_auction generation on season_start.
 *
 *   1. Reset EXPIRED/CANCELLED → NONE (for the previous season's contract row).
 *   2. If no ACTIVE contract carrying over (multi-year still in progress), generate tv_auction.
 *
 * Returns true if a new tv_auction was generated.
 */
export async function processSeasonStart(tx: Tx, args: SeasonStartArgs): Promise<boolean> {
  // Reset prior season's contract to NONE (if EXPIRED or CANCELLED).
  const prior = await Repo.findContractForSeason(tx, args.playthroughId, args.newSeason - 1);
  if (prior && (prior.status === 'EXPIRED' || prior.status === 'CANCELLED')) {
    await Repo.updateContractStatus(tx, prior.id, 'NONE');
  }

  // Check if a multi-year contract is still ACTIVE for the new season.
  // The rollover already moved season_in_contract forward in processSeasonEnd.
  const carryOver = await Repo.findActiveContract(tx, args.playthroughId);
  if (carryOver) {
    // Multi-year contract is still ACTIVE — do NOT generate new auction.
    return false;
  }

  // Generate new tv_auction STOP event for the new season.
  const payload = buildTVAuctionPayload(args.ctx);
  try {
    await tx.insert(calendarEvents).values({
      playthroughId: args.playthroughId,
      week: 0,
      season: args.newSeason,
      type: 'tv_auction',
      priority: 'STOP',
      status: 'pending',
      consumed: false,
      metadata: payload,
    });
  } catch (err) {
    // Unique-violation = retry scenario; skip silently.
    const code = (err as { code?: string }).code;
    if (code !== '23505') throw err;
    return false;
  }
  return true;
}

// ── Cashflow integration (TR-TVR-009) ────────────────────────────────────────

/**
 * Read the TV revenue for the current tick. Returns 0 if no ACTIVE contract.
 *
 * Called by economy module's cashflow phase. Replaces the legacy
 * `getTVRightsWeekly()` flat constant from league-system.
 *
 * Per ADR-019 §4 step [e] + TR-TVR-009.
 */
export async function readTVWeeklyRevenue(tx: Tx, playthroughId: string): Promise<number> {
  const active = await Repo.findActiveContract(tx, playthroughId);
  if (!active) return 0;
  return parseCorruption(active.weeklyRateEurK);
}

// Re-export unused vars warning suppression
void worldSnapshots; void and; void desc;
void FAN_LOYALTY_PER_REJECTION;

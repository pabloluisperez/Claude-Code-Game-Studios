/**
 * TV Rights weekly tick — orchestrates the 8-step Tick Order inside the
 * dashboard's advance() flow.
 *
 * Per ADR-019 §4: TV pre-phase runs BEFORE cascade injection (so cascade
 * sees the F-TV3-adjusted corruption), TV post-phase runs AFTER (re-evaluates
 * threshold against cascade's external delta).
 *
 * Returns:
 *   - revenue: TV weekly revenue to add to cashflow (0 if NONE/CANCELLED)
 *   - corruptionAfterTV: corruption after F-TV3 delta (to inject into cascade prevState)
 *   - finalCorruption: corruption after cascade + post-phase
 *   - newStatus: contract FSM transition
 *   - cancelledThisTick / cancelReason / midseasonOfferGenerated
 *   - fanLoyalty: current manager.fan_loyalty (for F-TV4 in matchday revenue)
 *
 * Story: TVR-006 backend integration
 * Control Manifest: 2026-05-19
 */

import {
  applyTVPrePhase,
  applyTVPostPhase,
  buildMidseasonOffer,
  parseCorruption,
  type TVDivision,
  type TVMidseasonOfferPayload,
  type TVStatus,
  type TVTickContract,
  type TVTier,
} from '@smt/shared';
import {
  calendarEvents,
  db,
  managerProfiles,
  tvContracts,
  type Db,
  and,
  desc,
  eq,
} from '@smt/db';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface TVTickInput {
  readonly playthroughId: string;
  readonly week: number;
  readonly season: number;
  readonly currentDivision: TVDivision;
  readonly prevCorruption: number;
}

export interface TVTickPreResult {
  readonly contractRow: {
    id: string;
    tier: TVTier;
    status: TVStatus;
    weeklyRateEurK: number;
  } | null;
  readonly revenue: number;
  readonly corruptionAfterTV: number;
  /** Status after pre-phase (paso 1-5). CANCELLED if F-TV3 threshold crossed. */
  readonly statusAfterPrePhase: TVStatus;
  readonly midseasonOfferFromPrePhase: TVMidseasonOfferPayload | null;
  readonly fanLoyalty: number;
}

export interface TVTickPostResult {
  readonly finalCorruption: number;
  readonly cancelledByCascade: boolean;
  readonly midseasonOfferFromPostPhase: TVMidseasonOfferPayload | null;
}

/**
 * Pasos 1-5 of the Tick Order. Pure-ish (no writes yet) — caller persists in
 * `persistTVTickEffects` after cascade output is known.
 */
export async function runTVPrePhase(input: TVTickInput): Promise<TVTickPreResult> {
  // Load active contract (db handle — no tx needed for read).
  const [contractRow] = await db
    .select({
      id: tvContracts.id,
      tier: tvContracts.tier,
      status: tvContracts.status,
      weeklyRateEurK: tvContracts.weeklyRateEurK,
    })
    .from(tvContracts)
    .where(
      and(eq(tvContracts.playthroughId, input.playthroughId), eq(tvContracts.status, 'ACTIVE')),
    )
    .limit(1);

  const tickContract: TVTickContract | null = contractRow
    ? {
        tier: contractRow.tier as TVTier,
        status: 'ACTIVE',
        weeklyRateEurK: parseCorruption(contractRow.weeklyRateEurK),
      }
    : null;

  const preResult = applyTVPrePhase(
    tickContract,
    input.prevCorruption,
    input.week,
    input.currentDivision,
    input.season,
  );

  // Load manager fan_loyalty (for F-TV4 boost in matchday revenue).
  const [profile] = await db
    .select({ fanLoyalty: managerProfiles.fanLoyalty })
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, input.playthroughId))
    .limit(1);

  return {
    contractRow: contractRow
      ? {
          id: contractRow.id,
          tier: contractRow.tier as TVTier,
          status: contractRow.status as TVStatus,
          weeklyRateEurK: parseCorruption(contractRow.weeklyRateEurK),
        }
      : null,
    revenue: preResult.revenue,
    corruptionAfterTV: preResult.corruptionAfterTV,
    statusAfterPrePhase: preResult.newStatus,
    midseasonOfferFromPrePhase: preResult.midseasonOffer ?? null,
    fanLoyalty: profile?.fanLoyalty ?? 0,
  };
}

/**
 * Pasos 6-8 of the Tick Order. Called after cascade output is computed.
 * Caller passes the cascade's effect on corruption_exposure as `externalDelta`
 * (i.e., cascade.nextState.corruption_exposure - preResult.corruptionAfterTV).
 */
export function runTVPostPhase(
  input: TVTickInput,
  pre: TVTickPreResult,
  externalDelta: number,
): TVTickPostResult {
  const postResult = applyTVPostPhase(
    pre.statusAfterPrePhase,
    pre.contractRow ? pre.contractRow.tier : null,
    pre.corruptionAfterTV,
    externalDelta,
    input.week,
    input.currentDivision,
    input.season,
  );

  return {
    finalCorruption: postResult.corruptionFinal,
    cancelledByCascade: postResult.cancelledByCascade,
    midseasonOfferFromPostPhase: postResult.midseasonOffer ?? null,
  };
}

/**
 * Persist all TV tick effects within the caller's open transaction:
 *   - Update contract status (CANCELLED if either phase crossed threshold).
 *   - Insert tv_midseason_offer STOP event if generated (idempotent via DB constraint).
 *
 * Returns the canonical final status for use in subsequent flows.
 */
export async function persistTVTickEffects(
  tx: Tx,
  input: TVTickInput,
  pre: TVTickPreResult,
  post: TVTickPostResult,
): Promise<{ finalStatus: TVStatus; midseasonInserted: boolean }> {
  if (!pre.contractRow) {
    return { finalStatus: 'NONE', midseasonInserted: false };
  }

  let finalStatus: TVStatus = pre.contractRow.status;
  let cancelReason: 'scrutiny_tv' | 'scrutiny_cascade' | null = null;

  if (pre.statusAfterPrePhase === 'CANCELLED' && pre.contractRow.status === 'ACTIVE') {
    cancelReason = 'scrutiny_tv';
    finalStatus = 'CANCELLED';
  } else if (post.cancelledByCascade && pre.statusAfterPrePhase === 'ACTIVE') {
    cancelReason = 'scrutiny_cascade';
    finalStatus = 'CANCELLED';
  }

  if (cancelReason !== null) {
    await tx
      .update(tvContracts)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: cancelReason,
      })
      .where(eq(tvContracts.id, pre.contractRow.id));
  }

  // Insert midseason offer event (idempotent via partial UNIQUE index).
  const offer = pre.midseasonOfferFromPrePhase ?? post.midseasonOfferFromPostPhase;
  let midseasonInserted = false;
  if (offer) {
    try {
      await tx.insert(calendarEvents).values({
        playthroughId: input.playthroughId,
        week: input.week,
        season: offer.season,
        type: 'tv_midseason_offer',
        priority: 'STOP',
        status: 'pending',
        consumed: false,
        metadata: offer,
      });
      midseasonInserted = true;
    } catch (err) {
      // unique_violation = already inserted on a previous retry; ignore.
      const code = (err as { code?: string }).code;
      if (code !== '23505') throw err;
    }
  }

  void buildMidseasonOffer; // re-export proof for downstream callers; silence unused warning
  return { finalStatus, midseasonInserted };
}

/**
 * Season-end rollover: for the playthrough's contract for the just-finished
 * season, advance season_in_contract if multi-year is mid-flight; otherwise
 * mark EXPIRED.
 *
 * Call this from the dashboard advance flow right after the final week of the
 * season has been persisted.
 */
export async function rolloverTVSeasonEnd(
  tx: Tx,
  playthroughId: string,
  endingSeason: number,
): Promise<{ rolledOver: boolean; expired: boolean }> {
  const [contract] = await tx
    .select()
    .from(tvContracts)
    .where(
      and(
        eq(tvContracts.playthroughId, playthroughId),
        eq(tvContracts.season, endingSeason),
      ),
    )
    .limit(1);
  if (!contract) return { rolledOver: false, expired: false };

  if (contract.status !== 'ACTIVE') {
    return { rolledOver: false, expired: false };
  }

  if (contract.seasonInContract < contract.durationSeasons) {
    await tx
      .update(tvContracts)
      .set({ seasonInContract: contract.seasonInContract + 1 })
      .where(eq(tvContracts.id, contract.id));
    return { rolledOver: true, expired: false };
  }

  await tx
    .update(tvContracts)
    .set({ status: 'EXPIRED' })
    .where(eq(tvContracts.id, contract.id));
  return { rolledOver: false, expired: true };
}

/**
 * Season-start reset + tv_auction generation. Idempotent via DB partial UNIQUE.
 *
 * Returns:
 *   - resetPriorContract: whether a prior EXPIRED/CANCELLED row was set to NONE.
 *   - auctionEventInserted: whether a new tv_auction STOP event was created.
 */
export async function rolloverTVSeasonStart(
  tx: Tx,
  playthroughId: string,
  startingSeason: number,
  auctionPayload: unknown,
): Promise<{ resetPriorContract: boolean; auctionEventInserted: boolean }> {
  // Reset prior season's contract to NONE if it ended EXPIRED or CANCELLED.
  const [prior] = await tx
    .select()
    .from(tvContracts)
    .where(eq(tvContracts.playthroughId, playthroughId))
    .orderBy(desc(tvContracts.createdAt))
    .limit(1);

  let resetPriorContract = false;
  if (prior && (prior.status === 'EXPIRED' || prior.status === 'CANCELLED')) {
    await tx.update(tvContracts).set({ status: 'NONE' }).where(eq(tvContracts.id, prior.id));
    resetPriorContract = true;
  }

  // Don't generate auction if a multi-year contract is still ACTIVE.
  const [active] = await tx
    .select()
    .from(tvContracts)
    .where(
      and(eq(tvContracts.playthroughId, playthroughId), eq(tvContracts.status, 'ACTIVE')),
    )
    .limit(1);
  if (active) return { resetPriorContract, auctionEventInserted: false };

  // Insert tv_auction (idempotent via partial UNIQUE).
  try {
    await tx.insert(calendarEvents).values({
      playthroughId,
      week: 0,
      season: startingSeason,
      type: 'tv_auction',
      priority: 'STOP',
      status: 'pending',
      consumed: false,
      metadata: auctionPayload as Record<string, unknown>,
    });
    return { resetPriorContract, auctionEventInserted: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== '23505') throw err;
    return { resetPriorContract, auctionEventInserted: false };
  }
}

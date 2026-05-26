/**
 * Scouting & Transfer Market service — v1.1 minimal slice.
 *
 * Story SCOUTING-MARKET-004 (combined with partial 005/007 — only scout
 * actions land in v1.1). Offer flow + AI club rotation worker (stories
 * 24-5, 24-6) are explicitly deferred to v1.2 — they need free-agent
 * support in the player schema + a BullMQ-orchestrated AI rotation loop,
 * both of which are non-trivial cross-module work.
 *
 * What ships in v1.1:
 *   - getMarket(clubId): visible pool with per-player visibility tier
 *   - scoutPlayer(clubId, playerId, actionType): debit cost + record action
 *
 * Cost is charged against worldSnapshots.financial_balance (same pattern
 * as stadium-upgrades, integrated by the advance pipeline). For now the
 * scout action completes instantly (no countdown) since the worker
 * infrastructure for delayed completion ships in 24-6 / v1.2.
 */

import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import {
  db as dbClient,
  clubs,
  players,
  scoutingActions,
  staff,
  worldSnapshots,
  playthroughs,
  transferOffers,
} from '@smt/db';
import {
  scoutActionCost,
  stripFieldsForTier,
  visibilityTierOf,
  freeAgentAcceptance,
  aiClubAcceptance,
  type AuctionResult,
  type ManagerScoutState,
  type PoolPlayer,
  type ScoutAction,
  type VisibilityTier,
} from '@smt/shared';

type Tx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0] | typeof dbClient;

export type ScoutError =
  | 'PLAYER_NOT_FOUND'
  | 'ALREADY_SCOUTED'
  | 'INSUFFICIENT_BALANCE'
  | 'OWN_PLAYER_BLOCKED';

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
const ok = <T>(v: T): Result<T, never> => ({ ok: true, value: v });
const err = <E>(e: E): Result<never, E> => ({ ok: false, error: e });

/** Read latest worldSnapshot financial_balance for a club. */
async function readBalance(tx: Tx, clubId: string): Promise<number> {
  const result = await tx.execute(
    sql`SELECT (ws.world_state->>'financial_balance')::numeric AS balance
        FROM world_snapshots ws
        JOIN playthroughs p ON p.id = ws.playthrough_id
        WHERE p.club_id = ${clubId}
        ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
        LIMIT 1`,
  );
  const rows =
    (result as unknown as { rows?: Array<{ balance: string | null }> }).rows
    ?? (result as unknown as Array<{ balance: string | null }>);
  const fromSnapshot = rows[0]?.balance != null ? Number(rows[0].balance) : null;
  if (fromSnapshot !== null && Number.isFinite(fromSnapshot)) return fromSnapshot;
  // Fallback to clubs.budget for fresh clubs.
  const [club] = await tx
    .select({ budget: clubs.budget })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return club?.budget ?? 0;
}

async function debitBalance(tx: Tx, clubId: string, amountEurK: number): Promise<void> {
  await tx.execute(
    sql`UPDATE world_snapshots
        SET world_state = jsonb_set(
          world_state,
          '{financial_balance}',
          to_jsonb(COALESCE((world_state->>'financial_balance')::numeric, 0) - ${amountEurK})
        )
        WHERE id = (
          SELECT ws.id FROM world_snapshots ws
          JOIN playthroughs p ON p.id = ws.playthrough_id
          WHERE p.club_id = ${clubId}
          ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
          LIMIT 1
        )`,
  );
}

/** Get the player's current Scout Director quality tier (0..3, 0 = none). */
async function getScoutDirectorTier(tx: Tx, clubId: string): Promise<0 | 1 | 2 | 3> {
  // Find the latest playthrough for this club, then its active Scout Director.
  const [pt] = await tx
    .select({ id: playthroughs.id })
    .from(playthroughs)
    .where(eq(playthroughs.clubId, clubId))
    .orderBy(desc(playthroughs.createdAt))
    .limit(1);
  if (!pt) return 0;

  const [director] = await tx
    .select({ tier: staff.qualityTier })
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, pt.id),
        eq(staff.role, 'scouting_director'),
        eq(staff.status, 'active'),
      ),
    )
    .limit(1);
  if (!director) return 0;
  const t = director.tier;
  if (t === 1 || t === 2 || t === 3) return t;
  return 0;
}

/**
 * Build a ManagerScoutState reader over the scouting_actions table for
 * a given (clubId, windowId).
 */
async function buildScoutState(
  tx: Tx,
  clubId: string,
  windowId: string,
  scoutDirectorTier: 0 | 1 | 2 | 3,
): Promise<ManagerScoutState> {
  const rows = await tx
    .select({
      playerId: scoutingActions.playerId,
      actionType: scoutingActions.actionType,
      completesAtWeek: scoutingActions.completesAtWeek,
      status: scoutingActions.status,
    })
    .from(scoutingActions)
    .where(
      and(
        eq(scoutingActions.clubId, clubId),
        eq(scoutingActions.windowId, windowId),
      ),
    );

  const scoutedAt = new Map<string, number>();
  const deepAt = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== 'completed') continue;
    if (r.actionType === 'scout' && !scoutedAt.has(r.playerId)) {
      scoutedAt.set(r.playerId, r.completesAtWeek);
    }
    if (r.actionType === 'deep_scout') {
      deepAt.set(r.playerId, r.completesAtWeek);
    }
  }

  return {
    hasScouted: (id) => scoutedAt.has(id) || deepAt.has(id),
    hasDeepScouted: (id) => deepAt.has(id),
    scoutCompletedAtWeek: (id) => scoutedAt.get(id) ?? null,
    deepScoutCompletedAtWeek: (id) => deepAt.get(id) ?? null,
    scoutDirectorTier,
  };
}

export type MarketPoolEntry = PoolPlayer & { clubName: string | null };

/**
 * Return the visible market pool for a manager. v1.1 minimal slice: all
 * players that belong to OTHER clubs (no free agents in v1.1 schema).
 * Server-authoritative field stripping per tier — frontend cannot cheat.
 */
export async function getMarket(
  clubId: string,
  options: { windowId?: string; currentWeek?: number; limit?: number } = {},
): Promise<MarketPoolEntry[]> {
  const windowId = options.windowId ?? '00000000-0000-0000-0000-000000000001';
  const currentWeek = options.currentWeek ?? 1;
  const limit = options.limit ?? 50;

  return dbClient.transaction(async (tx) => {
    const directorTier = await getScoutDirectorTier(tx, clubId);
    const state = await buildScoutState(tx, clubId, windowId, directorTier);

    // Pool: other clubs' players + free agents (clubId IS NULL or marked free_agent).
    // Excludes user's own club. Pablo 2026-05-26: also surface expiring contracts
    // (≤8 weeks remaining) so the manager can pre-sign for next season.
    const rows = await tx
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        skill: players.skill,
        position: players.position,
        clubId: players.clubId,
        clubName: clubs.name,
        contractEndWeek: players.contractEndWeek,
        contractStatus: players.contractStatus,
        availability: players.availability,
      })
      .from(players)
      .leftJoin(clubs, eq(clubs.id, players.clubId))
      .where(
        or(
          ne(players.clubId, clubId),
          eq(players.contractStatus, 'free_agent'),
        ),
      )
      .limit(limit);

    const result: MarketPoolEntry[] = [];
    for (const p of rows) {
      // Skip user's own players that slipped through via the OR clause.
      if (p.clubId === clubId) continue;
      const tier: VisibilityTier = visibilityTierOf(
        { id: p.id, inPoolThisWindow: true },
        state,
        currentWeek,
      );
      // Compute real contract status: free_agent > expiring > in_contract.
      const weeksUntilExpiry = p.contractEndWeek - currentWeek;
      let contractStatusOut: 'in_contract' | 'expiring' | 'free_agent';
      if (p.contractStatus === 'free_agent' || !p.clubId) {
        contractStatusOut = 'free_agent';
      } else if (weeksUntilExpiry <= 8) {
        contractStatusOut = 'expiring';
      } else {
        contractStatusOut = 'in_contract';
      }
      const full: PoolPlayer = {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        age: 0, // v1.1: age computation deferred; players schema has birthWeek not age
        position: p.position,
        currentClub: contractStatusOut === 'free_agent' ? null : p.clubName,
        contractStatus: contractStatusOut,
        visibilityTier: tier,
        // T1 reveals
        ovrBand: `${Math.floor(p.skill / 10) * 10}-${Math.floor(p.skill / 10) * 10 + 9}`,
        transferValueBand: '—',
        // T2 reveals
        ovrEstimate: p.skill + Math.floor((p.skill % 7) - 3), // light noise; deterministic
        transferValueEstimate: p.skill * 10,
        moraleBand: 'normal',
        // T3 reveals
        ovrExact: p.skill,
        transferValueExact: p.skill * 10,
        moraleExact: 60,
        fitnessExact: 90,
        recentForm: 6.5,
      };
      const stripped = stripFieldsForTier(full, tier);
      result.push({ ...stripped, clubName: p.clubName });
    }
    return result;
  });
}

/**
 * Scout (or deep-scout) a player. v1.1: completes immediately (no delay).
 * Per ADR-031 the worker-based countdown ships in story 24-6 / v1.2.
 */
export async function scoutPlayer(params: {
  clubId: string;
  playerId: string;
  actionType: ScoutAction;
  windowId?: string;
  currentWeek?: number;
}): Promise<Result<{ costPaid: number; actionId: string }, ScoutError>> {
  const windowId = params.windowId ?? '00000000-0000-0000-0000-000000000001';
  const currentWeek = params.currentWeek ?? 1;

  return dbClient.transaction(async (tx) => {
    // 1. Player exists + belongs to a different club
    const [player] = await tx
      .select({ id: players.id, clubId: players.clubId })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);
    if (!player) return err('PLAYER_NOT_FOUND' as const);
    if (player.clubId === params.clubId) return err('OWN_PLAYER_BLOCKED' as const);

    // 2. Already scouted at this level?
    const existing = await tx
      .select({ id: scoutingActions.id })
      .from(scoutingActions)
      .where(
        and(
          eq(scoutingActions.clubId, params.clubId),
          eq(scoutingActions.playerId, params.playerId),
          eq(scoutingActions.windowId, windowId),
          eq(scoutingActions.actionType, params.actionType),
          eq(scoutingActions.status, 'completed'),
        ),
      )
      .limit(1);
    if (existing[0]) return err('ALREADY_SCOUTED' as const);

    // 3. Compute cost with Scout Director T3 discount + cityTier multiplier
    const directorTier = await getScoutDirectorTier(tx, params.clubId);
    const [clubRow] = await tx
      .select({ cityTier: clubs.cityTier })
      .from(clubs)
      .where(eq(clubs.id, params.clubId))
      .limit(1);
    const cityTier = (clubRow?.cityTier ?? 1) as 1 | 2 | 3 | 4;
    const cost = scoutActionCost(params.actionType, {
      scoutDirectorT3: directorTier === 3,
      cityTier,
    });

    // 4. Balance check
    const balance = await readBalance(tx, params.clubId);
    if (balance < cost) return err('INSUFFICIENT_BALANCE' as const);

    // 5. Debit + record action (instant completion in v1.1)
    await debitBalance(tx, params.clubId, cost);
    const [inserted] = await tx
      .insert(scoutingActions)
      .values({
        clubId: params.clubId,
        playerId: params.playerId,
        windowId,
        actionType: params.actionType,
        costPaidEurK: cost,
        completesAtWeek: currentWeek, // instant for v1.1
        completedAt: new Date(),
        status: 'completed',
      })
      .returning({ id: scoutingActions.id });

    return ok({ costPaid: cost, actionId: inserted!.id });
  });
}

/* ------------------------------------------------------------------ */
/* Sell-own-players (v1.2 Sprint 26-5)                                */
/* ------------------------------------------------------------------ */

export type ListForSaleError = 'PLAYER_NOT_FOUND' | 'NOT_OWNED_BY_CLUB';

export async function toggleTransferListed(params: {
  clubId: string;
  playerId: string;
  listed: boolean;
}): Promise<Result<{ transferListed: boolean }, ListForSaleError>> {
  return dbClient.transaction(async (tx) => {
    const [player] = await tx
      .select({ id: players.id, clubId: players.clubId })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);
    if (!player) return err('PLAYER_NOT_FOUND' as const);
    if (player.clubId !== params.clubId) return err('NOT_OWNED_BY_CLUB' as const);

    await tx
      .update(players)
      .set({ transferListed: params.listed })
      .where(eq(players.id, params.playerId));
    return ok({ transferListed: params.listed });
  });
}

/* ------------------------------------------------------------------ */
/* Accept / reject an incoming offer (v1.2 Sprint 26-5)               */
/* ------------------------------------------------------------------ */

export type RespondError =
  | 'OFFER_NOT_FOUND'
  | 'NOT_SELLER'
  | 'OFFER_ALREADY_RESOLVED';

export async function respondToIncomingOffer(params: {
  clubId: string;
  offerId: string;
  action: 'accept' | 'reject';
}): Promise<Result<{ status: 'accepted' | 'rejected'; feeEurK?: number }, RespondError>> {
  return dbClient.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(transferOffers)
      .where(eq(transferOffers.id, params.offerId))
      .limit(1);
    if (!offer) return err('OFFER_NOT_FOUND' as const);
    if (offer.sellerClubId !== params.clubId) return err('NOT_SELLER' as const);
    if (offer.status !== 'pending') return err('OFFER_ALREADY_RESOLVED' as const);

    if (params.action === 'reject') {
      await tx
        .update(transferOffers)
        .set({ status: 'rejected', resolvedAt: new Date() })
        .where(eq(transferOffers.id, params.offerId));
      return ok({ status: 'rejected' as const });
    }

    // Accept: credit fee, transfer player ownership (to the buyer club),
    // unmark transfer_listed.
    await tx
      .update(transferOffers)
      .set({ status: 'accepted', resolvedAt: new Date() })
      .where(eq(transferOffers.id, params.offerId));
    await tx
      .update(players)
      .set({
        clubId: offer.buyerClubId,
        transferListed: false,
      })
      .where(eq(players.id, offer.playerId));
    // Credit the sale fee to the seller's latest worldSnapshot.
    await tx.execute(
      sql`UPDATE world_snapshots
          SET world_state = jsonb_set(
            world_state,
            '{financial_balance}',
            to_jsonb(COALESCE((world_state->>'financial_balance')::numeric, 0) + ${offer.feeEurK})
          )
          WHERE id = (
            SELECT ws.id FROM world_snapshots ws
            JOIN playthroughs p ON p.id = ws.playthrough_id
            WHERE p.club_id = ${params.clubId}
            ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
            LIMIT 1
          )`,
    );
    return ok({ status: 'accepted' as const, feeEurK: offer.feeEurK });
  });
}

/* ------------------------------------------------------------------ */
/* Offer service (v1.2 Sprint 25-4)                                   */
/* ------------------------------------------------------------------ */

export type OfferError =
  | 'PLAYER_NOT_FOUND'
  | 'OWN_PLAYER_BLOCKED'
  | 'NO_SCOUT'
  | 'ALREADY_PENDING_OFFER'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_OFFER';

export type OfferOutcome =
  | { kind: 'accepted'; offerId: string; feeEurK: number; finalWageEurKWeek: number }
  | { kind: 'counter'; offerId: string; counterOfferEurK: number }
  | { kind: 'rejected'; offerId: string; reason: 'hard_reject' | 'wage_low' };

export type MakeOfferParams = {
  clubId: string;
  playerId: string;
  feeEurK: number;
  wageOfferEurKWeek: number;
  contractWeeks: number;
  windowId?: string;
  /**
   * Pablo 2026-05-26: lets makeOffer treat 'expiring' players (≤8 weeks
   * to contractEndWeek) as free-agent equivalents — no fee required.
   * If omitted, only the static contractStatus column is used.
   */
  currentWeek?: number;
};

export async function makeOffer(
  params: MakeOfferParams,
): Promise<Result<OfferOutcome, OfferError>> {
  const windowId = params.windowId ?? '00000000-0000-0000-0000-000000000001';
  if (params.feeEurK < 0 || params.wageOfferEurKWeek < 0 || params.contractWeeks < 1) {
    return err('INVALID_OFFER' as const);
  }

  return dbClient.transaction(async (tx) => {
    const [player] = await tx
      .select({
        id: players.id,
        clubId: players.clubId,
        skill: players.skill,
        contractStatus: players.contractStatus,
        contractEndWeek: players.contractEndWeek,
        wageExpectationEurKWeek: players.wageExpectationEurKWeek,
        weeksUnsigned: players.weeksUnsigned,
        transferListed: players.transferListed,
      })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);
    if (!player) return err('PLAYER_NOT_FOUND' as const);
    if (player.clubId === params.clubId) return err('OWN_PLAYER_BLOCKED' as const);

    // Pablo 2026-05-26: scout gating.
    // Without a scouting_director, the manager can only sign:
    //   - Free agents (contractStatus = 'free_agent')
    //   - Expiring contracts (≤8 weeks left — Bosman)
    //   - Players from their own club (already blocked above)
    // Players from other clubs with active contracts require a scout to
    // mediate the deal. Scout tier also affects acceptance threshold:
    //   tier 1 → 1.00 × club bargainFactor
    //   tier 2 → 0.92 × (8% discount)
    //   tier 3 → 0.85 × (15% discount)
    const isExpiringPre =
      params.currentWeek !== undefined &&
      player.contractEndWeek - params.currentWeek <= 8;
    const isOpenMarket = player.contractStatus === 'free_agent' || isExpiringPre;
    const scoutTier = await getScoutDirectorTier(tx, params.clubId);
    if (!isOpenMarket && scoutTier === 0) {
      return err('NO_SCOUT' as const);
    }
    const scoutBargainMul = scoutTier === 3 ? 0.85 : scoutTier === 2 ? 0.92 : 1.0;

    const existing = await tx
      .select({ id: transferOffers.id })
      .from(transferOffers)
      .where(
        and(
          eq(transferOffers.buyerClubId, params.clubId),
          eq(transferOffers.playerId, params.playerId),
          eq(transferOffers.windowId, windowId),
          eq(transferOffers.status, 'pending'),
        ),
      )
      .limit(1);
    if (existing[0]) return err('ALREADY_PENDING_OFFER' as const);

    // Balance check: in real football, fee is paid upfront but wages are
    // weekly operational expense. Requiring the full contract's wages
    // upfront would lock out smaller clubs entirely. Pablo bug 2026-05-25:
    // "con la pasta y el nivel más bajo no se puede hacer casi nada".
    // New rule: need at least fee + 4 weeks of wages (1-month buffer).
    const upfrontCommitment = params.feeEurK + params.wageOfferEurKWeek * 4;
    const balance = await readBalance(tx, params.clubId);
    if (balance < upfrontCommitment) return err('INSUFFICIENT_BALANCE' as const);

    const transferValueEurK = player.skill * 10;
    let dbStatus: 'accepted' | 'rejected' | 'countered';
    let counterFee: number | null = null;
    type OutcomeShape =
      | { kind: 'accepted'; feeEurK: number; finalWageEurKWeek: number }
      | { kind: 'counter'; counterOfferEurK: number }
      | { kind: 'rejected'; reason: 'hard_reject' | 'wage_low' };
    let outcomeShape: OutcomeShape;

    // Pablo 2026-05-26: 'expiring' (≤8 weeks left) acts like free agent — no fee,
    // wage acceptance only. Lets manager pre-sign for next season at no cost.
    const isExpiring =
      params.currentWeek !== undefined &&
      player.contractEndWeek - params.currentWeek <= 8;
    if (player.contractStatus === 'free_agent' || isExpiring) {
      const accepted = freeAgentAcceptance(params.wageOfferEurKWeek, {
        wageExpectationEurKWeek: player.wageExpectationEurKWeek,
        weeksUnsigned: player.weeksUnsigned,
      });
      if (accepted) {
        outcomeShape = { kind: 'accepted', feeEurK: 0, finalWageEurKWeek: params.wageOfferEurKWeek };
        dbStatus = 'accepted';
      } else {
        outcomeShape = { kind: 'rejected', reason: 'wage_low' };
        dbStatus = 'rejected';
      }
    } else {
      // Pablo 2026-05-26: ofertas a no-transferibles = club pide premium.
      // transferListed=true → bargainFactor 1.0 (price as marked)
      // transferListed=false → 1.4 (40% premium because they don't want to sell)
      // Plus scout-tier discount: better scout = better deals.
      const baseBargainFactor = player.transferListed ? 1.0 : 1.4;
      const bargainFactor = baseBargainFactor * scoutBargainMul;
      const auction: AuctionResult = aiClubAcceptance(
        params.feeEurK,
        { transferValueEurK },
        { bargainFactor, needFactor: 0.5 },
      );
      if (auction.accepted === true) {
        outcomeShape = {
          kind: 'accepted',
          feeEurK: params.feeEurK,
          finalWageEurKWeek: params.wageOfferEurKWeek,
        };
        dbStatus = 'accepted';
      } else if ('counterOfferEurK' in auction) {
        counterFee = auction.counterOfferEurK;
        outcomeShape = { kind: 'counter', counterOfferEurK: counterFee };
        dbStatus = 'countered';
      } else {
        outcomeShape = { kind: 'rejected', reason: 'hard_reject' };
        dbStatus = 'rejected';
      }
    }

    const [inserted] = await tx
      .insert(transferOffers)
      .values({
        buyerClubId: params.clubId,
        sellerClubId: player.clubId,
        playerId: player.id,
        windowId,
        feeEurK: params.feeEurK,
        wageOfferEurKWeek: params.wageOfferEurKWeek,
        contractWeeks: params.contractWeeks,
        status: dbStatus,
        counterOfferEurK: counterFee,
        bidNumber: 1,
        resolvedAt: new Date(),
      })
      .returning({ id: transferOffers.id });

    return ok({ ...outcomeShape, offerId: inserted!.id } as OfferOutcome);
  });
}

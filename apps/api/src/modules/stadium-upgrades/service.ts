/**
 * Stadium upgrades domain service. Story STADIUM-UPGRADES-005.
 *
 * Implements the FSM described in `design/gdd/stadium-upgrades.md §3.2`:
 *   queued | in_progress | complete | cancelled
 *
 * All state-mutating operations are wrapped in DB transactions. Cross-module
 * effects (cascade-engine delta, tier-up evaluation, Socket.IO emit, staff
 * messages) are injected as optional dependencies so this module can be unit
 * tested in isolation and integrated incrementally in stories 22-6 / 22-7.
 *
 * Per ADR-029.
 */

import { db as dbClient, eq, sql, clubs } from '@smt/db';
import type { Track, ItemTier } from '@smt/shared/sim/stadium/types';
import {
  costOfItem,
  durationWeeks,
  type CostModifiers,
} from '@smt/shared';
import { EN_RIESGO_BALANCE_THRESHOLD } from '@smt/shared/sim/economy/constants';

/**
 * Deep-bankruptcy threshold for halting construction. Per GDD §3.1.7 the
 * obra is a binding commitment — it keeps progressing even if the player
 * goes into negative balance. Only ACTUAL technical bankruptcy (a much
 * deeper negative balance) pauses.
 *
 * Pablo bug 2026-05-25: previously used QUIEBRA_BALANCE_THRESHOLD=-200
 * with an additional per-installment affordability check, which caused
 * obras to stall whenever the club's balance dipped below ~4 €K (an
 * "En Riesgo" tier, not a halt condition). Now only true insolvency at
 * -500 €K pauses the build.
 */
const STADIUM_HALT_BALANCE_THRESHOLD = -500;
import { getCatalog } from './catalog.js';
import * as repo from './repo.js';

type Tx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0] | typeof dbClient;

/** Cross-module dependencies the service relies on. Each is optional;
 *  when absent, that side effect is skipped (logged for visibility). */
export type ServiceDeps = {
  /** Returns Director-de-Instalaciones skill 0..100 or null if no director assigned. */
  getDirectorSkill?: (clubId: string, tx: Tx) => Promise<number | null>;
  /** True if the manager has the Construction skill at T3+. */
  hasConstructionSkill?: (clubId: string, tx: Tx) => Promise<boolean>;
  /** Resolve an active event offer for a given (clubId, offerId). */
  getActiveSubsidyOffer?: (
    clubId: string,
    offerId: string,
    tx: Tx,
  ) => Promise<{ subsidyPct: number } | null>;
  /** Push a NodeId delta to cascade-engine for downstream chain triggering. */
  applyCascadeDelta?: (clubId: string, nodeId: string, delta: number, tx: Tx) => Promise<void>;
  /** Re-evaluate the city-progression doble-gate; called on Complete. */
  evaluateTierUp?: (clubId: string, tx: Tx) => Promise<{ tierUp: boolean }>;
  /** Emit a Socket.IO event post-transaction. */
  emitItemCompleteEvent?: (clubId: string, itemId: string) => void;
};

export type BuyParams = {
  clubId: string;
  itemSlug: string;
  /** Set to true to bypass the CRITICAL_BALANCE_WARNING soft block. */
  acceptRisk?: boolean;
  /** Optional event offer id to apply subsidy. */
  activeOfferId?: string;
};

export type BuyError =
  | 'ITEM_NOT_FOUND'
  | 'INVALID_PREREQ'
  | 'SLOT_OCCUPIED'
  | 'INSUFFICIENT_BALANCE'
  | 'CRITICAL_BALANCE_WARNING';

/** Compute the per-tick installment for an obra. Rounds to integer EUR-K.
 *  Pablo 2026-05-25 design tweak: reforms are charged week-by-week, not
 *  upfront. The installment is the smallest payable unit; the final tick
 *  pays the remainder so rounding never under/over-charges the player. */
export function installmentEurK(totalCostEurK: number, durationWeeks: number): number {
  if (durationWeeks <= 0) return totalCostEurK;
  return Math.round(totalCostEurK / durationWeeks);
}

export type CancelError = 'NOT_FOUND' | 'NOT_IN_PROGRESS';

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read the club's current spendable balance.
 *
 * Pablo 2026-05-25: source-of-truth for spendable balance is now
 * `worldSnapshots.worldState.financial_balance` (what /finance + /dashboard
 * display), NOT `clubs.budget` (which was an orphan tracker before v1.1).
 * Falls back to clubs.budget if no snapshot exists yet (e.g. fresh club
 * before the first weekly tick).
 */
async function readClubBalance(tx: Tx, clubId: string): Promise<number> {
  // Find the latest world snapshot for this club via its playthrough.
  const snapRow = await tx.execute(
    sql`SELECT (ws.world_state->>'financial_balance')::numeric AS balance
        FROM world_snapshots ws
        JOIN playthroughs p ON p.id = ws.playthrough_id
        WHERE p.club_id = ${clubId}
        ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
        LIMIT 1`,
  );
  const rows =
    (snapRow as unknown as { rows?: Array<{ balance: string | null }> }).rows
    ?? (snapRow as unknown as Array<{ balance: string | null }>);
  const fromSnapshot = rows[0]?.balance != null ? Number(rows[0].balance) : null;
  if (fromSnapshot !== null && Number.isFinite(fromSnapshot)) {
    return fromSnapshot;
  }

  // Fallback: brand-new club without any worldSnapshot yet.
  const clubRows = await tx
    .select({ budget: clubs.budget })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!clubRows[0]) throw new Error(`Club not found: ${clubId}`);
  return clubRows[0].budget;
}

/** Counts complete items in a given track for a club. */
async function countCompletedByTrack(
  tx: Tx,
  clubId: string,
  track: Track,
): Promise<number> {
  // Use direct SQL count for efficiency.
  const result = await tx.execute(
    sql`SELECT COUNT(*)::int AS count FROM stadium_upgrade_items
        WHERE club_id = ${clubId} AND track = ${track} AND status = 'complete'`,
  );
  // node-postgres returns rows as objects keyed by column name.
  // The shape comes back as a plain QueryResult-like: rows[0].count.
  const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows ?? (result as unknown as Array<{ count: number }>);
  return rows[0]?.count ?? 0;
}

/** Checks that ≥1 item from the previous tier of the same track is complete.
 *  Tier 1 always satisfies prereq (no previous tier). */
async function hasPrereqInPrevLevel(
  tx: Tx,
  clubId: string,
  track: Track,
  tier: ItemTier,
): Promise<boolean> {
  if (tier === 1) return true;
  const result = await tx.execute(
    sql`SELECT COUNT(*)::int AS count FROM stadium_upgrade_items
        WHERE club_id = ${clubId} AND track = ${track} AND tier = ${tier - 1} AND status = 'complete'`,
  );
  const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows ?? (result as unknown as Array<{ count: number }>);
  return (rows[0]?.count ?? 0) > 0;
}

/** Maps a track to the WorldState counter field name. */
function counterFieldForTrack(track: Track): 'stadium_upgrade_count' | 'training_facility_level' | 'youth_academy_level' {
  if (track === 'training') return 'training_facility_level';
  if (track === 'academy') return 'youth_academy_level';
  return 'stadium_upgrade_count';
}

/* ------------------------------------------------------------------ */
/* buy()                                                              */
/* ------------------------------------------------------------------ */

export async function buy(
  params: BuyParams,
  deps: ServiceDeps = {},
): Promise<
  Result<
    {
      itemId: string;
      totalCost: number;
      durationWeeks: number;
      installmentEurK: number;
    },
    BuyError
  >
> {
  return dbClient.transaction(async (tx) => {
    // 1. Look up the catalog item
    const item = getCatalog().find((i) => i.slug === params.itemSlug);
    if (!item) return err('ITEM_NOT_FOUND' as const);

    // 2. Prereq: track previous-level complete
    const prereqOk = await hasPrereqInPrevLevel(tx, params.clubId, item.track, item.tier as ItemTier);
    if (!prereqOk) return err('INVALID_PREREQ' as const);

    // 3. Queue: no in_progress slot occupied
    const active = await repo.getActive(tx, params.clubId);
    if (active) return err('SLOT_OCCUPIED' as const);

    // 4. Compute total cost with modifiers
    const construction = deps.hasConstructionSkill
      ? await deps.hasConstructionSkill(params.clubId, tx)
      : false;
    const offer = deps.getActiveSubsidyOffer && params.activeOfferId
      ? await deps.getActiveSubsidyOffer(params.clubId, params.activeOfferId, tx)
      : null;
    const modifiers: CostModifiers = {
      constructionSkill: construction,
      ...(offer ? { subsidyPct: offer.subsidyPct } : {}),
    };
    const cost = costOfItem({ tier: item.tier as ItemTier, track: item.track as Track }, modifiers);

    // 5. Compute duration with director modifier
    const directorSkill = deps.getDirectorSkill
      ? await deps.getDirectorSkill(params.clubId, tx)
      : null;
    const dur = durationWeeks({ tier: item.tier as ItemTier }, directorSkill);
    const weeklyInstallment = installmentEurK(cost, dur);

    // 6. Balance check — at least the first weekly installment must be payable.
    // (Pablo 2026-05-25 design tweak: reforms charge week-by-week, not upfront.
    //  The player commits to the total cost; if balance drops mid-build the
    //  bankruptcy pause in tickClub() halts charges.)
    const balance = await readClubBalance(tx, params.clubId);
    if (balance < weeklyInstallment) return err('INSUFFICIENT_BALANCE' as const);

    // 6b. Critical-balance UX guard: based on TOTAL commitment, not just the
    //     first installment — the player should be informed if the obra will
    //     put them under the en-riesgo threshold over its lifetime.
    if (!params.acceptRisk && balance - cost < EN_RIESGO_BALANCE_THRESHOLD) {
      return err('CRITICAL_BALANCE_WARNING' as const);
    }

    // 7. Insert in_progress. costPaidEurK stores the total committed cost
    //    (the column name is legacy — actual debits happen in tickClub).
    const newId = await repo.insertInProgress(tx, {
      clubId: params.clubId,
      itemSlug: item.slug,
      track: item.track,
      tier: item.tier,
      costPaidEurK: cost,
      durationWeeks: dur,
      weeksRemaining: dur,
      directorSkillSnapshot: directorSkill,
    });

    // 8. Do NOT debit upfront. Installments charged in tickClub().

    return ok({ itemId: newId, totalCost: cost, durationWeeks: dur, installmentEurK: weeklyInstallment });
  });
}

/* ------------------------------------------------------------------ */
/* cancel()                                                           */
/* ------------------------------------------------------------------ */

export async function cancel(
  params: { clubId: string; itemId: string },
  _deps: ServiceDeps = {},
): Promise<Result<{ refundEurK: number }, CancelError>> {
  return dbClient.transaction(async (tx) => {
    const item = await repo.findById(tx, params.itemId);
    if (!item || item.clubId !== params.clubId) return err('NOT_FOUND' as const);
    if (item.status !== 'in_progress') return err('NOT_IN_PROGRESS' as const);

    // Refund 50% of the AMOUNT ALREADY PAID (not 50% of the total commitment).
    // Pablo 2026-05-25: with installment billing, cancelling early should
    // refund half of what the player has actually paid so far, not half of
    // a future obligation.
    const weekly = installmentEurK(item.costPaidEurK, item.durationWeeks);
    const weeksPaid = item.durationWeeks - (item.weeksRemaining ?? 0);
    const paidToDate = weekly * Math.max(0, weeksPaid);
    const refund = Math.round(paidToDate * 0.5);

    await repo.updateStatus(tx, item.id, 'cancelled', { cancelledAt: new Date() });

    // Apply the refund directly to the latest worldSnapshot's financial_balance
    // so the player sees their money back immediately (not next tick).
    // Classification per ADR-014 + GDD §5.16: stadium_refund_extraordinary.
    if (refund > 0) {
      await tx.execute(
        sql`UPDATE world_snapshots
            SET world_state = jsonb_set(
              world_state,
              '{financial_balance}',
              to_jsonb(COALESCE((world_state->>'financial_balance')::numeric, 0) + ${refund})
            )
            WHERE id = (
              SELECT ws.id FROM world_snapshots ws
              JOIN playthroughs p ON p.id = ws.playthrough_id
              WHERE p.club_id = ${params.clubId}
              ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
              LIMIT 1
            )`,
      );
    }

    return ok({ refundEurK: refund });
  });
}

/* ------------------------------------------------------------------ */
/* tickClub()                                                         */
/* ------------------------------------------------------------------ */

export type TickResult =
  | { kind: 'no_active' }
  | { kind: 'bankruptcy_pause' }
  | { kind: 'decremented'; weeksRemaining: number; installmentPaid: number }
  | { kind: 'completed'; itemId: string; tierUp: boolean; finalPaid: number };

export async function tickClub(clubId: string, deps: ServiceDeps = {}): Promise<TickResult> {
  // Result emitted after tx commits so Socket.IO emit happens once.
  const result = await dbClient.transaction(async (tx): Promise<TickResult> => {
    const active = await repo.getActive(tx, clubId);
    if (!active) return { kind: 'no_active' as const };

    const balance = await readClubBalance(tx, clubId);
    if (balance < STADIUM_HALT_BALANCE_THRESHOLD) {
      return { kind: 'bankruptcy_pause' as const };
    }

    // Weekly installment math (Pablo 2026-05-25): the caller (advance
    // orchestrator) subtracts `installmentPaid` from worldState.financial_balance
    // + weekly_cashflow and stamps `stadium_reform_cost_weekly` for the
    // /finance breakdown. This service no longer mutates clubs.budget.
    const weekly = installmentEurK(active.costPaidEurK, active.durationWeeks);
    const weeksPaid = active.durationWeeks - (active.weeksRemaining ?? 0);
    const alreadyPaid = weekly * weeksPaid;

    const current = active.weeksRemaining ?? 0;
    const next = current - 1;
    if (next > 0) {
      // Mid-build tick: charge one installment regardless of "En Riesgo" tier
      // — obras are binding commitments per GDD §3.1.7.
      await repo.decrementWeeksRemaining(tx, active.id);
      return { kind: 'decremented' as const, weeksRemaining: next, installmentPaid: weekly };
    }

    // Final tick: pay the rounding remainder so player gets charged exactly
    // active.costPaidEurK in total (e.g. 21€K / 2 weeks = 11/10 split).
    const finalPaid = Math.max(0, active.costPaidEurK - alreadyPaid);

    // Transition to Complete + side effects in the same transaction.
    // Zero out weeksRemaining so a completed obra is canonical (no phantom
    // "1 week left" on a finished item). finalPaid was already computed above
    // from the pre-tick weeksRemaining, so this does not affect billing.
    await repo.updateStatus(tx, active.id, 'complete', { completedAt: new Date(), weeksRemaining: 0 });

    // Increment WorldState counter (atomic SQL on world_snapshots).
    // We update the latest snapshot for the club. Implementation note: this
    // requires looking up the playthrough → latest world_snapshot row. For
    // story 22-5 we do the SQL inline; story 22-7 may refactor this to a
    // helper in the world-state module.
    const counter = counterFieldForTrack(active.track as Track);
    await tx.execute(
      sql.raw(
        `UPDATE world_snapshots ws SET "${counter}" = COALESCE(ws."${counter}", 0) + 1
         WHERE ws.id = (
           SELECT ws2.id FROM world_snapshots ws2
           JOIN playthroughs p ON p.id = ws2.playthrough_id
           WHERE p.club_id = '${clubId}'
           ORDER BY ws2.created_at DESC NULLS LAST, ws2.week DESC
           LIMIT 1
         )`,
      ),
    );

    // Cascade-engine delta (optional dep).
    if (deps.applyCascadeDelta) {
      await deps.applyCascadeDelta(clubId, counter, 1, tx);
    }

    // Tier-up doble gate evaluation (optional dep).
    let tierUp = false;
    if (deps.evaluateTierUp) {
      const verdict = await deps.evaluateTierUp(clubId, tx);
      tierUp = verdict.tierUp;
    }

    return { kind: 'completed' as const, itemId: active.id, tierUp, finalPaid };
  });

  // Post-tx side effect (Socket.IO emit).
  if (result.kind === 'completed' && deps.emitItemCompleteEvent) {
    deps.emitItemCompleteEvent(clubId, result.itemId);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Read helpers (consumed by route layer in 22-6 + UI in 22-8)        */
/* ------------------------------------------------------------------ */

export async function getCompletedItemsCountByLevel(
  tx: Tx,
  clubId: string,
  tier: ItemTier,
): Promise<number> {
  const result = await tx.execute(
    sql`SELECT COUNT(*)::int AS count FROM stadium_upgrade_items
        WHERE club_id = ${clubId} AND tier = ${tier} AND status = 'complete'`,
  );
  const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows ?? (result as unknown as Array<{ count: number }>);
  return rows[0]?.count ?? 0;
}

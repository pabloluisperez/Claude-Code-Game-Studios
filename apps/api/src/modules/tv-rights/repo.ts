/**
 * TV Rights repository — owns reads/writes to tv_contracts.
 *
 * Per ADR-019 §1 + §7: all writes take a Drizzle tx parameter for transaction safety.
 * fan_loyalty lives on manager_profiles (see manager-rpg repo for that column).
 *
 * Story: TVR-001
 * Control Manifest: 2026-05-19
 */

import { and, eq } from 'drizzle-orm';
import {
  tvContracts,
  type TVContractRow,
  type NewTVContractRow,
  type TVStatus,
  type TVCancelReason,
} from '@smt/db';
import type { db as DBType } from '@smt/db';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

/** Returns the playthrough's currently ACTIVE contract, or null. */
export async function findActiveContract(
  tx: Tx,
  playthroughId: string,
): Promise<TVContractRow | null> {
  const rows = await tx
    .select()
    .from(tvContracts)
    .where(
      and(
        eq(tvContracts.playthroughId, playthroughId),
        eq(tvContracts.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Returns the contract row for a specific (playthrough, season), or null. */
export async function findContractForSeason(
  tx: Tx,
  playthroughId: string,
  season: number,
): Promise<TVContractRow | null> {
  const rows = await tx
    .select()
    .from(tvContracts)
    .where(
      and(
        eq(tvContracts.playthroughId, playthroughId),
        eq(tvContracts.season, season),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Inserts a new tv_contract row. Caller responsible for any existence checks. */
export async function createContract(
  tx: Tx,
  row: Omit<NewTVContractRow, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ id: string }> {
  const inserted = await tx
    .insert(tvContracts)
    .values(row)
    .returning({ id: tvContracts.id });
  return inserted[0]!;
}

/** Updates the contract's FSM state. Used by cancellation, expiration, season-start reset. */
export async function updateContractStatus(
  tx: Tx,
  contractId: string,
  status: TVStatus,
  extras?: { cancelledReason?: TVCancelReason; cancelledAt?: Date },
): Promise<void> {
  const updateData: Partial<NewTVContractRow> = { status };
  if (extras?.cancelledReason !== undefined) updateData.cancelledReason = extras.cancelledReason;
  if (extras?.cancelledAt !== undefined) updateData.cancelledAt = extras.cancelledAt;
  await tx.update(tvContracts).set(updateData).where(eq(tvContracts.id, contractId));
}

/** Increments season_in_contract by 1. Used by season_end rollover for multi-year contracts. */
export async function incrementSeasonInContract(
  tx: Tx,
  contractId: string,
): Promise<void> {
  const rows = await tx
    .select({ s: tvContracts.seasonInContract })
    .from(tvContracts)
    .where(eq(tvContracts.id, contractId))
    .limit(1);
  const current = rows[0]?.s ?? 1;
  await tx
    .update(tvContracts)
    .set({ seasonInContract: current + 1 })
    .where(eq(tvContracts.id, contractId));
}

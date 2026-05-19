/**
 * Sponsor lifecycle service.
 *
 * Per ADR-014 §Sponsor Lifecycle + GDD economy.md §3:
 *   - signSponsor(tx, args): INSERT with status='active'
 *   - cancelSponsor(tx, sponsorId, reason): status='cancelled' + reason
 *   - cancelAllSponsorsForScandal(tx, playthroughId, clubId): bulk cancel
 *     when corruption_exposure crosses 80 (BLOCKING per cascade-engine).
 *   - expireSponsorsWeekly(tx, currentWeek): check endsWeek and mark expired.
 *
 * Story: ECONOMY-005 (TR-ECO-005)
 * Control Manifest: 2026-05-19
 */

import { and, eq, lt } from 'drizzle-orm';
import type { NewSponsor, Sponsor } from '@smt/db';
import { sponsors } from '@smt/db';
import type { db as DBType } from '@smt/db';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export interface SignSponsorArgs {
  readonly playthroughId: string;
  readonly clubId: string;
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  readonly weeklyEurK: number;
  readonly qualityContribution: number;
  readonly startedWeek: number;
  readonly contractWeeks: number;
}

export async function signSponsor(
  tx: Tx,
  args: Readonly<SignSponsorArgs>,
): Promise<{ id: string }> {
  const row: NewSponsor = {
    playthroughId: args.playthroughId,
    clubId: args.clubId,
    name: args.name,
    tier: args.tier,
    weeklyEurK: args.weeklyEurK,
    qualityContribution: args.qualityContribution,
    status: 'active',
    cancellationReason: null,
    startedWeek: args.startedWeek,
    endsWeek: args.startedWeek + args.contractWeeks,
  };
  const inserted = await tx.insert(sponsors).values(row).returning({ id: sponsors.id });
  return inserted[0]!;
}

export async function cancelSponsor(
  tx: Tx,
  sponsorId: string,
  reason: 'scandal' | 'manual',
): Promise<void> {
  await tx
    .update(sponsors)
    .set({ status: 'cancelled', cancellationReason: reason })
    .where(eq(sponsors.id, sponsorId));
}

/**
 * Bulk cancel all active sponsors for a club when corruption_exposure crosses 80.
 * Returns the number of sponsors cancelled.
 */
export async function cancelAllSponsorsForScandal(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<number> {
  const active = await tx
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(
      and(
        eq(sponsors.playthroughId, playthroughId),
        eq(sponsors.clubId, clubId),
        eq(sponsors.status, 'active'),
      ),
    );
  for (const row of active) {
    await tx
      .update(sponsors)
      .set({ status: 'cancelled', cancellationReason: 'scandal' })
      .where(eq(sponsors.id, row.id));
  }
  return active.length;
}

/**
 * Mark active sponsors whose `endsWeek <= currentWeek` as expired.
 * Returns the number marked.
 */
export async function expireSponsorsWeekly(
  tx: Tx,
  currentWeek: number,
): Promise<number> {
  const expiring = await tx
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(
      and(eq(sponsors.status, 'active'), lt(sponsors.endsWeek, currentWeek + 1)),
    );
  for (const row of expiring) {
    await tx
      .update(sponsors)
      .set({ status: 'expired', cancellationReason: 'expired' })
      .where(eq(sponsors.id, row.id));
  }
  return expiring.length;
}

/** Read all active sponsors for a club (used by revenue calculator). */
export async function getActiveSponsors(
  tx: Tx,
  playthroughId: string,
  clubId: string,
): Promise<readonly Sponsor[]> {
  return tx
    .select()
    .from(sponsors)
    .where(
      and(
        eq(sponsors.playthroughId, playthroughId),
        eq(sponsors.clubId, clubId),
        eq(sponsors.status, 'active'),
      ),
    );
}

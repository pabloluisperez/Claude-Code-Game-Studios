/**
 * Stadium upgrade tick — runs inside the weekly advance pipeline.
 *
 * Pablo bug 2026-05-25: "la obra no avanza". The standalone stadium service
 * in apps/api was never being called from the advance orchestrator. This
 * module is the orchestrator-side counterpart: it advances the FSM for the
 * single active obra and returns the financial delta so the caller can fold
 * it into worldState (financial_balance + weekly_cashflow +
 * stadium_reform_cost_weekly).
 *
 * Decoupled from apps/api so this is a pure cross-app boundary helper.
 */

import { and, eq, sql, db as dbClient, stadiumUpgradeItems } from '@smt/db';

/**
 * Deep-bankruptcy threshold for halting construction. Per GDD §3.1.7 the
 * obra is a binding commitment — it keeps progressing even if the player
 * goes into negative balance. Only ACTUAL technical bankruptcy (a much
 * deeper negative balance) pauses; the per-installment affordability check
 * was removed 2026-05-25 after Pablo reported obras stalling for clubs in
 * the "En Riesgo" tier (balance < 50 €K) — that tier is meant as a warning,
 * not a pause condition.
 */
const STADIUM_HALT_BALANCE_THRESHOLD = -500; // €K; matches GDD §3.1.7
const STADIUM_TRACK_TO_COUNTER: Record<string, 'stadium_upgrade_count' | 'training_facility_level' | 'youth_academy_level'> = {
  gradas: 'stadium_upgrade_count',
  pitch: 'stadium_upgrade_count',
  servicios: 'stadium_upgrade_count',
  training: 'training_facility_level',
  academy: 'youth_academy_level',
};

function installmentEurK(totalCost: number, durationWeeks: number): number {
  if (durationWeeks <= 0) return totalCost;
  return Math.round(totalCost / durationWeeks);
}

export type StadiumTickResult =
  | { kind: 'no_active' }
  | { kind: 'bankruptcy_pause' }
  | { kind: 'decremented'; weeksRemaining: number; installmentPaid: number }
  | {
      kind: 'completed';
      itemId: string;
      itemSlug: string;
      itemTrack: string;
      itemTier: number;
      finalPaid: number;
      counterField: 'stadium_upgrade_count' | 'training_facility_level' | 'youth_academy_level';
    };

/**
 * Tick the stadium FSM for a single club within a transaction.
 *
 * Important: the caller is responsible for applying the financial delta
 * (installmentPaid or finalPaid) to the worldState patch.
 */
export async function tickStadiumForClubInTx(
  tx: typeof dbClient,
  clubId: string,
  currentBalance: number,
): Promise<StadiumTickResult> {
  const activeRows = await tx
    .select()
    .from(stadiumUpgradeItems)
    .where(
      and(eq(stadiumUpgradeItems.clubId, clubId), eq(stadiumUpgradeItems.status, 'in_progress')),
    )
    .limit(1);

  const active = activeRows[0];
  if (!active) return { kind: 'no_active' };

  // Deep-bankruptcy halt: the only condition that pauses an active obra.
  // Per GDD §3.1.7 the commitment is binding — the player keeps paying even
  // into negative balance, all the way down to the technical-bankruptcy
  // floor (-500 €K). At that point the worker fairly pauses; the player
  // still owns the partial-build and can resume once they recover.
  if (currentBalance < STADIUM_HALT_BALANCE_THRESHOLD) {
    return { kind: 'bankruptcy_pause' };
  }

  const weekly = installmentEurK(active.costPaidEurK, active.durationWeeks);
  const weeksPaid = active.durationWeeks - (active.weeksRemaining ?? 0);
  const alreadyPaid = weekly * weeksPaid;

  const current = active.weeksRemaining ?? 0;
  const next = current - 1;

  if (next > 0) {
    // Mid-build: charge one installment regardless of "En Riesgo" status —
    // the obra was a commitment.
    await tx
      .update(stadiumUpgradeItems)
      .set({ weeksRemaining: sql`${stadiumUpgradeItems.weeksRemaining} - 1` })
      .where(eq(stadiumUpgradeItems.id, active.id));
    return { kind: 'decremented', weeksRemaining: next, installmentPaid: weekly };
  }

  // Final tick: settle the remainder so total paid equals costPaidEurK exactly.
  const finalPaid = Math.max(0, active.costPaidEurK - alreadyPaid);

  const counter = STADIUM_TRACK_TO_COUNTER[active.track] ?? 'stadium_upgrade_count';
  await tx
    .update(stadiumUpgradeItems)
    .set({ status: 'complete', completedAt: new Date(), weeksRemaining: 0 })
    .where(eq(stadiumUpgradeItems.id, active.id));

  return {
    kind: 'completed',
    itemId: active.id,
    itemSlug: active.itemSlug,
    itemTrack: active.track,
    itemTier: active.tier,
    finalPaid,
    counterField: counter,
  };
}

/**
 * AI-clubs stadium tick — runs as Phase 3c in the advance pipeline.
 *
 * Story 25-7: the player's club is already ticked by Phase 3b
 * (`tickStadiumForClubInTx`). AI clubs with active obras were never ticked —
 * this module closes that gap.
 *
 * Architecture note: `apps/api/src/modules/stadium-upgrades/tier-evaluator.ts`
 * now exposes `tickAllClubsWithActiveUpgrades({ excludeClubId })` as the
 * canonical entry point, but `apps/web` does not depend on `@smt/api`.
 * This module is the orchestrator-side implementation: it mirrors the same
 * FSM logic (installment decrement, complete, counter bump) using direct
 * Drizzle queries, consistent with `stadium-tick.ts` for the player club.
 *
 * Tier-up evaluation for AI clubs: the city_tier promotion is a DB-only write
 * with no user-visible effect on the player's session, so it is safe to run
 * here without wiring into the worldState patch. The SQL UPDATE is identical
 * to `defaultPromoteTier` in tier-evaluator.ts.
 */

import { and, eq, ne, sql, db as dbClient, stadiumUpgradeItems, clubs } from '@smt/db';

const STADIUM_HALT_BALANCE_THRESHOLD = -500; // €K; matches GDD §3.1.7
const STADIUM_TRACK_TO_COUNTER: Record<
  string,
  'stadium_upgrade_count' | 'training_facility_level' | 'youth_academy_level'
> = {
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

/**
 * Read the latest financial_balance for a club from its world_snapshot.
 * AI clubs may not have a playthrough / worldSnapshot at all — in that
 * case we fall back to clubs.budget (the column still valid for non-player
 * clubs). Returns null if no balance can be determined.
 */
async function readAIClubBalance(clubId: string): Promise<number | null> {
  const snapRows = await dbClient.execute(
    sql`SELECT (ws.world_state->>'financial_balance')::numeric AS balance
        FROM world_snapshots ws
        JOIN playthroughs p ON p.id = ws.playthrough_id
        WHERE p.club_id = ${clubId}
        ORDER BY ws.week DESC, ws.created_at DESC NULLS LAST
        LIMIT 1`,
  );
  const rows =
    (snapRows as unknown as { rows?: Array<{ balance: string | null }> }).rows
    ?? (snapRows as unknown as Array<{ balance: string | null }>);
  const fromSnapshot = rows[0]?.balance != null ? Number(rows[0].balance) : null;
  if (fromSnapshot !== null && Number.isFinite(fromSnapshot)) return fromSnapshot;

  // No playthrough snapshot — use clubs.budget as fallback.
  const clubRows = await dbClient
    .select({ budget: clubs.budget })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return clubRows[0]?.budget ?? null;
}

/**
 * Evaluate tier-up double gate for an AI club on obra completion.
 *
 * Uses raw SQL counts for the reformas gate (70% of items at the next tier
 * level must be complete). The metrics gate defaults to `true` for AI clubs
 * per the tier-evaluator design (city-progression module not yet wired).
 * Promotes clubs.city_tier atomically if both gates pass.
 */
async function evaluateTierUpForAIClub(clubId: string): Promise<void> {
  const [clubRow] = await dbClient
    .select({ cityTier: clubs.cityTier })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!clubRow) return;

  const currentTier = clubRow.cityTier;
  const nextTier = currentTier + 1;
  if (nextTier > 4) return; // AT_MAX

  // Reformas gate (F6): need 70% of items at nextTier level complete.
  const totalRows = await dbClient.execute(
    sql`SELECT COUNT(*)::int AS total FROM stadium_upgrade_items
        WHERE club_id = ${clubId} AND tier = ${nextTier}`,
  );
  const totalArr =
    (totalRows as unknown as { rows?: Array<{ total: number }> }).rows
    ?? (totalRows as unknown as Array<{ total: number }>);
  const total = totalArr[0]?.total ?? 0;
  if (total === 0) return; // no items at this tier → gate cannot pass

  const required = Math.ceil(total * 0.7);

  const completedRows = await dbClient.execute(
    sql`SELECT COUNT(*)::int AS completed FROM stadium_upgrade_items
        WHERE club_id = ${clubId} AND tier = ${nextTier} AND status = 'complete'`,
  );
  const completedArr =
    (completedRows as unknown as { rows?: Array<{ completed: number }> }).rows
    ?? (completedRows as unknown as Array<{ completed: number }>);
  const completed = completedArr[0]?.completed ?? 0;

  if (completed < required) return; // reformas gate not met

  // Both gates pass (metrics defaults to true for AI clubs) — promote.
  await dbClient
    .update(clubs)
    .set({ cityTier: nextTier })
    .where(eq(clubs.id, clubId));
}

/**
 * Tick stadium FSM for one AI club (no worldState mutation — AI clubs do not
 * have a player-visible financial_balance breakdown in the UI).
 */
async function tickOneAIClub(clubId: string): Promise<void> {
  const activeRows = await dbClient
    .select()
    .from(stadiumUpgradeItems)
    .where(
      and(
        eq(stadiumUpgradeItems.clubId, clubId),
        eq(stadiumUpgradeItems.status, 'in_progress'),
      ),
    )
    .limit(1);

  const active = activeRows[0];
  if (!active) return;

  const balance = await readAIClubBalance(clubId);
  if (balance !== null && balance < STADIUM_HALT_BALANCE_THRESHOLD) return;

  const current = active.weeksRemaining ?? 0;
  const next = current - 1;

  if (next > 0) {
    await dbClient
      .update(stadiumUpgradeItems)
      .set({ weeksRemaining: sql`${stadiumUpgradeItems.weeksRemaining} - 1` })
      .where(eq(stadiumUpgradeItems.id, active.id));
    return;
  }

  // Final tick: mark complete and bump the relevant counter.
  await dbClient
    .update(stadiumUpgradeItems)
    .set({ status: 'complete', completedAt: new Date(), weeksRemaining: 0 })
    .where(eq(stadiumUpgradeItems.id, active.id));

  const counter = STADIUM_TRACK_TO_COUNTER[active.track] ?? 'stadium_upgrade_count';

  // Bump counter on the latest world_snapshot for this club (if a playthrough
  // exists). AI clubs without a playthrough skip the counter bump — they have
  // no WorldState, so the column is irrelevant for them.
  await dbClient.execute(
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

  // Tier-up doble gate — evaluate now that an obra completed.
  await evaluateTierUpForAIClub(clubId);
}

/**
 * Tick all AI clubs (i.e. clubs with in_progress stadium items), excluding
 * the player's own club which is already ticked in Phase 3b.
 *
 * Returns `{ ticked }` — count of clubs actually ticked (excludes the
 * excluded club even if it had an active item).
 *
 * Never throws — all errors are swallowed so the advance pipeline is never
 * blocked by AI club stadium state.
 */
export async function tickAIClubsStadiums(
  excludeClubId: string,
): Promise<{ ticked: number }> {
  // Fetch all distinct club_ids with an in_progress item, excluding the player.
  const result = await dbClient.execute(
    sql`SELECT DISTINCT club_id
        FROM stadium_upgrade_items
        WHERE status = 'in_progress' AND club_id <> ${excludeClubId}`,
  );
  const rows =
    (result as unknown as { rows?: Array<{ club_id: string }> }).rows
    ?? (result as unknown as Array<{ club_id: string }>);
  const clubIds = rows.map((r) => r.club_id);

  let ticked = 0;
  for (const clubId of clubIds) {
    try {
      await tickOneAIClub(clubId);
      ticked++;
    } catch {
      // AI club tick errors are non-fatal — advance pipeline must not be blocked.
    }
  }
  return { ticked };
}

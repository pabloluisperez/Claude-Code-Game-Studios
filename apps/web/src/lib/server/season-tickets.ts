/**
 * Season-ticket weekly drip.
 *
 * The flow is:
 *   1. During early pretemporada the user sets the price (locks it for the
 *      current season).
 *   2. From the week the price is set through `startWeek + 2` (the third
 *      matchday inclusive), new holders sign up each week following a
 *      declining curve. Each new holder pays the full season price.
 *   3. Once all targeted holders have signed (or the window closes),
 *      collection stops for the season.
 *
 * Story: Abono v2 — weekly drip
 * Control Manifest: 2026-05-20
 */

import {
  db,
  clubs,
  seasons,
  leagues,
  eq,
  and,
  desc,
} from '@smt/db';

/**
 * Declining curve for week-since-lock → fraction of total holders signing
 * up that week. Total should sum to ~1.0 across the 7-week window.
 */
const DRIP_CURVE: readonly number[] = [0.28, 0.20, 0.15, 0.12, 0.10, 0.08, 0.07];
/** Length of the collection window in weeks (pretemporada tail + first 3 matchdays). */
const DRIP_WEEKS = DRIP_CURVE.length;

export interface SeasonTicketWeeklyResult {
  paid: boolean;
  newHolders?: number;
  weeklyEurK?: number;
  totalHoldersAfter?: number;
  weekIntoCollection?: number;
}

export async function maybeDripSeasonTickets(args: {
  playthroughId: string;
  clubId: string;
  currentWeek: number;
}): Promise<SeasonTicketWeeklyResult> {
  const { playthroughId, clubId, currentWeek } = args;

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, playthroughId))
    .limit(1);
  if (!league) return { paid: false };

  const [activeSeason] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  if (!activeSeason) return { paid: false };

  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) return { paid: false };

  // Only drip if the price is locked for THIS season.
  if (club.seasonTicketPriceLockedSeason !== activeSeason.seasonNumber) {
    return { paid: false };
  }

  // Target holders = current configured holder count. Stop once we've
  // collected them all.
  const targetHolders = club.seasonTicketHolders;
  if (club.seasonTicketHoldersCollected >= targetHolders) {
    return { paid: false };
  }

  // Collection window: from the price-lock week (approximated as
  // startWeek − 3, since we lock during the last 3 pretemporada weeks)
  // through startWeek + 3.
  const windowStart = Math.max(0, activeSeason.startWeek - 3);
  const windowEnd = activeSeason.startWeek + DRIP_WEEKS - 4;
  if (currentWeek < windowStart || currentWeek > windowEnd) {
    return { paid: false };
  }
  const weekOffset = currentWeek - windowStart;
  const fraction = DRIP_CURVE[weekOffset] ?? 0;
  if (fraction <= 0) return { paid: false };

  const remaining = targetHolders - club.seasonTicketHoldersCollected;
  const newHolders = Math.min(remaining, Math.max(1, Math.round(targetHolders * fraction)));
  const weeklyEur = newHolders * club.seasonTicketPriceEur;
  const weeklyEurK = Math.round(weeklyEur / 1000 * 10) / 10; // 1-decimal precision

  const totalAfter = club.seasonTicketHoldersCollected + newHolders;

  await db
    .update(clubs)
    .set({
      seasonTicketHoldersCollected: totalAfter,
      // If fully collected, mark as paid for accounting.
      lastSeasonTicketPaidSeason:
        totalAfter >= targetHolders
          ? activeSeason.seasonNumber
          : club.lastSeasonTicketPaidSeason,
      updatedAt: new Date(),
    })
    .where(eq(clubs.id, clubId));

  return {
    paid: true,
    newHolders,
    weeklyEurK,
    totalHoldersAfter: totalAfter,
    weekIntoCollection: weekOffset,
  };
}

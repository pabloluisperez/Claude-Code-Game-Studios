/**
 * Season-ticket lump-sum payment.
 *
 * Triggered during advance when the user's club enters a new season for the
 * first time. Pays `holders × price` euros (converted to €K) into the next
 * worldSnapshot's balance. Tracks `clubs.lastSeasonTicketPaidSeason` so we
 * never double-pay.
 *
 * Story: Season tickets stub
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

export interface SeasonTicketPayment {
  paid: boolean;
  seasonNumber?: number;
  holders?: number;
  priceEur?: number;
  totalEurK?: number;
}

export async function maybePaySeasonTickets(args: {
  playthroughId: string;
  clubId: string;
  currentWeek: number;
}): Promise<SeasonTicketPayment> {
  const { playthroughId, clubId, currentWeek } = args;

  // What season are we currently in?
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

  // Only pay starting at the season's startWeek.
  if (currentWeek < activeSeason.startWeek) return { paid: false };

  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) return { paid: false };
  if (club.lastSeasonTicketPaidSeason >= activeSeason.seasonNumber) {
    return { paid: false };
  }

  const holders = club.seasonTicketHolders;
  const priceEur = club.seasonTicketPriceEur;
  const totalEurK = Math.round((holders * priceEur) / 1000);

  await db
    .update(clubs)
    .set({ lastSeasonTicketPaidSeason: activeSeason.seasonNumber, updatedAt: new Date() })
    .where(eq(clubs.id, clubId));

  return {
    paid: true,
    seasonNumber: activeSeason.seasonNumber,
    holders,
    priceEur,
    totalEurK,
  };
}

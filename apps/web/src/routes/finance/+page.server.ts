/**
 * Finance dashboard — snapshots history + sponsors + season-ticket controls.
 *
 * Story: Season tickets stub
 * Control Manifest: 2026-05-20
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  sponsors,
  clubs,
  playthroughs,
  seasons,
  leagues,
  eq,
  and,
  desc,
} from '@smt/db';
import { LEAGUE_KICKOFF_WEEK } from '@smt/shared';

/**
 * The window in which the user can change the season-ticket price for the
 * NEXT season: from the moment the previous season ends (or career start)
 * until the kick-off week of the current season.
 *
 * Returns null if there's no active season yet (treat as pretemporada).
 */
async function isPretemporada(playthroughId: string): Promise<boolean> {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, playthroughId))
    .limit(1);
  if (!league) return true; // career being created — allow

  const [activeSeason] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const [pt] = await db.select().from(playthroughs).where(eq(playthroughs.id, playthroughId)).limit(1);
  if (!pt) return true;
  const currentWeek = pt.currentWeek;

  if (!activeSeason) return true;
  // Pretemporada = before season's first matchday.
  return currentWeek < activeSeason.startWeek;
}

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false as const };
  }

  const snapshots = await db
    .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, activePlaythrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(4);

  const sponsorRows = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.playthroughId, activePlaythrough.id))
    .orderBy(desc(sponsors.tier));

  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  const pretemporada = await isPretemporada(activePlaythrough.id);

  // Weeks remaining until kick-off — used to warn the user when the window closes.
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, activePlaythrough.id))
    .limit(1);
  let weeksUntilKickoff: number | null = null;
  if (league) {
    const [activeSeason] = await db
      .select()
      .from(seasons)
      .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (activeSeason && activePlaythrough.currentWeek < activeSeason.startWeek) {
      weeksUntilKickoff = activeSeason.startWeek - activePlaythrough.currentWeek;
    }
  }

  // Resolve the upcoming season number for lock comparison.
  let upcomingSeasonNumber = 1;
  if (league) {
    const [activeSeason] = await db
      .select({ seasonNumber: seasons.seasonNumber })
      .from(seasons)
      .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (activeSeason) upcomingSeasonNumber = activeSeason.seasonNumber;
  }

  const isPriceLocked = club
    ? club.seasonTicketPriceLockedSeason >= upcomingSeasonNumber
    : false;

  return {
    hasPlaythrough: true as const,
    snapshots: snapshots.map((s) => ({
      week: s.week,
      state: s.worldState as Record<string, number>,
    })),
    sponsors: sponsorRows,
    club: club
      ? {
          seasonTicketPriceEur: club.seasonTicketPriceEur,
          seasonTicketHolders: club.seasonTicketHolders,
          seasonTicketHoldersCollected: club.seasonTicketHoldersCollected,
          fanBase: club.fanBase,
        }
      : null,
    pretemporada,
    weeksUntilKickoff,
    isPriceLocked,
    upcomingSeasonNumber,
  };
};

export const actions: Actions = {
  setTicketPrice: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const raw = Number(form.get('priceEur') ?? NaN);
    if (!Number.isFinite(raw) || raw < 5 || raw > 200) {
      return fail(400, { error: 'Precio fuera de rango (5-200 €).' });
    }

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    if (!(await isPretemporada(active.id))) {
      return fail(400, {
        error: 'El precio de los abonos solo se puede cambiar en pretemporada.',
      });
    }

    // Lock check: if already set for the upcoming season, refuse.
    const [league] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.playthroughId, active.id))
      .limit(1);
    let upcomingSeasonNumber = 1;
    if (league) {
      const [activeSeason] = await db
        .select({ seasonNumber: seasons.seasonNumber })
        .from(seasons)
        .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
        .orderBy(desc(seasons.seasonNumber))
        .limit(1);
      if (activeSeason) upcomingSeasonNumber = activeSeason.seasonNumber;
    }
    const [currentClub] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.id, active.clubId))
      .limit(1);
    if (currentClub && currentClub.seasonTicketPriceLockedSeason >= upcomingSeasonNumber) {
      return fail(400, {
        error: 'El precio del abono ya está fijado para esta temporada.',
      });
    }

    // Adjust holder count based on the new price vs market reference (35€).
    // - 25€ or less → +10% holders (cap at fanBase × 0.4)
    // - 50€ or more → -10% holders (floor at 50)
    // - in between → no change
    const [club] = await db.select().from(clubs).where(eq(clubs.id, active.clubId)).limit(1);
    if (!club) return fail(400, { error: 'Club no encontrado.' });

    let holders = club.seasonTicketHolders;
    if (raw <= 25) {
      holders = Math.min(Math.round(club.fanBase * 0.4), Math.round(holders * 1.1));
    } else if (raw >= 50) {
      holders = Math.max(50, Math.round(holders * 0.9));
    }

    await db
      .update(clubs)
      .set({
        seasonTicketPriceEur: Math.round(raw),
        seasonTicketHolders: holders,
        // Reset collected so the drip starts fresh from this set-week.
        seasonTicketHoldersCollected: 0,
        // Lock the price for the upcoming season.
        seasonTicketPriceLockedSeason: upcomingSeasonNumber,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, active.clubId));

    return { ok: true, priceEur: Math.round(raw), holders };
  },
};

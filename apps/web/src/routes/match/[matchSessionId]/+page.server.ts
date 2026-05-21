/**
 * Match recap / live page.
 *
 * Loads the user's fixture + the other fixtures from the same matchday +
 * a snapshot of the live standings (computed at the user's match start
 * time, i.e. NOT including this matchday's results yet — gives a
 * "going-into-the-game" feel) and "live" standings (including all the
 * matchday results).
 *
 * Story: HUD-UI-006 + sidebar with other matches + mini standings
 * Control Manifest: 2026-05-20
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  db,
  fixtures,
  clubs,
  standings,
  worldSnapshots,
  eq,
  and,
  ne,
  desc,
  alias,
} from '@smt/db';
import {
  computeEffectiveTicketPrice,
  computeMatchDayRevenue,
} from '@smt/shared/sim/economy/revenue';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const [fx] = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      matchday: fixtures.matchday,
      seasonId: fixtures.seasonId,
      divisionId: fixtures.divisionId,
      status: fixtures.status,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      matchOutcomeData: fixtures.matchOutcomeData,
      playedAt: fixtures.playedAt,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(eq(fixtures.id, params.matchSessionId))
    .limit(1);

  if (!fx) throw error(404, 'Match not found');

  // Other fixtures from the same matchday (everyone else playing today).
  const otherFixtures = await db
    .select({
      id: fixtures.id,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      status: fixtures.status,
      matchOutcomeData: fixtures.matchOutcomeData,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      and(
        eq(fixtures.seasonId, fx.seasonId),
        eq(fixtures.matchday, fx.matchday),
        ne(fixtures.id, fx.id),
      ),
    );

  // Mini live standings — current snapshot for the same season+division.
  const liveStandings = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
      played: standings.played,
      points: standings.points,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
    })
    .from(standings)
    .innerJoin(clubs, eq(clubs.id, standings.clubId))
    .where(
      and(
        eq(standings.seasonId, fx.seasonId),
        eq(standings.divisionId, fx.divisionId),
      ),
    )
    .orderBy(desc(standings.points), desc(standings.goalsFor));

  // Polish walkthrough fix (Pablo, post-Sprint-11): if the user's club is
  // home, surface attendance + gate receipts in the match page. The values
  // are not persisted per-fixture today — we re-derive them from the week
  // snapshot using the same formula as the economy tick (F-TV4 boost
  // included). This is a read-only display; the persisted balance in the
  // snapshot is already correct.
  let homeMatchEconomics:
    | { attendance: number; gateReceiptsEurK: number; ticketPriceEur: number }
    | null = null;
  if (
    activePlaythrough &&
    fx.homeClubId === activePlaythrough.clubId &&
    fx.status === 'played'
  ) {
    const [snapshot] = await db
      .select({ worldState: worldSnapshots.worldState })
      .from(worldSnapshots)
      .where(
        and(
          eq(worldSnapshots.playthroughId, activePlaythrough.id),
          eq(worldSnapshots.week, fx.week),
        ),
      )
      .limit(1);
    const [clubRow] = await db
      .select({ division: clubs.division })
      .from(clubs)
      .where(eq(clubs.id, activePlaythrough.clubId))
      .limit(1);

    if (snapshot) {
      const ws = snapshot.worldState as Record<string, number>;
      const stadiumCapacity = ws['stadium_capacity'] ?? 3000;
      const fanAttendance = ws['fan_attendance'] ?? 40;
      const fanCultureIndex = ws['fan_culture_index'] ?? 35;
      const ticketPriceIndex = ws['ticket_price_index'] ?? 50;
      const fanLoyalty = ws['fan_loyalty'] ?? 0;
      const divisionTier: 1 | 2 = clubRow?.division === 'first' ? 1 : 2;

      const attendance = Math.round(stadiumCapacity * (fanAttendance / 100));
      const pricing = computeEffectiveTicketPrice({
        stadiumCapacity,
        divisionTier,
        fanCultureIndex,
        ticketPriceIndex,
      });
      const gateReceiptsEurK = computeMatchDayRevenue({
        attendance,
        ticketPriceEur: pricing.effectivePriceEur,
        fanLoyalty,
        stadiumCapacity,
      });

      homeMatchEconomics = {
        attendance,
        gateReceiptsEurK,
        ticketPriceEur: pricing.effectivePriceEur,
      };
    }
  }

  return {
    fixture: fx,
    otherFixtures,
    liveStandings,
    currentWeek: activePlaythrough?.currentWeek ?? 0,
    homeMatchEconomics,
  };
};

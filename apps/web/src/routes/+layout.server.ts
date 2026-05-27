import type { LayoutServerLoad } from './$types';
import {
  db,
  playthroughs,
  clubs,
  calendarEvents,
  staffMessages,
  worldSnapshots,
  seasons,
  leagues,
  fixtures,
  standings,
  players,
  eq,
  and,
  or,
  desc,
  sql,
  inArray,
} from '@smt/db';
import { weekToDate } from '@smt/shared';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return { user: null, activePlaythrough: null, badges: null };
  }

  const [active] = await db
    .select({
      id: playthroughs.id,
      clubId: playthroughs.clubId,
      currentWeek: playthroughs.currentWeek,
      currentDayOfSeason: playthroughs.currentDayOfSeason,
      clubName: clubs.name,
      clubDivision: clubs.division,
      kitPrimaryColor: clubs.kitPrimaryColor,
      kitSecondaryColor: clubs.kitSecondaryColor,
    })
    .from(playthroughs)
    .leftJoin(clubs, eq(clubs.id, playthroughs.clubId))
    .where(eq(playthroughs.userId, locals.user.id))
    .orderBy(desc(playthroughs.updatedAt))
    .limit(1);

  if (!active) {
    return { user: locals.user, activePlaythrough: null, badges: null };
  }

  // Pablo 2026-05-27: sponsor events are now decided in Finanzas → Patrocinadores,
  // so they badge there, NOT the Eventos calendar. Count the two separately.
  const [pendingStops] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, active.id),
        eq(calendarEvents.status, 'pending'),
        eq(calendarEvents.priority, 'STOP'),
        sql`${calendarEvents.type} NOT IN ('sponsor_offer', 'sponsor_renewal')`,
      ),
    );

  const [pendingSponsorDecisions] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, active.id),
        eq(calendarEvents.status, 'pending'),
        sql`${calendarEvents.type} IN ('sponsor_offer', 'sponsor_renewal')`,
      ),
    );

  // Lineup badge: does the saved XI contain an injured/suspended player?
  let lineupHasUnavailable = 0;
  {
    const [clubRow] = await db
      .select({ ids: clubs.startingLineupPlayerIds })
      .from(clubs)
      .where(eq(clubs.id, active.clubId))
      .limit(1);
    const ids = (clubRow?.ids ?? []) as string[];
    if (ids.length > 0) {
      const [{ count = 0 } = { count: 0 }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(players)
        .where(
          and(
            inArray(players.id, ids),
            sql`(${players.suspendedMatchesRemaining} > 0 OR ${players.availability} IN ('injured','leaving'))`,
          ),
        );
      lineupHasUnavailable = Number(count);
    }
  }

  const [unreadUrgent] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffMessages)
    .where(
      and(
        eq(staffMessages.playthroughId, active.id),
        eq(staffMessages.priority, 'URGENT'),
        eq(staffMessages.isRead, false),
      ),
    );

  const [unreadTotal] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffMessages)
    .where(
      and(
        eq(staffMessages.playthroughId, active.id),
        eq(staffMessages.isRead, false),
      ),
    );

  const [latestSnapshot] = await db
    .select({ worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, active.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const worldState = (latestSnapshot?.worldState ?? null) as
    | Record<string, number>
    | null;
  const balanceEurK = worldState?.['financial_balance'] ?? null;

  // Sprint 12 walkthrough fix (Pablo Part B): when the playthrough sits
  // mid-week (post-STOP halt), the topbar should show the ACTUAL day,
  // not the week's Sunday. weekToDate accepts fractional weeks, so
  // weekToDate(currentDayOfSeason / 7) = anchor + currentDayOfSeason days.
  const dayPrecise = (active.currentDayOfSeason ?? active.currentWeek * 7) / 7;

  // Pablo bug 2026-05-25: topbar should show "Pretemporada" while we're
  // before the active season's startWeek, then "Jornada N" once the league
  // is running. Compute both: seasonStartWeek + current matchday.
  const [activeSeason] = await db
    .select({ startWeek: seasons.startWeek, seasonNumber: seasons.seasonNumber })
    .from(seasons)
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(and(eq(leagues.playthroughId, active.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  const seasonStartWeek = activeSeason?.startWeek ?? null;
  const seasonNumber = activeSeason?.seasonNumber ?? 1;
  // Pablo 2026-05-26: relative week-within-season for display purposes.
  // Pretemporada lasts a few weeks before startWeek — render that as week 0.
  const weekInSeason =
    seasonStartWeek !== null ? Math.max(0, active.currentWeek - seasonStartWeek + 1) : active.currentWeek;
  const isPreseason =
    seasonStartWeek !== null && active.currentWeek < seasonStartWeek;
  let matchday: number | null = null;
  if (seasonStartWeek !== null && !isPreseason) {
    // Lookup the fixture for this week + this club to read the canonical
    // matchday number. Falls back to (currentWeek - startWeek + 1) if no
    // fixture row exists yet (e.g. between season-end and next season-start).
    const [fx] = await db
      .select({ matchday: fixtures.matchday })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.week, active.currentWeek),
          or(eq(fixtures.homeClubId, active.clubId), eq(fixtures.awayClubId, active.clubId)),
        ),
      )
      .limit(1);
    matchday = fx?.matchday ?? Math.max(1, active.currentWeek - seasonStartWeek + 1);
  }

  // Standings position + record for sidebar club summary (Pablo 2026-05-26).
  let position: number | null = null;
  let record: { wins: number; draws: number; losses: number } | null = null;
  if (activeSeason && !isPreseason) {
    const allRows = await db
      .select({
        clubId: standings.clubId,
        wins: standings.wins,
        draws: standings.draws,
        losses: standings.losses,
        points: standings.points,
        goalsFor: standings.goalsFor,
      })
      .from(standings)
      .innerJoin(seasons, eq(seasons.id, standings.seasonId))
      .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
      .where(and(eq(leagues.playthroughId, active.id), eq(seasons.status, 'active')))
      .orderBy(desc(standings.points), desc(standings.goalsFor));
    const idx = allRows.findIndex((r) => r.clubId === active.clubId);
    if (idx >= 0) {
      position = idx + 1;
      const me = allRows[idx]!;
      record = { wins: me.wins, draws: me.draws, losses: me.losses };
    }
  }

  return {
    user: locals.user,
    activePlaythrough: {
      ...active,
      date: weekToDate(dayPrecise),
      balanceEurK,
      isPreseason,
      matchday,
      seasonNumber,
      weekInSeason,
      standingsPosition: position,
      standingsRecord: record,
    },
    badges: {
      pendingStops: Number(pendingStops?.count ?? 0),
      unreadUrgent: Number(unreadUrgent?.count ?? 0),
      inboxUnread: Number(unreadTotal?.count ?? 0),
      pendingSponsorDecisions: Number(pendingSponsorDecisions?.count ?? 0),
      lineupHasUnavailable,
    },
  };
};

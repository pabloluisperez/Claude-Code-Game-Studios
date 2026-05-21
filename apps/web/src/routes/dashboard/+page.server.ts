import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  staffMessages,
  staff,
  fixtures,
  calendarEvents,
  clubs,
  seasons,
  leagues,
  standings,
  eq,
  and,
  or,
  gte,
  desc,
  asc,
  alias,
  loadAdvanceContext,
} from '@smt/db';
import { weekToDate } from '@smt/shared';
import { runAdvanceTickFull } from '$lib/server/advance-orchestrator';

export const load: PageServerLoad = async ({ parent, url }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false } as const;
  }

  const [latestSnapshot] = await db
    .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, activePlaythrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const recentMessages = await db
    .select({
      id: staffMessages.id,
      role: staff.role,
      tier: staff.qualityTier,
      priority: staffMessages.priority,
      content: staffMessages.content,
      week: staffMessages.week,
      isRead: staffMessages.isRead,
    })
    .from(staffMessages)
    .innerJoin(staff, eq(staff.id, staffMessages.staffId))
    .where(eq(staffMessages.playthroughId, activePlaythrough.id))
    .orderBy(desc(staffMessages.createdAt))
    .limit(10);

  // Upcoming events panel: next user fixture + next pending calendar event.
  const homeClubs = alias(clubs, 'home_c');
  const awayClubs = alias(clubs, 'away_c');

  const nextFixtures = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      matchday: fixtures.matchday,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      and(
        eq(fixtures.status, 'scheduled'),
        or(
          eq(fixtures.homeClubId, activePlaythrough.clubId),
          eq(fixtures.awayClubId, activePlaythrough.clubId),
        ),
        gte(fixtures.week, activePlaythrough.currentWeek),
      ),
    )
    .orderBy(asc(fixtures.week))
    .limit(3);

  const pendingEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, activePlaythrough.id),
        eq(calendarEvents.status, 'pending'),
        gte(calendarEvents.week, activePlaythrough.currentWeek),
      ),
    )
    .orderBy(asc(calendarEvents.week))
    .limit(3);

  // Player's standings entry — find via the active season for this playthrough
  // (don't rely on standings.updatedAt, which only gets touched on match play).
  const [activeSeasonForPlaythrough] = await db
    .select({ seasonId: seasons.id })
    .from(seasons)
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(
      and(
        eq(leagues.playthroughId, activePlaythrough.id),
        eq(seasons.status, 'active'),
      ),
    )
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  let position: number | null = null;
  let standingsCount = 0;
  const positionByClubId = new Map<string, number>();
  if (activeSeasonForPlaythrough) {
    const sameDivision = await db
      .select({ clubId: standings.clubId, points: standings.points, goalsFor: standings.goalsFor })
      .from(standings)
      .where(eq(standings.seasonId, activeSeasonForPlaythrough.seasonId))
      .orderBy(desc(standings.points), desc(standings.goalsFor));
    standingsCount = sameDivision.length;
    sameDivision.forEach((s, idx) => positionByClubId.set(s.clubId, idx + 1));
    const myIdx = sameDivision.findIndex((s) => s.clubId === activePlaythrough.clubId);
    if (myIdx >= 0) position = myIdx + 1;
  }

  // Most recent past fixture for the user (used in "Week summary").
  const lastResult = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      and(
        eq(fixtures.status, 'played'),
        or(
          eq(fixtures.homeClubId, activePlaythrough.clubId),
          eq(fixtures.awayClubId, activePlaythrough.clubId),
        ),
      ),
    )
    .orderBy(desc(fixtures.week))
    .limit(1);

  const week = latestSnapshot?.week ?? activePlaythrough.currentWeek;

  return {
    hasPlaythrough: true as const,
    worldState: (latestSnapshot?.worldState ?? null) as Record<string, number> | null,
    week,
    weekDate: weekToDate(week),
    messages: recentMessages,
    nextFixtures: nextFixtures.map((f) => {
      const isHome = f.homeClubId === activePlaythrough.clubId;
      const opponentClubId = isHome ? f.awayClubId : f.homeClubId;
      return {
        ...f,
        date: weekToDate(f.week),
        isHome,
        opponentName: isHome ? f.awayName : f.homeName,
        opponentPosition: positionByClubId.get(opponentClubId) ?? null,
      };
    }),
    pendingEvents: pendingEvents.map((e) => ({ ...e, date: weekToDate(e.week) })),
    position,
    standingsCount,
    // Bug B4 (playtest 2026-05-21 Pablo): consumers (headlines) use this flag
    // to suppress position-based copy until at least one league match has
    // been played — pre-kickoff the standings sort alphabetically/seed-order
    // and any position-based headline ('Real Madrid (1º) demuestra...') breaks
    // immersion.
    hasPlayedFixture: lastResult.length > 0,
    lastResult: lastResult[0]
      ? (() => {
          const f = lastResult[0]!;
          const isHome = f.homeClubId === activePlaythrough.clubId;
          const myScore = isHome ? f.homeScore : f.awayScore;
          const oppScore = isHome ? f.awayScore : f.homeScore;
          const opponentName = isHome ? f.awayName : f.homeName;
          let outcome: 'win' | 'draw' | 'loss' | null = null;
          if (myScore !== null && oppScore !== null) {
            outcome = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'draw';
          }
          return {
            id: f.id,
            week: f.week,
            isHome,
            opponentName,
            myScore,
            oppScore,
            outcome,
            date: weekToDate(f.week),
          };
        })()
      : null,
    justAdvanced: url.searchParams.get('advanced') === '1',
  };
};

export const actions: Actions = {
  /**
   * Advance one in-game week. Delegates the full pipeline to
   * `runAdvanceTickFull` (Sprint 11 task 11-2 extraction) and only handles
   * the SvelteKit redirect based on the orchestrator's `next` decision.
   *
   * The pipeline orchestrated by `runAdvanceTickFull`:
   *   1. TV pre-phase + cascade tick + TV post-phase + season-ticket drip
   *   2. Economy tick (sponsors, wages, gate receipts, TV revenue)
   *   3. Atomic persist: snapshot + currentWeek + TV side-effects
   *   4. Match-day simulation
   *   5. Staff messages (threshold + ambient + pretemporada reminder)
   *   6. Manager XP grant
   *   7. Career milestone detection
   *   8. Season rollover (if endWeek crossed)
   *
   * See apps/web/src/lib/server/advance-orchestrator.ts for the full
   * rationale, including the deviation from the Sprint 11 plan (HTTP
   * route + cross-app refactor deferred to Sprint 12+).
   */
  advance: async ({ locals, request }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const redirectMode = String(form.get('redirectMode') ?? 'dashboard');

    const ctx = await loadAdvanceContext(db, locals.user.id);
    if (!ctx) return fail(400, { error: 'No hay carrera activa.' });

    const result = await runAdvanceTickFull({
      ctx,
      redirectMode:
        redirectMode === 'autoplay' || redirectMode === 'skip'
          ? redirectMode
          : 'dashboard',
    });

    switch (result.next.type) {
      case 'season-end':
        throw redirect(303, `/season-end?from=${result.next.fromSeason}`);
      case 'match': {
        const qs = result.next.mode === 'autoplay' ? 'autoplay=1' : 'skipToEnd=1';
        throw redirect(303, `/match/${result.next.matchId}?${qs}&return=dashboard`);
      }
      case 'dashboard':
      default:
        throw redirect(303, '/dashboard?advanced=1');
    }
  },
};

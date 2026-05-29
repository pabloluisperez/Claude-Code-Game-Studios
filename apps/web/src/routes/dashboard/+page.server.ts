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
import { weekToDate, dayOfSeasonToDate } from '@smt/shared';
import {
  advanceDays,
  daysUntilNextBoundary,
} from '$lib/server/advance-orchestrator';
import { checkLimit, RATE_LIMITS } from '$lib/server/rate-limit';

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

  // Pablo 2026-05-26: real fitness from players (not the stuck cascade node).
  // Compute squad avg + starters avg (top 11 by skill as a proxy for the XI).
  const { players: playersTable, clubs: clubsTable } = await import('@smt/db');
  const rosterFitness = await db
    .select({ fitness: playersTable.fitness, skill: playersTable.skill })
    .from(playersTable)
    .where(eq(playersTable.clubId, activePlaythrough.clubId));
  const [clubLineup] = await db
    .select({ ids: clubsTable.startingLineupPlayerIds })
    .from(clubsTable)
    .where(eq(clubsTable.id, activePlaythrough.clubId))
    .limit(1);
  const squadCount = rosterFitness.length;
  const squadFitnessAvg =
    squadCount > 0 ? Math.round(rosterFitness.reduce((s, p) => s + p.fitness, 0) / squadCount) : 0;
  // Starters: top 11 by skill (proxy for the XI when no manual lineup details here).
  const startersFitnessAvg = (() => {
    const top = [...rosterFitness].sort((a, b) => b.skill - a.skill).slice(0, 11);
    if (top.length === 0) return 0;
    return Math.round(top.reduce((s, p) => s + p.fitness, 0) / top.length);
  })();

  // Latest message PER staff member (Pablo 2026-05-29 redesign): the dashboard
  // shows one speech bubble per employee with their most recent check-in, not a
  // chronological week-by-week list. Fetch a window, then keep the newest row
  // per staffId; sort attention-worthy (bad/urgent) first.
  const messageWindow = await db
    .select({
      staffId: staffMessages.staffId,
      name: staff.name,
      role: staff.role,
      priority: staffMessages.priority,
      templateKey: staffMessages.templateKey,
      content: staffMessages.content,
      week: staffMessages.week,
      isRead: staffMessages.isRead,
    })
    .from(staffMessages)
    .innerJoin(staff, eq(staff.id, staffMessages.staffId))
    .where(eq(staffMessages.playthroughId, activePlaythrough.id))
    .orderBy(desc(staffMessages.createdAt))
    .limit(60);

  const BAD_RE = /(:0$|low_stock|stock_low|warning|crisis|frozen|expired|relegat|descenso|scandal)/i;
  const byStaff = new Map<string, (typeof messageWindow)[number]>();
  for (const m of messageWindow) if (!byStaff.has(m.staffId)) byStaff.set(m.staffId, m);
  const score = (m: (typeof messageWindow)[number]) =>
    BAD_RE.test(m.templateKey ?? '') ? 2 : m.priority === 'URGENT' ? 1 : 0;
  const recentMessages = [...byStaff.values()].sort((a, b) => score(b) - score(a) || b.week - a.week);

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

  // Sprint 12 task 12-2: expose the day cursor inside the current week so
  // the AdvanceTransition modal can resume from the day a STOP halted at.
  // `currentDayOfSeason % 7` gives the day-in-week (0=Mon..6=Sun). When the
  // player is at a clean week boundary it's 0 and the modal starts from
  // scratch; mid-week (post-STOP) it's >0 and the modal jumps ahead.
  const currentDayOfSeason =
    activePlaythrough.currentDayOfSeason ?? activePlaythrough.currentWeek * 7;
  const dayInWeek = currentDayOfSeason % 7;

  // Sprint 12 walkthrough fix (Pablo Part B): the AdvanceTransition modal
  // animates 7 days locally and submits at day 7. When a STOP event is
  // scheduled mid-week, the server halts but the modal had already gone
  // all the way to Sunday — misleading the player. We pre-compute the
  // next STOP day in the current week range and pass it to the modal so
  // the animation halts at the same day the server will.
  const nextStops = await db
    .select({
      id: calendarEvents.id,
      week: calendarEvents.week,
      scheduledDayOfSeason: calendarEvents.scheduledDayOfSeason,
      type: calendarEvents.type,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, activePlaythrough.id),
        eq(calendarEvents.status, 'pending'),
        eq(calendarEvents.priority, 'STOP'),
      ),
    );

  const weekStart = activePlaythrough.currentWeek * 7;
  const weekEnd = weekStart + 7;
  let haltAtDayOfWeek: number | null = null;
  for (const ev of nextStops) {
    const eventDay = ev.scheduledDayOfSeason ?? ev.week * 7;
    if (eventDay > currentDayOfSeason && eventDay <= weekEnd) {
      const dayOfWeek = eventDay - weekStart;
      if (haltAtDayOfWeek === null || dayOfWeek < haltAtDayOfWeek) {
        haltAtDayOfWeek = dayOfWeek;
      }
    }
  }

  // Sprint 12 walkthrough fix (Pablo Part B): today-precise date for the
  // hero + STOP banner. When at a clean week boundary, equals weekDate;
  // mid-week (post-STOP) it advances to the actual day-of-week date.
  const todayPrecise = dayOfSeasonToDate(currentDayOfSeason);

  return {
    hasPlaythrough: true as const,
    worldState: (latestSnapshot?.worldState ?? null) as Record<string, number> | null,
    squadFitnessAvg,
    startersFitnessAvg,
    squadCount,
    week,
    weekDate: weekToDate(week),
    todayPrecise,
    currentDayOfSeason,
    dayInWeek,
    daysRemaining: dayInWeek === 0 ? 7 : 7 - dayInWeek,
    haltAtDayOfWeek,
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
            // Playtest PT-3 fix (Pablo Sprint 12): expose raw home/away
            // scores so the display can ALWAYS render "home-away" order
            // regardless of whether the user is home or away. The
            // outcome badge (win/draw/loss) still uses myScore vs
            // oppScore — that semantic is user-relative.
            homeScore: f.homeScore,
            awayScore: f.awayScore,
            homeName: f.homeName,
            awayName: f.awayName,
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
   * Advance one in-game week (or stop mid-week on a STOP event).
   *
   * Sprint 12 task 12-1: delegates to `advanceDays` instead of
   * `runAdvanceTickFull` directly. The function computes
   * `daysUntilNextBoundary` from the current day-of-season cursor so
   * each click commits at most one week — supporting the resume-after-
   * STOP-event flow without requiring multi-week orchestration.
   *
   * The pipeline (when no STOP fires):
   *   1. TV pre-phase + cascade tick + TV post-phase + season-ticket drip
   *   2. Economy tick (sponsors, wages, gate receipts, TV revenue)
   *   3. Atomic persist: snapshot + currentWeek + TV side-effects
   *   4. Match-day simulation
   *   5. Staff messages (threshold + ambient + pretemporada reminder)
   *   6. Manager XP grant
   *   7. Career milestone detection
   *   8. Season rollover (if endWeek crossed)
   *
   * On STOP halt mid-week: only the day cursor advances; cascade/economy
   * stay frozen until the player resolves the event and clicks again.
   *
   * See apps/web/src/lib/server/advance-orchestrator.ts.
   */
  advance: async ({ locals, request, getClientAddress }) => {
    if (!locals.user) throw redirect(303, '/login');

    // Per-user rate limit: 60 advances per 60s. Defends against accidental
    // double-submit, scripted spam, and protects the orchestrator (which
    // writes snapshots + enqueues match workers) from runaway load.
    const limiterKey = `advance:${locals.user.id}`;
    const verdict = checkLimit(limiterKey, RATE_LIMITS.advance);
    if (!verdict.allowed) {
      return fail(429, {
        error: `Demasiadas peticiones. Espera ${verdict.retryAfterSec}s.`,
        retryAfterSec: verdict.retryAfterSec,
      });
    }

    // getClientAddress is logged for ops audit; the limiter keys by user.id
    // so anonymous spoofing of x-forwarded-for cannot bypass the cap.
    void getClientAddress;

    const form = await request.formData();
    const redirectModeRaw = String(form.get('redirectMode') ?? 'dashboard');
    const redirectMode: 'dashboard' | 'autoplay' | 'skip' =
      redirectModeRaw === 'autoplay' || redirectModeRaw === 'skip'
        ? redirectModeRaw
        : 'dashboard';

    const ctx = await loadAdvanceContext(db, locals.user.id);
    if (!ctx) return fail(400, { error: 'No hay carrera activa.' });

    // Compute days remaining until the next week boundary. If the player
    // is mid-week (resumed after a STOP event), this is < 7. If they're
    // at a clean boundary, it's 7.
    const cursorDay =
      ctx.playthrough.currentDayOfSeason ?? ctx.playthrough.currentWeek * 7;
    const daysToAdvance = daysUntilNextBoundary(cursorDay);

    const result = await advanceDays({ ctx, daysToAdvance, redirectMode });

    switch (result.next.type) {
      case 'stop-event':
        // The orchestrator halted mid-week on a STOP event. Redirect back
        // to the dashboard so the calendar/inbox panel surfaces the event
        // and the player can decide. The next "Avanzar semana" click will
        // resume from the halted day.
        throw redirect(
          303,
          `/dashboard?stop_event=${result.next.eventId}&day=${result.next.day}`,
        );
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

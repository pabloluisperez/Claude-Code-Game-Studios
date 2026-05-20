import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  staffMessages,
  staff,
  playthroughs,
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
} from '@smt/db';
import {
  CASCADA_FC_GRAPH,
  createSeededRng,
  defaultWorldState,
  generateStaffMessages,
  runTick,
  weekToDate,
  type DelayedEffectsBuffer,
  type StaffRole,
  type StaffQualityTier,
  type WorldState,
} from '@smt/shared';
import { popEffectsDueAt } from '@smt/shared/sim/delayed-effects';
import { runMatchDay } from '$lib/server/match-day-runner';
import { applyEconomyTick } from '$lib/server/economy-tick';
import { checkAndRolloverSeason } from '$lib/server/season-rollover';
import { detectAndPersistMilestones } from '$lib/server/milestones';
import { grantWeeklyManagerXp } from '$lib/server/manager-xp';
import { maybePaySeasonTickets } from '$lib/server/season-tickets';

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
  if (activeSeasonForPlaythrough) {
    const sameDivision = await db
      .select({ clubId: standings.clubId, points: standings.points, goalsFor: standings.goalsFor })
      .from(standings)
      .where(eq(standings.seasonId, activeSeasonForPlaythrough.seasonId))
      .orderBy(desc(standings.points), desc(standings.goalsFor));
    standingsCount = sameDivision.length;
    const idx = sameDivision.findIndex((s) => s.clubId === activePlaythrough.clubId);
    if (idx >= 0) position = idx + 1;
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
    nextFixtures: nextFixtures.map((f) => ({
      ...f,
      date: weekToDate(f.week),
      isHome: f.homeClubId === activePlaythrough.clubId,
      opponentName: f.homeClubId === activePlaythrough.clubId ? f.awayName : f.homeName,
    })),
    pendingEvents: pendingEvents.map((e) => ({ ...e, date: weekToDate(e.week) })),
    position,
    standingsCount,
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
   * Advance one in-game week. Composes:
   *  - cascade tick (runTick) on the prevState
   *  - economy tick (sponsor + staff + player aggregates → balance)
   *  - match-day simulation (all scheduled fixtures for the week)
   *  - staff message generation from the worldState diff
   *  - end-of-season rollover (if we crossed the season's endWeek)
   *
   * Redirects back to /dashboard?advanced=1 so the page can show the
   * weekly summary panel.
   */
  advance: async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);

    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const [latest] = await db
      .select()
      .from(worldSnapshots)
      .where(eq(worldSnapshots.playthroughId, active.id))
      .orderBy(desc(worldSnapshots.week))
      .limit(1);

    const basePrevState: Readonly<WorldState> =
      (latest?.worldState as WorldState) ?? defaultWorldState();
    const prevBuffer: DelayedEffectsBuffer = (latest?.delayedEffectsBuffer ??
      []) as DelayedEffectsBuffer;

    // Inject the user-chosen training intensity into the prevState so the
    // cascade reads it as the manager decision for this tick.
    const prevState: Readonly<WorldState> = {
      ...(basePrevState as Record<string, number>),
      training_intensity: active.trainingIntensity ?? 50,
    } as unknown as WorldState;

    const nextWeek = (latest?.week ?? -1) + 1;

    // 1. Cascade tick
    const result = runTick(
      {
        rng: createSeededRng(`${active.id}:${nextWeek}`),
        currentWeek: nextWeek,
        hasMatchThisWeek: false,
        prevState,
      },
      CASCADA_FC_GRAPH,
      prevState,
      [],
      prevBuffer,
    );

    // 1b. Season-ticket lump-sum, if we just entered a new season. Bumps
    // the balance directly (one-off injection, not weekly recurring).
    const ticketPayment = await maybePaySeasonTickets({
      playthroughId: active.id,
      clubId: active.clubId,
      currentWeek: nextWeek,
    });
    const stateAfterTickets = ticketPayment.paid
      ? ({
          ...(result.nextState as Record<string, number>),
          financial_balance:
            ((result.nextState as Record<string, number>)['financial_balance'] ?? 0) +
            (ticketPayment.totalEurK ?? 0),
        } as typeof result.nextState)
      : result.nextState;

    // 2. Economy tick on top of cascade output (+ ticket bump)
    const eco = await applyEconomyTick({
      playthroughId: active.id,
      clubId: active.clubId,
      baseState: stateAfterTickets,
    });

    const { remaining } = popEffectsDueAt(prevBuffer, nextWeek);
    const nextBuffer: DelayedEffectsBuffer = [...remaining, ...result.newDelayedEffects];

    // 3. Persist new snapshot + bump currentWeek
    await db.transaction(async (tx) => {
      await tx.insert(worldSnapshots).values({
        playthroughId: active.id,
        week: nextWeek,
        worldState: eco.patchedState,
        delayedEffectsBuffer: nextBuffer,
      });
      await tx
        .update(playthroughs)
        .set({ currentWeek: nextWeek, updatedAt: new Date() })
        .where(eq(playthroughs.id, active.id));
    });

    // 4. Match-day simulation
    const matchDay = await runMatchDay({ playthroughId: active.id, week: nextWeek });

    // 5. Staff message generation
    const activeStaff = await db
      .select({
        id: staff.id,
        role: staff.role,
        qualityTier: staff.qualityTier,
        name: staff.name,
      })
      .from(staff)
      .where(and(eq(staff.playthroughId, active.id), eq(staff.status, 'active')));

    if (activeStaff.length > 0) {
      const worldStateDiff: Record<string, { prev: number; next: number }> = {};
      for (const key of Object.keys(eco.patchedState)) {
        const prev = (prevState as Record<string, number>)[key] ?? 0;
        const next = (eco.patchedState as Record<string, number>)[key] ?? 0;
        if (prev !== next) worldStateDiff[key] = { prev, next };
      }

      const generated = generateStaffMessages({
        staff: activeStaff.map((s) => ({
          id: s.id,
          role: s.role as StaffRole,
          qualityTier: s.qualityTier as StaffQualityTier,
        })),
        worldStateDiff,
        thresholdCrossings: result.thresholdCrossings,
      });

      if (generated.length > 0) {
        // Look up the active season to tag messages with the right season number.
        const [activeSeason] = await db
          .select({ seasonNumber: seasons.seasonNumber })
          .from(seasons)
          .innerJoin(
            // Sub-select to constrain by playthrough's leagues — simpler: use any active season.
            seasons,
            eq(seasons.status, 'active'),
          )
          .limit(1)
          .catch(() => [{ seasonNumber: 1 }] as Array<{ seasonNumber: number }>);

        // Prefix each message with the staff member's name + role label so
        // the dashboard shows a proper "Marta (preparadora física): ..." voice
        // instead of bare templates.
        const ROLE_LABEL: Readonly<Record<string, string>> = {
          groundskeeper: 'jardinero',
          fitness_coach: 'preparador físico',
          commercial_director: 'director comercial',
          scouting_director: 'director de scouting',
          finance_director: 'director financiero',
          head_coach: 'segundo entrenador',
        };
        const staffById = new Map(activeStaff.map((s) => [s.id, s]));

        await db.insert(staffMessages).values(
          generated.map((m) => {
            const s = staffById.get(m.staffId);
            const firstName = (s?.name ?? 'Staff').split(' ')[0];
            const roleLabel = ROLE_LABEL[m.role] ?? m.role;
            const verb = m.priority === 'URGENT' ? 'avisa' : 'comenta';
            const voiced = `${firstName} (${roleLabel}) ${verb}: ${m.content}`;
            return {
              playthroughId: active.id,
              staffId: m.staffId,
              week: nextWeek,
              season: activeSeason?.seasonNumber ?? 1,
              priority: m.priority,
              templateKey: m.templateKey,
              content: voiced,
              isRead: false,
            };
          }),
        );
      }
    }

    // 6. Manager XP grants from this week's outcome.
    await grantWeeklyManagerXp({
      playthroughId: active.id,
      clubId: active.clubId,
      week: nextWeek,
    });

    // 7. Career milestones — append-only "firsts" log.
    await detectAndPersistMilestones({
      playthroughId: active.id,
      clubId: active.clubId,
    });

    // 7. Season rollover (if needed)
    const rollover = await checkAndRolloverSeason({
      playthroughId: active.id,
      currentWeek: nextWeek,
    });

    if (rollover.rolledOver) {
      // Redirect to season-end recap before continuing.
      throw redirect(303, `/season-end?from=${rollover.fromSeason}`);
    }

    // Land back on the dashboard with the weekly summary. If the user
    // played, the dashboard's `lastResult` card surfaces two CTAs:
    // "Ir a partido" (autoplay replay) and "Solo resultado" (skip-to-end).
    throw redirect(303, '/dashboard?advanced=1');
  },
};

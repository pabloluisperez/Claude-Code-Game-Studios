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
  loadAdvanceContext,
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
import {
  persistTVTickEffects,
  runTVPostPhase,
  runTVPrePhase,
} from '$lib/server/tv-rights-tick';
import { checkAndRolloverSeason } from '$lib/server/season-rollover';
import { detectAndPersistMilestones } from '$lib/server/milestones';
import { grantWeeklyManagerXp } from '$lib/server/manager-xp';
import { maybeDripSeasonTickets } from '$lib/server/season-tickets';
import { generateAmbientStaffMessages } from '$lib/server/ambient-staff';

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
  advance: async ({ locals, request }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const redirectMode = String(form.get('redirectMode') ?? 'dashboard');

    // Sprint 9 task 9-1 (partial): consolidated context loader from @smt/db.
    // Replaces the 4 sequential SELECTs that used to live here. Same behavior;
    // single helper call.
    const ctx = await loadAdvanceContext(db, locals.user.id);
    if (!ctx) return fail(400, { error: 'No hay carrera activa.' });

    const active = ctx.playthrough;
    const basePrevState = ctx.prevState;
    const prevBuffer = ctx.prevBuffer;

    // Inject the user-chosen training intensity into the prevState so the
    // cascade reads it as the manager decision for this tick.
    const prevState: Readonly<WorldState> = {
      ...(basePrevState as Record<string, number>),
      training_intensity: active.trainingIntensity ?? 50,
    } as unknown as WorldState;

    const nextWeek = ctx.latestWeek + 1;
    const currentDivision = ctx.currentDivision;
    const tvCurrentSeason = ctx.currentSeason;

    // ── TV PRE-PHASE (Tick Order pasos 1-5) — runs BEFORE cascade ──────────
    const prevCorruption =
      (prevState as Record<string, number>)['corruption_exposure'] ?? 0;
    const tvPre = await runTVPrePhase({
      playthroughId: active.id,
      week: nextWeek,
      season: tvCurrentSeason,
      currentDivision,
      prevCorruption,
    });

    // Inject TV-adjusted corruption into cascade prevState so the cascade
    // sees the post-F-TV3 value when it computes its own deltas.
    const prevStateForCascade: Readonly<WorldState> = {
      ...(prevState as Record<string, number>),
      corruption_exposure: tvPre.corruptionAfterTV,
    } as unknown as WorldState;

    // 1. Cascade tick
    const result = runTick(
      {
        rng: createSeededRng(`${active.id}:${nextWeek}`),
        currentWeek: nextWeek,
        hasMatchThisWeek: false,
        prevState: prevStateForCascade,
      },
      CASCADA_FC_GRAPH,
      prevStateForCascade,
      [],
      prevBuffer,
    );

    // ── TV POST-PHASE (Tick Order pasos 6-8) — runs AFTER cascade ──────────
    // Cascade's effect on corruption = nextState.corruption_exposure - corruptionAfterTV
    const corruptionAfterCascade =
      (result.nextState as Record<string, number>)['corruption_exposure'] ?? tvPre.corruptionAfterTV;
    const externalDelta = corruptionAfterCascade - tvPre.corruptionAfterTV;
    const tvPost = runTVPostPhase(
      {
        playthroughId: active.id,
        week: nextWeek,
        season: tvCurrentSeason,
        currentDivision,
        prevCorruption,
      },
      tvPre,
      externalDelta,
    );

    // Patch the cascade's nextState with the post-phase final corruption value
    // (paso 6 clamping + roundCorruption may differ slightly from cascade's
    // free-running value).
    (result.nextState as Record<string, number>)['corruption_exposure'] = tvPost.finalCorruption;

    // 1b. Season-ticket weekly drip. New abonados sign up each week from
    // the price-lock week through jornada 3 with a declining curve.
    const ticketDrip = await maybeDripSeasonTickets({
      playthroughId: active.id,
      clubId: active.clubId,
      currentWeek: nextWeek,
    });
    const stateAfterTickets = ticketDrip.paid
      ? ({
          ...(result.nextState as Record<string, number>),
          financial_balance:
            ((result.nextState as Record<string, number>)['financial_balance'] ?? 0) +
            (ticketDrip.weeklyEurK ?? 0),
        } as typeof result.nextState)
      : result.nextState;

    // If new abonados arrived this week, drop a finance/fan headline as a
    // staff message so the user sees the signup wave.
    if (ticketDrip.paid && ticketDrip.newHolders && ticketDrip.newHolders > 0) {
      const [commercial] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(
          and(
            eq(staff.playthroughId, active.id),
            eq(staff.role, 'commercial_director'),
            eq(staff.status, 'active'),
          ),
        )
        .limit(1);
      if (commercial) {
        await db.insert(staffMessages).values({
          playthroughId: active.id,
          staffId: commercial.id,
          week: nextWeek,
          season: 1,
          priority: 'ROUTINE',
          templateKey: 'commercial:abono_signup',
          content: `Director comercial comenta: esta semana se sumaron ${ticketDrip.newHolders} nuevos abonados (+${ticketDrip.weeklyEurK} €K).`,
          isRead: false,
        });
      }
    }

    // 2. Detect a HOME fixture for this week so gate-receipts feed cashflow.
    //    Division mapping for ticket-price math: only D1 ('first') uses the
    //    Primera tier; everything below (incl. Quinta) is treated as tier 2.
    const [homeFixtureRow] = await db
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.week, nextWeek),
          eq(fixtures.homeClubId, active.clubId),
        ),
      )
      .limit(1);
    const [clubRow] = await db
      .select({ division: clubs.division })
      .from(clubs)
      .where(eq(clubs.id, active.clubId))
      .limit(1);
    const divisionTier: 1 | 2 = clubRow?.division === 'first' ? 1 : 2;

    // 3. Economy tick on top of cascade output (+ ticket bump + gate receipts + TV)
    const eco = await applyEconomyTick({
      playthroughId: active.id,
      clubId: active.clubId,
      baseState: stateAfterTickets,
      homeFixtureThisWeek: !!homeFixtureRow,
      divisionTier,
      tvWeeklyEurK: tvPre.revenue,
      fanLoyalty: tvPre.fanLoyalty,
    });

    const { remaining } = popEffectsDueAt(prevBuffer, nextWeek);
    const nextBuffer: DelayedEffectsBuffer = [...remaining, ...result.newDelayedEffects];

    // 4. Persist new snapshot + bump currentWeek + TV side-effects
    // Sprint 8 task 8-8: include cascade_log + threshold_crossings audit trail
    // in the snapshot payload (per schema additions from task 8-1). These
    // columns are NULLABLE; older callers still work, but the dashboard
    // advance path now backs the audit consumers (event-system future work).
    await db.transaction(async (tx) => {
      await tx.insert(worldSnapshots).values({
        playthroughId: active.id,
        week: nextWeek,
        worldState: eco.patchedState,
        delayedEffectsBuffer: nextBuffer,
        cascadeLog: result.log as unknown as Record<string, unknown>[],
        thresholdCrossings: result.thresholdCrossings as unknown as Record<string, unknown>[],
        // seedState is NULL for cascade-only ticks; populated by match-sim
        // path (ADR-013) when match-weeks add their PRNG state. The dashboard
        // path does not own match PRNG state — leave NULL.
      });
      await tx
        .update(playthroughs)
        .set({ currentWeek: nextWeek, updatedAt: new Date() })
        .where(eq(playthroughs.id, active.id));

      // Persist TV contract status transitions + insert any midseason offer
      // STOP event (idempotent via partial UNIQUE on calendar_events).
      await persistTVTickEffects(
        tx,
        {
          playthroughId: active.id,
          week: nextWeek,
          season: tvCurrentSeason,
          currentDivision,
          prevCorruption,
        },
        tvPre,
        tvPost,
      );
    });

    // 5. Match-day simulation
    const matchDay = await runMatchDay({ playthroughId: active.id, week: nextWeek });

    // 6. Staff message generation
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

      const voicedThresholdMessages = generated.map((m) => {
        const s = staffById.get(m.staffId);
        const firstName = (s?.name ?? 'Staff').split(' ')[0];
        const roleLabel = ROLE_LABEL[m.role] ?? m.role;
        const verb = m.priority === 'URGENT' ? 'avisa' : 'comenta';
        const voiced = `${firstName} (${roleLabel}) ${verb}: ${m.content}`;
        return {
          playthroughId: active.id,
          staffId: m.staffId,
          week: nextWeek,
          season: 1,
          priority: m.priority,
          templateKey: m.templateKey,
          content: voiced,
          isRead: false,
        };
      });

      // Ambient weekly check-ins so every staff member says something even
      // if no thresholds were crossed. Tags as templateKey 'ambient:*' to
      // dedupe (one per role per week) and skip staff who already produced
      // a threshold message this tick.
      const rolesAlreadyVocal = new Set(voicedThresholdMessages.map((m) => m.staffId));
      const ambientMsgs = generateAmbientStaffMessages({
        activeStaff: activeStaff
          .filter((s) => !rolesAlreadyVocal.has(s.id))
          .map((s) => ({
            id: s.id,
            role: s.role,
            qualityTier: s.qualityTier as number,
            name: s.name,
          })),
        worldState: eco.patchedState,
      });
      const ambientRows = ambientMsgs.map((m) => ({
        playthroughId: active.id,
        staffId: m.staffId,
        week: nextWeek,
        season: 1,
        priority: m.priority,
        templateKey: m.templateKey,
        content: m.content,
        isRead: false,
      }));

      const allRows = [...voicedThresholdMessages, ...ambientRows];
      if (allRows.length > 0) {
        await db.insert(staffMessages).values(allRows);
      }
    }

    // 5b. Pretemporada reminder: 2 weeks before kickoff, finance director
    // pings the manager about adjusting the abono price. Only emits once
    // per (season, week) pair via UNIQUE templateKey + week dedup.
    const [activeStaffFinance] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.playthroughId, active.id),
          eq(staff.role, 'finance_director'),
          eq(staff.status, 'active'),
        ),
      )
      .limit(1);

    if (activeStaffFinance) {
      const [activeSeasonRow] = await db
        .select({ startWeek: seasons.startWeek, seasonNumber: seasons.seasonNumber })
        .from(seasons)
        .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
        .where(
          and(
            eq(leagues.playthroughId, active.id),
            eq(seasons.status, 'active'),
          ),
        )
        .orderBy(desc(seasons.seasonNumber))
        .limit(1);

      if (activeSeasonRow) {
        const weeksLeft = activeSeasonRow.startWeek - nextWeek;
        if (weeksLeft === 2) {
          await db
            .insert(staffMessages)
            .values({
              playthroughId: active.id,
              staffId: activeStaffFinance.id,
              week: nextWeek,
              season: activeSeasonRow.seasonNumber,
              priority: 'URGENT',
              templateKey: 'finance:abono_reminder',
              content:
                'Director financiero avisa: quedan 2 semanas para el inicio de la temporada. Revisa el precio del abono en Finanzas antes de que cierre la pretemporada.',
              isRead: false,
            })
            .onConflictDoNothing();
        }
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

    // Redirect based on the mode the user chose in the AdvanceTransition
    // modal. If they picked "vivir" or "saltar" and there's a user match,
    // jump straight to /match/[id]. Otherwise back to dashboard.
    if (redirectMode === 'autoplay' || redirectMode === 'skip') {
      const userFixture = await db
        .select({ id: fixtures.id })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.week, nextWeek),
            eq(fixtures.status, 'played'),
            or(
              eq(fixtures.homeClubId, active.clubId),
              eq(fixtures.awayClubId, active.clubId),
            ),
          ),
        )
        .limit(1);
      if (userFixture[0]) {
        const qs = redirectMode === 'autoplay' ? 'autoplay=1' : 'skipToEnd=1';
        throw redirect(303, `/match/${userFixture[0].id}?${qs}&return=dashboard`);
      }
    }

    throw redirect(303, '/dashboard?advanced=1');
  },
};

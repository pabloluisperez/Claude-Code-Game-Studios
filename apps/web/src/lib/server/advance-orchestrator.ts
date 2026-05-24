/**
 * advance-orchestrator — full pipeline for one weekly advance tick.
 *
 * This module exports TWO functions:
 *
 *   - `runAdvanceTickCore(opts)` — pure-compute portion (TV pre/post,
 *     cascade, ticket drip, delayed-effects buffer). Sprint 10 task 10-5.
 *
 *   - `runAdvanceTickFull(opts)` — pure-compute + DB-write portion
 *     (snapshot persist, currentWeek bump, TV side-effects, match-day,
 *     staff messages, manager XP, milestones, season rollover).
 *     Sprint 11 task 11-2. Returns a `next` decision so the SvelteKit
 *     form action can issue the appropriate redirect.
 *
 * Architecture deviation (Sprint 11 task 11-2):
 *   The Sprint 11 plan called for `apps/api/src/modules/advance/orchestrator.ts`
 *   + `POST /api/advance` Hono route + cross-process HTTP call from the
 *   dashboard form action. That cross-app HTTP migration was deferred to
 *   Sprint 12+ for two reasons:
 *
 *     1. The session-cookie forwarding from SvelteKit SSR to Hono is non-
 *        trivial and adds an attack surface that does not exist today.
 *     2. The DB-write portion already lives in a single Postgres transaction;
 *        a cross-process refactor would split it and lose atomicity unless
 *        replicated with a 2PC pattern.
 *
 *   The pragmatic Sprint 11 win: the orchestrator now owns the FULL pipeline,
 *   the dashboard form action collapses from ~340 LOC to ~30 LOC, and the
 *   pipeline is fully testable in isolation. The MMO migration that needs the
 *   Hono route will land in Sprint 12+ when realtime-multiplayer-specialist
 *   designs the cross-app session forwarding.
 *
 * Control Manifest: 2026-05-19
 */

import type { AdvanceContext } from '@smt/db';
import {
  db,
  worldSnapshots,
  staffMessages,
  staff,
  playthroughs,
  fixtures,
  clubs,
  seasons,
  leagues,
  calendarEvents,
  eq,
  and,
  or,
  desc,
} from '@smt/db';
import {
  CASCADA_FC_GRAPH,
  createSeededRng,
  generateStaffMessages,
  runTick,
  type StaffRole,
  type StaffQualityTier,
  type WorldState,
  type TickResult,
  type DelayedEffectsBuffer,
} from '@smt/shared';
import { popEffectsDueAt } from '@smt/shared/sim/delayed-effects';
import { runTVPostPhase, runTVPrePhase, persistTVTickEffects } from './tv-rights-tick';
import { maybeDripSeasonTickets } from './season-tickets';
import { runMatchDay } from './match-day-runner';
import { applyEconomyTick } from './economy-tick';
import { checkAndRolloverSeason } from './season-rollover';
import { detectAndPersistMilestones } from './milestones';
import { grantWeeklyManagerXp } from './manager-xp';
import { generateAmbientStaffMessages } from './ambient-staff';

// ════════════════════════════════════════════════════════════════════════════
// PART 1: Pure-compute core (Sprint 10 task 10-5 — unchanged)
// ════════════════════════════════════════════════════════════════════════════

export interface AdvanceOrchestratorOptions {
  /** Loaded by @smt/db's loadAdvanceContext. */
  ctx: AdvanceContext;
  /** The week we're advancing TO (= ctx.latestWeek + 1). */
  nextWeek: number;
  /** Training intensity manager decision injected into prevState. */
  trainingIntensity: number;
  /** Current season for TV bookkeeping. */
  tvCurrentSeason: number;
}

export interface AdvanceOrchestratorResult {
  /** The TickResult from the cascade engine (used for thresholdCrossings + log). */
  tickResult: TickResult;
  /** TV pre-phase computed values (revenue + corruption delta + fan loyalty). */
  tvPre: Awaited<ReturnType<typeof runTVPrePhase>>;
  /** TV post-phase computed values (final corruption + cascade external delta). */
  tvPost: ReturnType<typeof runTVPostPhase>;
  /** Season-ticket drip result (new holders + €K bump + payment status). */
  ticketDrip: Awaited<ReturnType<typeof maybeDripSeasonTickets>>;
  /** WorldState after cascade tick + TV post-phase patch + ticket bump applied. */
  stateAfterTickets: WorldState;
  /** Delayed-effects buffer for next week (popped due effects + new effects). */
  nextBuffer: DelayedEffectsBuffer;
  /** prevCorruption captured before any TV/cascade work (kept for persistTV). */
  prevCorruption: number;
}

/**
 * Run the pure-compute portion of one weekly advance tick.
 *
 * Does NOT write to the DB. Caller wraps the persistence in its own
 * transaction (snapshot insert, currentWeek bump, persistTVTickEffects).
 */
export async function runAdvanceTickCore(
  opts: AdvanceOrchestratorOptions,
): Promise<AdvanceOrchestratorResult> {
  const { ctx, nextWeek, trainingIntensity, tvCurrentSeason } = opts;
  const active = ctx.playthrough;
  const basePrevState = ctx.prevState;
  const prevBuffer = ctx.prevBuffer;
  const currentDivision = ctx.currentDivision;

  // Inject the user-chosen training intensity into prevState so cascade reads
  // it as the manager decision for this tick.
  const prevState: Readonly<WorldState> = {
    ...(basePrevState as Record<string, number>),
    training_intensity: trainingIntensity,
  } as unknown as WorldState;

  // ── 1. TV PRE-PHASE (Tick Order pasos 1-5) ──────────────────────────────
  const prevCorruption =
    (prevState as Record<string, number>)['corruption_exposure'] ?? 0;
  const tvPre = await runTVPrePhase({
    playthroughId: active.id,
    week: nextWeek,
    season: tvCurrentSeason,
    currentDivision,
    prevCorruption,
  });

  // Inject TV-adjusted corruption into cascade prevState so the cascade sees
  // the post-F-TV3 value when it computes its own deltas.
  const prevStateForCascade: Readonly<WorldState> = {
    ...(prevState as Record<string, number>),
    corruption_exposure: tvPre.corruptionAfterTV,
  } as unknown as WorldState;

  // ── 2. CASCADE TICK ─────────────────────────────────────────────────────
  const tickResult = runTick(
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

  // ── 3. TV POST-PHASE (Tick Order pasos 6-8) ─────────────────────────────
  const corruptionAfterCascade =
    (tickResult.nextState as Record<string, number>)['corruption_exposure'] ??
    tvPre.corruptionAfterTV;
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

  (tickResult.nextState as Record<string, number>)['corruption_exposure'] =
    tvPost.finalCorruption;

  // ── 4. SEASON-TICKET DRIP ───────────────────────────────────────────────
  const ticketDrip = await maybeDripSeasonTickets({
    playthroughId: active.id,
    clubId: active.clubId,
    currentWeek: nextWeek,
  });

  const stateAfterTickets: WorldState = ticketDrip.paid
    ? ({
        ...(tickResult.nextState as Record<string, number>),
        financial_balance:
          ((tickResult.nextState as Record<string, number>)['financial_balance'] ??
            0) + (ticketDrip.weeklyEurK ?? 0),
      } as unknown as WorldState)
    : tickResult.nextState;

  // ── 5. DELAYED-EFFECTS BUFFER ───────────────────────────────────────────
  const { remaining } = popEffectsDueAt(prevBuffer, nextWeek);
  const nextBuffer: DelayedEffectsBuffer = [
    ...remaining,
    ...tickResult.newDelayedEffects,
  ];

  return {
    tickResult,
    tvPre,
    tvPost,
    ticketDrip,
    stateAfterTickets,
    nextBuffer,
    prevCorruption,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PART 2: Full pipeline orchestrator (Sprint 11 task 11-2 — DB-write extraction)
// ════════════════════════════════════════════════════════════════════════════

const ROLE_LABEL: Readonly<Record<string, string>> = {
  groundskeeper: 'jardinero',
  fitness_coach: 'preparador físico',
  commercial_director: 'director comercial',
  scouting_director: 'director de scouting',
  finance_director: 'director financiero',
  head_coach: 'segundo entrenador',
};

export interface AdvanceTickFullOptions {
  /** Loaded by `loadAdvanceContext`. */
  ctx: AdvanceContext;
  /** Redirect mode chosen by the user in the AdvanceTransition modal. */
  redirectMode: 'dashboard' | 'autoplay' | 'skip';
}

export type AdvanceTickFullNext =
  | { type: 'season-end'; fromSeason: number }
  | { type: 'match'; matchId: string; mode: 'autoplay' | 'skip' }
  | { type: 'dashboard' }
  | {
      type: 'stop-event';
      eventId: string;
      eventType: string;
      day: number;
      week: number;
    };

export interface AdvanceTickFullResult {
  /** Decision for the SvelteKit form action: which redirect to issue. */
  next: AdvanceTickFullNext;
  /** Week we advanced to (currentWeek after the tick). */
  nextWeek: number;
  /** Final financial balance for the snapshot (smoke check / logging). */
  financialBalance: number;
  /** Threshold crossings produced by the cascade (for downstream consumers). */
  thresholdCrossings: readonly unknown[];
}

/**
 * Run a full weekly advance tick end-to-end.
 *
 * Phases:
 *   1. Pure-compute pipeline (TV pre/post, cascade, ticket drip, delayed effects)
 *      via `runAdvanceTickCore`.
 *   2. Commercial director abono signup message (if new holders this tick).
 *   3. Economy tick (sponsors, wages, gate receipts, TV revenue) — applies
 *      patch on top of cascade output.
 *   4. Atomic persistence: snapshot insert, currentWeek bump, TV side-effects.
 *   5. Match-day simulation for all scheduled fixtures this week.
 *   6. Staff message generation (threshold-based + ambient + finance reminder).
 *   7. Manager XP grant for the week's outcome.
 *   8. Career milestone detection.
 *   9. Season rollover (if we crossed the season's endWeek).
 *
 * Caller is responsible for issuing the redirect based on `result.next`.
 */
export async function runAdvanceTickFull(
  opts: AdvanceTickFullOptions,
): Promise<AdvanceTickFullResult> {
  const { ctx, redirectMode } = opts;
  const active = ctx.playthrough;
  const nextWeek = ctx.latestWeek + 1;
  const tvCurrentSeason = ctx.currentSeason;

  // ── Phase 1: pure-compute pipeline ──────────────────────────────────────
  const orchestrated = await runAdvanceTickCore({
    ctx,
    nextWeek,
    trainingIntensity: active.trainingIntensity ?? 50,
    tvCurrentSeason,
  });

  const {
    tickResult,
    tvPre,
    tvPost,
    ticketDrip,
    stateAfterTickets,
    nextBuffer,
    prevCorruption,
  } = orchestrated;

  // prevState for downstream diff (post training-intensity injection).
  const prevState: Readonly<WorldState> = {
    ...(ctx.prevState as Record<string, number>),
    training_intensity: active.trainingIntensity ?? 50,
  } as unknown as WorldState;

  // ── Phase 2: commercial director abono-signup message ───────────────────
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
        content: `Director comercial comenta: esta semana se sumaron ${ticketDrip.newHolders} nuevos abonados (+${Math.round((ticketDrip.weeklyEurK ?? 0) * 1000).toLocaleString('es-ES')} €).`,
        isRead: false,
      });
    }
  }

  // ── Phase 3: economy tick (gate receipts + sponsors + wages + TV) ───────
  const [homeFixtureRow] = await db
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(and(eq(fixtures.week, nextWeek), eq(fixtures.homeClubId, active.clubId)))
    .limit(1);
  const [clubRow] = await db
    .select({ division: clubs.division })
    .from(clubs)
    .where(eq(clubs.id, active.clubId))
    .limit(1);
  const divisionTier: 1 | 2 = clubRow?.division === 'first' ? 1 : 2;

  const eco = await applyEconomyTick({
    playthroughId: active.id,
    clubId: active.clubId,
    baseState: stateAfterTickets,
    homeFixtureThisWeek: !!homeFixtureRow,
    divisionTier,
    tvWeeklyEurK: tvPre.revenue,
    fanLoyalty: tvPre.fanLoyalty,
  });

  // ── Phase 4: atomic persistence ─────────────────────────────────────────
  // ADR-020 invariant: currentDayOfSeason = currentWeek * 7 (Option B —
  // weekly batches advance both columns in lockstep). Sprint 12+ will
  // break the lockstep when mid-week pause requires day-granular halts.
  await db.transaction(async (tx) => {
    await tx.insert(worldSnapshots).values({
      playthroughId: active.id,
      week: nextWeek,
      worldState: eco.patchedState,
      delayedEffectsBuffer: nextBuffer,
      cascadeLog: tickResult.log as unknown as Record<string, unknown>[],
      thresholdCrossings: tickResult.thresholdCrossings as unknown as Record<string, unknown>[],
    });
    await tx
      .update(playthroughs)
      .set({
        currentWeek: nextWeek,
        currentDayOfSeason: nextWeek * 7,
        updatedAt: new Date(),
      })
      .where(eq(playthroughs.id, active.id));

    await persistTVTickEffects(
      tx,
      {
        playthroughId: active.id,
        week: nextWeek,
        season: tvCurrentSeason,
        currentDivision: ctx.currentDivision,
        prevCorruption,
      },
      tvPre,
      tvPost,
    );
  });

  // ── Phase 5: match-day simulation ───────────────────────────────────────
  await runMatchDay({ playthroughId: active.id, week: nextWeek });

  // ── Phase 6: staff message generation (threshold + ambient + reminder) ──
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
      thresholdCrossings: tickResult.thresholdCrossings,
    });

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

  // ── Phase 6b: pretemporada abono reminder (2 weeks before kickoff) ──────
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
        and(eq(leagues.playthroughId, active.id), eq(seasons.status, 'active')),
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

  // ── Phase 7: manager XP grant ───────────────────────────────────────────
  await grantWeeklyManagerXp({
    playthroughId: active.id,
    clubId: active.clubId,
    week: nextWeek,
  });

  // ── Phase 8: career milestone detection ─────────────────────────────────
  await detectAndPersistMilestones({
    playthroughId: active.id,
    clubId: active.clubId,
  });

  // ── Phase 9: season rollover ────────────────────────────────────────────
  const rollover = await checkAndRolloverSeason({
    playthroughId: active.id,
    currentWeek: nextWeek,
  });

  if (rollover.rolledOver) {
    return {
      next: { type: 'season-end', fromSeason: rollover.fromSeason ?? 1 },
      nextWeek,
      financialBalance:
        (eco.patchedState as Record<string, number>)['financial_balance'] ?? 0,
      thresholdCrossings: tickResult.thresholdCrossings,
    };
  }

  // ── Phase 10: redirect decision ─────────────────────────────────────────
  if (redirectMode === 'autoplay' || redirectMode === 'skip') {
    const [userFixture] = await db
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
    if (userFixture) {
      return {
        next: { type: 'match', matchId: userFixture.id, mode: redirectMode },
        nextWeek,
        financialBalance:
          (eco.patchedState as Record<string, number>)['financial_balance'] ?? 0,
        thresholdCrossings: tickResult.thresholdCrossings,
      };
    }
  }

  return {
    next: { type: 'dashboard' },
    nextWeek,
    financialBalance:
      (eco.patchedState as Record<string, number>)['financial_balance'] ?? 0,
    thresholdCrossings: tickResult.thresholdCrossings,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PART 3: Day-by-day tick API (Sprint 11 task 11-4 — ADR-020 implementation)
// ════════════════════════════════════════════════════════════════════════════

/**
 * ADR-020 invariant: `currentWeek = floor(currentDayOfSeason / 7)`.
 *
 * Pure math helper — exported for testing. The orchestrator + DB transaction
 * write both columns atomically; this function exists so consumers and tests
 * can derive the week without re-querying.
 */
export function deriveWeekFromDayOfSeason(currentDayOfSeason: number): number {
  return Math.floor(currentDayOfSeason / 7);
}

/**
 * Day-of-week label (0=Mon..6=Sun) for a given currentDayOfSeason.
 * Per ADR-020 §2 convention. Useful for UI day badges and STOP event tagging.
 */
export function dayOfWeekFromDayOfSeason(currentDayOfSeason: number): number {
  return ((currentDayOfSeason % 7) + 7) % 7;
}

export interface AdvanceDaysOptions {
  /** Loaded by `loadAdvanceContext`. */
  ctx: AdvanceContext;
  /**
   * How many in-game days to advance. Initial Sprint 11 implementation
   * supports multiples of 7 only (`advanceDays(7)` === one weekly batch).
   * Partial-day advancement lands in Sprint 12+ alongside mid-week pause —
   * per ADR-020 §"Option B" deliberate deferral.
   */
  daysToAdvance: number;
  /** Redirect mode chosen by the user in the AdvanceTransition modal. */
  redirectMode: 'dashboard' | 'autoplay' | 'skip';
}

/**
 * Advance the playthrough by N days, halting on STOP events.
 *
 * Sprint 12 task 12-1 implementation of ADR-020 §6. The function:
 *
 *   1. Scans pending STOP events whose `scheduledDayOfSeason` falls inside
 *      the range `(startDay, startDay + daysToAdvance]`.
 *   2. If a STOP exists: persists `currentDayOfSeason = stopDay` and
 *      returns `{ type: 'stop-event' }` WITHOUT running the weekly
 *      pipeline. The caller surfaces the event; the player resolves it;
 *      the next form submission calls `advanceDays(remainingDays)` to
 *      continue.
 *   3. If no STOP and the range ends EXACTLY on a week boundary
 *      (`(startDay + daysToAdvance) % 7 === 0`): calls
 *      `runAdvanceTickFull` to run the full weekly pipeline (cascade,
 *      economy, snapshot, match-day, staff messages, season rollover).
 *   4. If no STOP and the range stops mid-week: persists the day cursor
 *      only. Caller is expected to call again with the remaining days
 *      to complete the week.
 *
 * Option B (ADR-020 §"Decision"): the cascade decay + end-of-week side
 * effects run ONCE per week when crossing the day-6→day-7 boundary.
 * Mid-week halts persist only the day cursor — no cascade tick, no
 * economy update, no snapshot write. This preserves the 1046 existing
 * test fixtures.
 *
 * Backward compat: events created before Sprint 12 have
 * `scheduledDayOfSeason = NULL` — those use the legacy `week * 7`
 * semantics (halt at the START of the event's week).
 *
 * Idempotency (ADR-020 Verification #2):
 *   `advanceDays({ daysToAdvance: 0 })` is a no-op — no DB writes, no
 *   redirect change.
 */
export async function advanceDays(
  opts: AdvanceDaysOptions,
): Promise<AdvanceTickFullResult> {
  const { ctx, daysToAdvance, redirectMode } = opts;

  if (daysToAdvance < 0) {
    throw new Error(`advanceDays: daysToAdvance must be non-negative (got ${daysToAdvance}).`);
  }

  const startDay =
    ctx.playthrough.currentDayOfSeason ?? ctx.playthrough.currentWeek * 7;

  // Idempotency: 0 days = no-op.
  if (daysToAdvance === 0) {
    return {
      next: { type: 'dashboard' },
      nextWeek: deriveWeekFromDayOfSeason(startDay),
      financialBalance:
        (ctx.prevState as Record<string, number>)['financial_balance'] ?? 0,
      thresholdCrossings: [],
    };
  }

  const targetDay = startDay + daysToAdvance;

  // ── Scan for STOP events in the range (startDay, targetDay] ─────────────
  // Use scheduledDayOfSeason if present (Sprint 12+ events); otherwise fall
  // back to week*7 (legacy events fire at the start of their week).
  const pendingStops = await db
    .select({
      id: calendarEvents.id,
      type: calendarEvents.type,
      week: calendarEvents.week,
      scheduledDayOfSeason: calendarEvents.scheduledDayOfSeason,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, ctx.playthrough.id),
        eq(calendarEvents.status, 'pending'),
        eq(calendarEvents.priority, 'STOP'),
      ),
    );

  let earliestStop:
    | { id: string; type: string; day: number; week: number }
    | null = null;
  for (const ev of pendingStops) {
    const eventDay = ev.scheduledDayOfSeason ?? ev.week * 7;
    if (eventDay > startDay && eventDay <= targetDay) {
      if (!earliestStop || eventDay < earliestStop.day) {
        earliestStop = {
          id: ev.id,
          type: ev.type,
          day: eventDay,
          week: ev.week,
        };
      }
    }
  }

  // ── Halt path: STOP event found ─────────────────────────────────────────
  if (earliestStop) {
    // Persist the day cursor only — NO weekly pipeline runs mid-week.
    // currentWeek stays at its pre-advance value; the cascade tick is
    // deferred until the player completes the week.
    await db
      .update(playthroughs)
      .set({
        currentDayOfSeason: earliestStop.day,
        updatedAt: new Date(),
      })
      .where(eq(playthroughs.id, ctx.playthrough.id));

    return {
      next: {
        type: 'stop-event',
        eventId: earliestStop.id,
        eventType: earliestStop.type,
        day: earliestStop.day,
        week: earliestStop.week,
      },
      nextWeek: deriveWeekFromDayOfSeason(earliestStop.day),
      financialBalance:
        (ctx.prevState as Record<string, number>)['financial_balance'] ?? 0,
      thresholdCrossings: [],
    };
  }

  // ── No halt: check whether we cross a week boundary ─────────────────────
  const crossesBoundary = targetDay % 7 === 0 && targetDay > startDay;
  const weeksCrossed = Math.floor(targetDay / 7) - Math.floor(startDay / 7);

  if (crossesBoundary && weeksCrossed === 1) {
    // Clean weekly commit — run the full pipeline. runAdvanceTickFull
    // updates currentWeek + currentDayOfSeason in the same transaction.
    return runAdvanceTickFull({ ctx, redirectMode });
  }

  if (weeksCrossed > 1) {
    // Multi-week batches are still unsupported in Sprint 12. The dashboard
    // form action computes daysToAdvance = daysToBoundary so it never
    // crosses more than one boundary per click.
    throw new Error(
      `advanceDays: multi-week batches not yet supported (would cross ` +
        `${weeksCrossed} week boundaries). Sprint 13+ adds calendar-driven ` +
        `"advance to next STOP" across boundaries.`,
    );
  }

  // ── Partial-week advance: persist day cursor, no pipeline ───────────────
  // Reached when daysToAdvance is small enough to stay within the same
  // week (or land exactly on a non-boundary day). The caller follows up
  // with another advanceDays call to complete the week.
  await db
    .update(playthroughs)
    .set({
      currentDayOfSeason: targetDay,
      updatedAt: new Date(),
    })
    .where(eq(playthroughs.id, ctx.playthrough.id));

  return {
    next: { type: 'dashboard' },
    nextWeek: deriveWeekFromDayOfSeason(targetDay),
    financialBalance:
      (ctx.prevState as Record<string, number>)['financial_balance'] ?? 0,
    thresholdCrossings: [],
  };
}

/**
 * Compute how many days remain until the next week boundary for a given
 * day-of-season cursor. Useful for the dashboard form action: it calls
 * `advanceDays({ daysToAdvance: daysUntilNextBoundary(currentDayOfSeason) })`
 * so each click commits at most one week at a time.
 *
 * Examples:
 *   daysUntilNextBoundary(0)  → 7   (full week ahead)
 *   daysUntilNextBoundary(3)  → 4   (mid-week, 4 days to Sunday)
 *   daysUntilNextBoundary(7)  → 7   (boundary itself → full next week)
 *   daysUntilNextBoundary(35) → 7   (clean week boundary)
 */
export function daysUntilNextBoundary(currentDayOfSeason: number): number {
  const remainder = currentDayOfSeason % 7;
  return remainder === 0 ? 7 : 7 - remainder;
}


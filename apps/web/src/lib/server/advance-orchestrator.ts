/**
 * advance-orchestrator — pure-compute core of the weekly advance tick.
 *
 * Story: Sprint 10 task 10-5 (partial extraction).
 *
 * Why this exists:
 *   Sprint 9 task 9-1 partial extracted `loadAdvanceContext` to @smt/db.
 *   Sprint 10 task 10-5 carries that work forward by isolating the
 *   PURE-COMPUTE portion of the advance loop into a single function.
 *   The remaining DB-write portion (snapshot insert, match-day, staff
 *   messages, season rollover) stays in the dashboard form action for
 *   now — extracting those is a deeper refactor that needs its own
 *   regression strategy (per apps/api/src/modules/advance/README.md).
 *
 * What this function does:
 *   1. TV PRE-PHASE — Tick Order pasos 1-5 (corruption delta, revenue,
 *      contract status changes pre-cascade).
 *   2. CASCADE TICK — runTick on the prevState with TV-adjusted corruption
 *      injected so cascade reads the post-F-TV3 value.
 *   3. TV POST-PHASE — Tick Order pasos 6-8 (cascade external delta
 *      reconciled, scandal threshold re-evaluated).
 *   4. SEASON-TICKET DRIP — weekly abonado signups + cashflow bump.
 *   5. DELAYED-EFFECTS BUFFER — pop due effects, merge with new ones.
 *
 * What this function does NOT do:
 *   - Persist anything. The caller owns the transaction.
 *   - Run the economy tick (it depends on per-week DB lookups for
 *     fixtures + division). The action calls applyEconomyTick on the
 *     output of this orchestrator.
 *   - Match-day, staff messages, season rollover, redirect.
 *
 * Behavior parity guarantee:
 *   The 953 simulation tests in `packages/shared/tests/` plus the 44
 *   integration tests in `apps/api/tests/` cover the underlying helpers
 *   (runTVPrePhase, runTick, runTVPostPhase, maybeDripSeasonTickets).
 *   This orchestrator only sequences them in the order that the form
 *   action already used — no new behavior. After this lands, all 998
 *   tests should pass without modification.
 *
 * Control Manifest: 2026-05-21
 */

import type { AdvanceContext } from '@smt/db';
import {
  CASCADA_FC_GRAPH,
  createSeededRng,
  runTick,
  type WorldState,
  type TickResult,
  type DelayedEffectsBuffer,
} from '@smt/shared';
import { popEffectsDueAt } from '@smt/shared/sim/delayed-effects';
import { runTVPostPhase, runTVPrePhase } from './tv-rights-tick';
import { maybeDripSeasonTickets } from './season-tickets';

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
 *
 * @param opts loaded context + decisions for this tick.
 * @returns all computed values the caller needs to persist + drive UI.
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

  // Patch cascade nextState with the post-phase final corruption value
  // (paso 6 clamping + roundCorruption may differ slightly from cascade's
  // free-running value).
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

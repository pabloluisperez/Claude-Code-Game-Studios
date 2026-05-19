/**
 * Hono routes for match-session lifecycle.
 *
 * Routes:
 *   POST   /matches/start         — create a new match session for a fixture
 *   POST   /matches/:id/decision  — submit a decision at a pause point
 *   GET    /matches/:id           — fetch current snapshot
 *
 * Validation chain:
 *   Hono zod-validator → service-level decision validation (Story 014) →
 *   FSM application + worker enqueue (Story 016).
 *
 * AC-MATCH-29: COUNTER rejected for home player → 400.
 * AC-MATCH-backend-mutex: POST /decision uses `acquireForUpdate` for mutex
 * across HTTP + timeout job race (AC-MATCH-24).
 *
 * Story: MATCH-SIM-017
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Queue } from 'bullmq';
import { db } from '@smt/db';
import {
  advanceTick,
  initMatchSession,
  validateDecision,
  type MatchDecision,
  type MatchInput,
} from '@smt/shared';
import * as Repo from './match-sessions-repo';
import type { MatchJobPayload } from '../../workers/match-worker';

// ── Validation schemas ───────────────────────────────────────────────────────

const startSchema = z.object({
  playthroughId: z.string().uuid(),
  fixtureId: z.string().uuid(),
  seed: z.string().min(1),
  // Lineups + formation come from saved manager state — the route fetches them
  // server-side. For this MVP route, we accept them in the payload for testability.
  homeLineup: z.array(z.unknown()),
  awayLineup: z.array(z.unknown()),
  homeFormation: z.enum(['4-4-2', '4-3-3', '3-5-2', '5-3-2']),
  awayFormation: z.enum(['4-4-2', '4-3-3', '3-5-2', '5-3-2']),
  homeInstruction: z.enum(['PRESS_HIGH', 'HOLD_SHAPE', 'COUNTER']).nullable(),
  awayInstruction: z.enum(['PRESS_HIGH', 'HOLD_SHAPE', 'COUNTER']).nullable(),
  playerClubSide: z.enum(['home', 'away']),
  playerClubId: z.string().uuid(),
  preMatchSnapshot: z.object({}).passthrough(),
});

const decisionSchema = z.object({
  decisions: z.array(z.unknown()), // refined per kind below; service validates
});

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMatchRoutes(deps: {
  readonly matchQueue: Queue<MatchJobPayload>;
}): Hono {
  const app = new Hono();

  // POST /matches/start
  app.post('/start', zValidator('json', startSchema), async (c) => {
    const body = c.req.valid('json');
    const input = body as unknown as MatchInput;
    const snapshot = initMatchSession(input);

    try {
      const inserted = await db.transaction(async (tx) => {
        return Repo.createSession(tx, {
          playthroughId: body.playthroughId,
          fixtureId: body.fixtureId,
          currentTick: snapshot.currentTick,
          eventsAccumulated: [...snapshot.eventsAccumulated],
          currentLineupHome: [...snapshot.currentLineupHome],
          currentLineupAway: [...snapshot.currentLineupAway],
          homeMomentum: snapshot.homeMomentum,
          substitutionsUsed: snapshot.substitutionsUsed,
          awaySubstitutionsUsed: snapshot.awaySubstitutionsUsed,
          yellowCardsByPlayerId: { ...snapshot.yellowCardsByPlayerId },
          currentFormationHome: snapshot.currentFormationHome,
          currentFormationAway: snapshot.currentFormationAway,
          activeInstructionHome: snapshot.activeInstructionHome,
          activeInstructionAway: snapshot.activeInstructionAway,
          prngState: snapshot.prngState,
          state: snapshot.state,
          timeoutJobId: null,
          seed: body.seed,
          playerClubSide: body.playerClubSide,
          playerClubId: body.playerClubId,
          preMatchSnapshot: body.preMatchSnapshot,
        });
      });

      // Enqueue the first worker job
      await deps.matchQueue.add('match-tick', { matchSessionId: inserted.id });
      return c.json({ id: inserted.id, state: snapshot.state }, 201);
    } catch (err: unknown) {
      if (err instanceof Repo.MatchSessionConflictError) {
        return c.json({ error: 'active_session_exists' }, 409);
      }
      throw err;
    }
  });

  // POST /matches/:id/decision
  app.post('/:id/decision', zValidator('json', decisionSchema), async (c) => {
    const sessionId = c.req.param('id');
    const body = c.req.valid('json');
    const decisions = body.decisions as readonly MatchDecision[];

    const result = await db.transaction(async (tx) => {
      // AC-MATCH-backend-mutex: lock the row to prevent concurrent timeout job
      const row = await Repo.acquireForUpdate(tx, sessionId);
      if (!row) return { ok: false as const, status: 404, reason: 'not_found' };
      if (row.state !== 'paused_for_decision') {
        return { ok: false as const, status: 409, reason: 'not_paused' };
      }

      // Validate each decision
      const snap = rowToSnapshot(row);
      for (const d of decisions) {
        const v = validateDecision(snap, d, row.playerClubSide as 'home' | 'away');
        if (!v.ok) {
          return { ok: false as const, status: 400, reason: v.reason };
        }
      }

      // Advance: apply decisions + tick
      const input = rowToMatchInput(row);
      const advance = advanceTick(snap, decisions, input);

      await Repo.updateSnapshot(tx, sessionId, {
        currentTick: advance.nextSnapshot.currentTick,
        eventsAccumulated: [...advance.nextSnapshot.eventsAccumulated],
        currentLineupHome: [...advance.nextSnapshot.currentLineupHome],
        currentLineupAway: [...advance.nextSnapshot.currentLineupAway],
        homeMomentum: advance.nextSnapshot.homeMomentum,
        substitutionsUsed: advance.nextSnapshot.substitutionsUsed,
        awaySubstitutionsUsed: advance.nextSnapshot.awaySubstitutionsUsed,
        yellowCardsByPlayerId: { ...advance.nextSnapshot.yellowCardsByPlayerId },
        currentFormationHome: advance.nextSnapshot.currentFormationHome,
        currentFormationAway: advance.nextSnapshot.currentFormationAway,
        activeInstructionHome: advance.nextSnapshot.activeInstructionHome,
        activeInstructionAway: advance.nextSnapshot.activeInstructionAway,
        prngState: advance.nextSnapshot.prngState,
        state: advance.nextSnapshot.state,
        timeoutJobId: null, // reset; worker will create new delayed job at next pause
      });

      return { ok: true as const, snapshot: advance.nextSnapshot, outcome: advance.matchOutcome };
    });

    if (!result.ok) {
      return c.json({ error: result.reason }, result.status as 400 | 404 | 409);
    }

    // Enqueue resume job
    await deps.matchQueue.add('match-tick', { matchSessionId: sessionId });
    return c.json({
      state: result.snapshot.state,
      currentTick: result.snapshot.currentTick,
      completed: result.outcome !== null,
    });
  });

  // GET /matches/:id
  app.get('/:id', async (c) => {
    const sessionId = c.req.param('id');
    const row = await db.transaction((tx) => Repo.findById(tx, sessionId));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  });

  return app;
}

// ── Helpers (duplicate from worker for now; refactor to shared module later) ──

function rowToSnapshot(row: Repo.MatchSessionRow) {
  return {
    currentTick: row.currentTick,
    eventsAccumulated: row.eventsAccumulated,
    currentLineupHome: row.currentLineupHome,
    currentLineupAway: row.currentLineupAway,
    homeMomentum: row.homeMomentum,
    substitutionsUsed: row.substitutionsUsed,
    awaySubstitutionsUsed: row.awaySubstitutionsUsed,
    yellowCardsByPlayerId: row.yellowCardsByPlayerId,
    currentFormationHome: row.currentFormationHome,
    currentFormationAway: row.currentFormationAway,
    activeInstructionHome: row.activeInstructionHome,
    activeInstructionAway: row.activeInstructionAway,
    prngState: row.prngState,
    state: row.state,
    timeoutJobId: row.timeoutJobId,
  } as never;
}

function rowToMatchInput(row: Repo.MatchSessionRow): MatchInput {
  return {
    seed: row.seed,
    homeLineup: row.currentLineupHome as MatchInput['homeLineup'],
    awayLineup: row.currentLineupAway as MatchInput['awayLineup'],
    homeFormation: row.currentFormationHome as MatchInput['homeFormation'],
    awayFormation: row.currentFormationAway as MatchInput['awayFormation'],
    homeInstruction: row.activeInstructionHome as MatchInput['homeInstruction'],
    awayInstruction: row.activeInstructionAway as MatchInput['awayInstruction'],
    preMatchSnapshot: row.preMatchSnapshot as MatchInput['preMatchSnapshot'],
    playerClubSide: row.playerClubSide as MatchInput['playerClubSide'],
    playerClubId: row.playerClubId,
  };
}

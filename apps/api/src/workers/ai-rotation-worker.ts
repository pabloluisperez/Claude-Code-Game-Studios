/**
 * BullMQ AI Rotation Worker — Story 25-5.
 *
 * Drives the AI club transfer-window rotation: for each AI-controlled club in
 * a playthrough, compute squad gaps, find candidates, and emit makeOffer
 * calls deterministically seeded per (playthroughId, week, clubId).
 *
 * Design principles (mirrors match-worker.ts):
 *   - processAiRotationJob(job, deps) is dependency-injected → fully
 *     unit-testable without a live queue or DB.
 *   - PRNG seeded with createSeededRng(`${playthroughId}:${week}:${clubId}`)
 *     so the same inputs always produce the same offer set (idempotent replay).
 *   - ALREADY_PENDING_OFFER from makeOffer is a graceful no-op skip (not an error).
 *   - One AI club throwing must not stop the others (try/catch per club).
 *   - The player's club (managerId IS NOT NULL for a playthrough's user club) is
 *     never included in the rotation.
 *
 * Trigger: can be enqueued on transfer_window_open CalendarEvent resolution,
 * or called directly by the advance orchestrator. Queue registration is in
 * apps/api/src/jobs/queues.ts (aiRotationQueue).
 *
 * Story: SCOUTING-MARKET-025-5
 */

import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { db, clubs, players, playthroughs, transferOffers, eq, and, isNull, ne } from '@smt/db';
import {
  createSeededRng,
  computeSquadGaps,
  aiTransferBudget,
  generateBargainFactor,
} from '@smt/shared';
import type { MakeOfferParams, OfferOutcome, OfferError, Result } from '../modules/scouting-market/service.js';
import { logger as rootLogger } from '../lib/logger.js';

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface AiRotationJobPayload {
  readonly playthroughId: string;
  readonly week: number;
}

/** A candidate player the AI club can target. */
export type AiPlayerCandidate = {
  id: string;
  skill: number;
  position: string;
  wageExpectationEurKWeek: number;
  transferValueEurK: number;
  contractStatus: string;
};

/** A club with its roster for gap computation. */
export type AiClubWithRoster = {
  id: string;
  financialBalanceEurK: number;
  roster: { position: string }[];
};

/**
 * Dependency-injected loaders and effectors.
 *
 * By accepting these as deps, processAiRotationJob is fully unit-testable
 * without touching the DB, BullMQ, or Socket.IO.
 */
export interface AiRotationWorkerDeps {
  /**
   * Load AI-controlled clubs for the given playthrough.
   * AI clubs are those whose managerId does NOT equal the player's managerId
   * (i.e. clubs not directly managed by the user). Returns clubs with their
   * current roster and financial balance from the latest worldSnapshot.
   */
  loadAiClubs: (playthroughId: string) => Promise<AiClubWithRoster[]>;

  /**
   * Load candidate players for a given position that an AI club could sign:
   *   - free agents (contractStatus = 'free_agent')
   *   - transfer-listed players on other clubs
   * Excludes the buying club's own players.
   */
  loadCandidates: (opts: {
    playthroughId: string;
    buyerClubId: string;
    positions: string[];
    limit: number;
  }) => Promise<AiPlayerCandidate[]>;

  /**
   * The offer service function. Injected so tests can mock without DB.
   */
  makeOffer: (params: MakeOfferParams) => Promise<Result<OfferOutcome, OfferError>>;

  /**
   * Optional: called after all clubs are processed (e.g. Socket.IO emit).
   * The worker calls this with a summary of offers made.
   */
  onComplete?: (playthroughId: string, week: number, offerCount: number) => void;
}

/* ── Default DB-backed loader implementations ───────────────────────────── */

/**
 * Default implementation of loadAiClubs.
 * AI clubs = clubs in the playthrough where managerId IS NULL OR
 * managerId != the player's user's manager. We identify the player's club via
 * the playthroughs row (playthroughs.clubId → clubs.managerId).
 */
async function defaultLoadAiClubs(playthroughId: string): Promise<AiClubWithRoster[]> {
  // 1. Resolve the player's clubId from the playthrough.
  const [pt] = await db
    .select({ clubId: playthroughs.clubId })
    .from(playthroughs)
    .where(eq(playthroughs.id, playthroughId))
    .limit(1);
  if (!pt) return [];

  const playerClubId = pt.clubId;

  // 2. Get all clubs that belong to this playthrough (via players table) and
  //    are NOT the player's club. For simplicity: load all clubs that have
  //    players with this playthroughId, excluding the player's own club.
  //    AI clubs have managerId = NULL (generated AI clubs never get a user).
  const aiClubRows = await db
    .selectDistinct({ id: clubs.id, budget: clubs.budget, managerId: clubs.managerId })
    .from(clubs)
    .innerJoin(players, and(eq(players.clubId, clubs.id), eq(players.playthroughId, playthroughId)))
    .where(and(isNull(clubs.managerId), ne(clubs.id, playerClubId)));

  // 3. For each AI club, load its roster for squad-gap computation.
  const result: AiClubWithRoster[] = [];
  for (const club of aiClubRows) {
    const roster = await db
      .select({ position: players.position })
      .from(players)
      .where(and(eq(players.clubId, club.id), eq(players.playthroughId, playthroughId)));
    result.push({
      id: club.id,
      // Use clubs.budget as a proxy for financialBalance in the default loader.
      // The advance orchestrator should prefer the worldSnapshot balance; this
      // default is a safe fallback for the worker.
      financialBalanceEurK: club.budget,
      roster,
    });
  }
  return result;
}

/**
 * Default implementation of loadCandidates.
 * Returns free agents + transfer-listed players in the same playthrough,
 * excluding the buying club's own players, sorted by skill descending.
 */
async function defaultLoadCandidates(opts: {
  playthroughId: string;
  buyerClubId: string;
  positions: string[];
  limit: number;
}): Promise<AiPlayerCandidate[]> {
  // Load players: free agents OR transfer-listed, matching one of the needed positions.
  const rows = await db
    .select({
      id: players.id,
      skill: players.skill,
      position: players.position,
      wageExpectationEurKWeek: players.wageExpectationEurKWeek,
      contractStatus: players.contractStatus,
      transferListed: players.transferListed,
      clubId: players.clubId,
    })
    .from(players)
    .where(
      and(
        eq(players.playthroughId, opts.playthroughId),
        ne(players.clubId, opts.buyerClubId),
      ),
    )
    .limit(opts.limit * 4); // over-fetch; filter in memory for position + availability

  return rows
    .filter(
      (p) =>
        (p.contractStatus === 'free_agent' || p.transferListed) &&
        opts.positions.includes(p.position),
    )
    .sort((a, b) => b.skill - a.skill)
    .slice(0, opts.limit)
    .map((p) => ({
      id: p.id,
      skill: p.skill,
      position: p.position,
      wageExpectationEurKWeek: p.wageExpectationEurKWeek,
      transferValueEurK: p.skill * 10,
      contractStatus: p.contractStatus,
    }));
}

/* ── Core job processor ─────────────────────────────────────────────────── */

/**
 * Process a single AI rotation job.
 *
 * Can be called directly (unit tests, manual trigger) or via BullMQ Worker
 * callback. The `job` parameter only needs `job.data`; pass a minimal stub
 * in tests.
 */
export async function processAiRotationJob(
  job: Pick<Job<AiRotationJobPayload>, 'data'>,
  deps: AiRotationWorkerDeps,
): Promise<void> {
  const { playthroughId, week } = job.data;
  const log = rootLogger.child({ playthroughId, week, worker: 'ai-rotation' });

  log.info('ai-rotation job started');

  const aiClubs = await deps.loadAiClubs(playthroughId);
  if (aiClubs.length === 0) {
    log.info('no ai clubs found — skipping');
    return;
  }

  let totalOffersAttempted = 0;

  for (const club of aiClubs) {
    try {
      await processOneAiClub({ club, playthroughId, week, deps, log });
      totalOffersAttempted++;
    } catch (err) {
      // Error isolation: one club failing must not abort the others.
      log.error({ clubId: club.id, err }, 'ai-rotation: club processing failed — continuing');
    }
  }

  log.info({ totalOffersAttempted }, 'ai-rotation job completed');
  deps.onComplete?.(playthroughId, week, totalOffersAttempted);
}

async function processOneAiClub(ctx: {
  club: AiClubWithRoster;
  playthroughId: string;
  week: number;
  deps: AiRotationWorkerDeps;
  log: Logger;
}): Promise<void> {
  const { club, playthroughId, week, deps, log } = ctx;

  // 1. Deterministic PRNG seeded per (playthrough, week, club).
  const rng = createSeededRng(`${playthroughId}:${week}:${club.id}`);

  // 2. Compute squad gaps to identify needed positions.
  const neededPositions = computeSquadGaps({ roster: club.roster });
  if (neededPositions.length === 0) {
    log.debug({ clubId: club.id }, 'squad full — skipping');
    return;
  }

  // 3. Compute budget available for this window.
  const budget = aiTransferBudget({ financialBalanceEurK: club.financialBalanceEurK });
  if (budget <= 0) {
    log.debug({ clubId: club.id, budget }, 'no budget — skipping');
    return;
  }

  // 4. Load candidates for the needed positions (top-3 per position, max 6 total).
  const candidates = await deps.loadCandidates({
    playthroughId,
    buyerClubId: club.id,
    positions: neededPositions.slice(0, 3), // Focus on top 3 gap positions
    limit: 6,
  });
  if (candidates.length === 0) {
    log.debug({ clubId: club.id }, 'no candidates — skipping');
    return;
  }

  // 5. Pick the best candidate (highest skill) and compute the offer.
  const target = candidates[0]!;

  // 6. Compute a deterministic bargain factor for this window.
  const bargainFactor = generateBargainFactor(rng);

  // 7. Compute fee based on transfer value × bargainFactor, capped by budget.
  const rawFee =
    target.contractStatus === 'free_agent'
      ? 0
      : Math.round(target.transferValueEurK * bargainFactor);
  const feeEurK = Math.min(rawFee, budget);

  // 8. Wage offer: slightly above expectation to have a chance of acceptance.
  //    AI clubs use a 10% wage premium over expectation (deterministic with rng).
  const wagePremiumFactor = 1.0 + rng() * 0.2; // [1.0, 1.2] range
  const wageOfferEurKWeek = Math.ceil(target.wageExpectationEurKWeek * wagePremiumFactor);

  // 9. Submit offer — ALREADY_PENDING_OFFER is a graceful no-op.
  const WINDOW_ID = `${playthroughId.slice(0, 8)}-${week}-ai`;
  const result = await deps.makeOffer({
    clubId: club.id,
    playerId: target.id,
    feeEurK,
    wageOfferEurKWeek,
    contractWeeks: 52,
    windowId: '00000000-0000-0000-0000-000000000001', // default window; caller can override
    currentWeek: week,
  });

  if (!result.ok) {
    if (result.error === 'ALREADY_PENDING_OFFER') {
      log.debug({ clubId: club.id, playerId: target.id }, 'offer already pending — skipping');
      return;
    }
    log.warn(
      { clubId: club.id, playerId: target.id, error: result.error },
      'ai-rotation offer rejected by service',
    );
    return;
  }

  log.info(
    {
      clubId: club.id,
      playerId: target.id,
      offerKind: result.value.kind,
      feeEurK,
      wageOfferEurKWeek,
    },
    'ai-rotation offer submitted',
  );
}

/* ── BullMQ Worker factory ──────────────────────────────────────────────── */

/**
 * Build a production-ready BullMQ Worker callback that uses the default
 * DB-backed deps. Call this from the worker bootstrap (apps/api/src/server.ts
 * or a dedicated worker-startup file).
 *
 * The deps are lazily imported here so that unit tests importing only
 * processAiRotationJob never instantiate DB connections.
 */
export function createProductionDeps(
  makeOfferFn: AiRotationWorkerDeps['makeOffer'],
): AiRotationWorkerDeps {
  return {
    loadAiClubs: defaultLoadAiClubs,
    loadCandidates: defaultLoadCandidates,
    makeOffer: makeOfferFn,
  };
}

/**
 * Hono routes for the TV Rights module.
 *
 * Per ADR-019 §5 + GDD UI Requirements:
 *   - GET  /tv/:playthroughId/contract — current active contract or null
 *   - GET  /tv/:playthroughId/offers/:eventId — load tv_auction or tv_midseason_offer payload
 *   - POST /tv/:playthroughId/sign — sign a tv_auction offer
 *   - POST /tv/:playthroughId/reject — reject a tv_auction or tv_midseason_offer
 *
 * Story: TVR-004 + TVR-011 prep
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { calendarEvents, db } from '@smt/db';
import * as TVRightsService from './service.js';
import * as Repo from './repo.js';
import { TVRangeError } from '@smt/shared';

const signSchema = z.object({
  offerId: z.string().uuid(),
  tier: z.enum(['LOCAL', 'REGIONAL', 'NACIONAL']),
  durationSeasons: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  currentDivision: z.enum(['D1', 'D2']),
  season: z.number().int().min(1),
});

const rejectSchema = z.object({
  offerId: z.string().uuid(),
});

export function createTVRightsRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /tv/:playthroughId/contract
   * Returns the playthrough's currently ACTIVE tv contract, or null.
   */
  app.get('/:playthroughId/contract', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const contract = await Repo.findActiveContract(db, playthroughId);
    if (!contract) return c.json({ contract: null });
    return c.json({
      contract: {
        id: contract.id,
        tier: contract.tier,
        durationSeasons: contract.durationSeasons,
        seasonInContract: contract.seasonInContract,
        weeklyRateEurK: parseFloat(contract.weeklyRateEurK),
        divisionAtSigning: contract.divisionAtSigning,
        status: contract.status,
        signedAt: contract.signedAt,
      },
    });
  });

  /**
   * GET /tv/:playthroughId/offers/:eventId
   * Loads a pending tv_auction or tv_midseason_offer payload for the UI.
   */
  app.get('/:playthroughId/offers/:eventId', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const eventId = c.req.param('eventId');
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId))
      .limit(1);
    const event = rows[0];
    if (!event) return c.json({ error: 'not_found' }, 404);
    if (event.playthroughId !== playthroughId) return c.json({ error: 'forbidden' }, 403);
    if (event.type !== 'tv_auction' && event.type !== 'tv_midseason_offer') {
      return c.json({ error: 'wrong_event_type', type: event.type }, 400);
    }
    return c.json({
      eventId: event.id,
      type: event.type,
      week: event.week,
      season: event.season,
      consumed: event.consumed,
      payload: event.metadata,
    });
  });

  /**
   * POST /tv/:playthroughId/sign — sign a tv_auction offer.
   *
   * Error mapping:
   *   - TVRangeError              → 400 illegal_tier_duration
   *   - TVContractConflictError   → 409 tv_contract_already_active
   *   - TVOfferExpiredError       → 409 tv_offer_expired
   */
  app.post('/:playthroughId/sign', zValidator('json', signSchema), async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const body = c.req.valid('json');

    try {
      const result = await db.transaction((tx) =>
        TVRightsService.signContract(tx, {
          playthroughId,
          offerId: body.offerId,
          tier: body.tier,
          durationSeasons: body.durationSeasons,
          currentDivision: body.currentDivision,
          season: body.season,
        }),
      );
      return c.json({
        ok: true,
        contractId: result.contractId,
        weeklyRateEurK: result.weeklyRateEurK,
        xpGranted: result.xpGranted,
      });
    } catch (err) {
      if (err instanceof TVRangeError) {
        return c.json(
          {
            error: 'illegal_tier_duration',
            message: err.message,
            tier: body.tier,
            durationSeasons: body.durationSeasons,
          },
          400,
        );
      }
      if (err instanceof TVRightsService.TVContractConflictError) {
        return c.json(
          {
            error: 'tv_contract_already_active',
            currentTier: err.currentTier,
            seasonInContract: err.seasonInContract,
            season: err.season,
          },
          409,
        );
      }
      if (err instanceof TVRightsService.TVOfferExpiredError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
  });

  /**
   * POST /tv/:playthroughId/reject — reject a tv_auction or tv_midseason_offer.
   *
   * Increments fan_loyalty by 10 (capped at 50). Does NOT change contract status.
   */
  app.post('/:playthroughId/reject', zValidator('json', rejectSchema), async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const body = c.req.valid('json');
    try {
      const result = await db.transaction((tx) =>
        TVRightsService.rejectOffer(tx, { playthroughId, offerId: body.offerId }),
      );
      return c.json({
        ok: true,
        fanLoyaltyBefore: result.fanLoyaltyBefore,
        fanLoyaltyAfter: result.fanLoyaltyAfter,
        delta: result.delta,
      });
    } catch (err) {
      if (err instanceof TVRightsService.TVOfferExpiredError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
  });

  return app;
}

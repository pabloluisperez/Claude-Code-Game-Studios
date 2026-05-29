/**
 * Hono routes for scouting-market.
 *
 * Endpoints:
 *   GET    /api/scouting/market?clubId  — visible pool
 *   POST   /api/scouting/scout          — record a scout action
 *   POST   /api/scouting/offer          — make a transfer offer (v1.2 Sprint 25-4)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, clubs, playthroughs } from '@smt/db';
import { requireUser, type AuthEnv } from '../../auth/middleware.js';
import { logger } from '../../lib/logger.js';
import {
  getMarket,
  scoutPlayer,
  makeOffer,
  toggleTransferListed,
  respondToIncomingOffer,
} from './service.js';

const querySchema = z.object({
  clubId: z.string().uuid(),
  currentWeek: z.coerce.number().int().nonnegative().optional(),
});
const scoutSchema = z.object({
  clubId: z.string().uuid(),
  playerId: z.string().uuid(),
  actionType: z.enum(['scout', 'deep_scout']),
});
const offerSchema = z.object({
  clubId: z.string().uuid(),
  playerId: z.string().uuid(),
  feeEurK: z.number().int().min(0),
  wageOfferEurKWeek: z.number().int().min(0),
  contractWeeks: z.number().int().min(1).max(260),
  currentWeek: z.number().int().nonnegative().optional(),
});

const listForSaleSchema = z.object({
  clubId: z.string().uuid(),
  playerId: z.string().uuid(),
  listed: z.boolean(),
});

const respondOfferSchema = z.object({
  clubId: z.string().uuid(),
  offerId: z.string().uuid(),
  action: z.enum(['accept', 'reject']),
});

async function clubBelongsToUser(userId: string, clubId: string): Promise<boolean> {
  const rows = await db
    .select({ managerId: clubs.managerId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return rows[0]?.managerId === userId;
}

function errorStatus(code: string): 400 | 402 | 404 | 409 | 500 {
  switch (code) {
    case 'PLAYER_NOT_FOUND': return 404;
    case 'OWN_PLAYER_BLOCKED': return 400;
    case 'NO_SCOUT': return 400;
    case 'ALREADY_SCOUTED': return 409;
    case 'ALREADY_PENDING_OFFER': return 409;
    case 'INSUFFICIENT_BALANCE': return 402;
    case 'INVALID_OFFER': return 400;
    default: return 500;
  }
}

export function createScoutingMarketRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use('*', requireUser);

  app.get('/market', zValidator('query', querySchema), async (c) => {
    const user = c.get('user');
    const { clubId, currentWeek } = c.req.valid('query');
    if (!(await clubBelongsToUser(user.id, clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    const [pt] = await db
      .select({ transferWindowOpen: playthroughs.transferWindowOpen })
      .from(playthroughs)
      .where(eq(playthroughs.clubId, clubId))
      .limit(1);
    const pool = await getMarket(clubId, { limit: 50, currentWeek });
    return c.json({ pool, transferWindowOpen: pt?.transferWindowOpen ?? false }, 200);
  });

  app.post('/scout', zValidator('json', scoutSchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await clubBelongsToUser(user.id, body.clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    const result = await scoutPlayer(body);
    if (result.ok) {
      logger.info(
        { clubId: body.clubId, playerId: body.playerId, actionType: body.actionType, costPaid: result.value.costPaid },
        'scouting action',
      );
      return c.json(result.value, 200);
    }
    logger.warn({ clubId: body.clubId, playerId: body.playerId, error: result.error }, 'scouting action denied');
    return c.json({ error: result.error }, errorStatus(result.error));
  });

  app.post('/offer', zValidator('json', offerSchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await clubBelongsToUser(user.id, body.clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    try {
      const result = await makeOffer(body);
      if (result.ok) {
        logger.info(
          { clubId: body.clubId, playerId: body.playerId, kind: result.value.kind },
          'transfer offer outcome',
        );
        return c.json(result.value, 200);
      }
      logger.warn({ clubId: body.clubId, playerId: body.playerId, error: result.error }, 'offer denied');
      return c.json({ error: result.error }, errorStatus(result.error));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ clubId: body.clubId, playerId: body.playerId, err: msg }, 'offer route error');
      return c.json({ error: 'INTERNAL', detail: msg }, 500);
    }
  });

  app.post('/list-for-sale', zValidator('json', listForSaleSchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await clubBelongsToUser(user.id, body.clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    const result = await toggleTransferListed(body);
    if (result.ok) {
      logger.info({ clubId: body.clubId, playerId: body.playerId, listed: body.listed }, 'transfer listing toggled');
      return c.json(result.value, 200);
    }
    return c.json({ error: result.error }, errorStatus(result.error));
  });

  app.post('/respond-offer', zValidator('json', respondOfferSchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await clubBelongsToUser(user.id, body.clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    const result = await respondToIncomingOffer(body);
    if (result.ok) {
      logger.info({ clubId: body.clubId, offerId: body.offerId, status: result.value.status }, 'offer response');
      return c.json(result.value, 200);
    }
    return c.json({ error: result.error }, errorStatus(result.error));
  });

  return app;
}

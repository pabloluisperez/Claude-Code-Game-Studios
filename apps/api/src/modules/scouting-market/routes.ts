/**
 * Hono routes for scouting-market. Story SCOUTING-MARKET-007 (minimal slice).
 *
 * Endpoints:
 *   GET    /api/scouting/market?clubId  — visible pool
 *   POST   /api/scouting/scout          — record a scout action
 *
 * v1.1 minimal: offer/auction routes deferred to v1.2.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, clubs } from '@smt/db';
import { requireUser, type AuthEnv } from '../../auth/middleware.js';
import { logger } from '../../lib/logger.js';
import { getMarket, scoutPlayer } from './service.js';

const querySchema = z.object({ clubId: z.string().uuid() });
const scoutSchema = z.object({
  clubId: z.string().uuid(),
  playerId: z.string().uuid(),
  actionType: z.enum(['scout', 'deep_scout']),
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
    case 'ALREADY_SCOUTED': return 409;
    case 'INSUFFICIENT_BALANCE': return 402;
    default: return 500;
  }
}

export function createScoutingMarketRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use('*', requireUser);

  app.get('/market', zValidator('query', querySchema), async (c) => {
    const user = c.get('user');
    const { clubId } = c.req.valid('query');
    if (!(await clubBelongsToUser(user.id, clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    const pool = await getMarket(clubId, { limit: 50 });
    return c.json({ pool }, 200);
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

  return app;
}

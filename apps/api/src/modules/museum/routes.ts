/**
 * Hono routes for the museum aggregator. Story TROPHIES-HISTORY-001.
 *
 * Single endpoint: GET /api/museum/contents?clubId=…
 * Session-authenticated. Cache TTL 60s. Read-only.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireUser, type AuthEnv } from '../../auth/middleware.js';
import { logger } from '../../lib/logger.js';
import { clubBelongsToUser } from './repo.js';
import { getMuseumContentsCached } from './service.js';

const querySchema = z.object({ clubId: z.string().uuid() });

export function createMuseumRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use('*', requireUser);

  app.get('/contents', zValidator('query', querySchema), async (c) => {
    const user = c.get('user');
    const { clubId } = c.req.valid('query');

    if (!(await clubBelongsToUser(user.id, clubId))) {
      // Security: don't leak existence — same NOT_FOUND for unauth + missing.
      return c.json({ error: 'NOT_FOUND' }, 404);
    }

    const { data, cached } = await getMuseumContentsCached(clubId);
    logger.info({ clubId, totalObjects: data.totalObjects, cached }, 'museum contents');
    c.header('X-Museum-Cache', cached ? 'hit' : 'miss');
    return c.json(data, 200);
  });

  return app;
}

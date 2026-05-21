/**
 * Hono routes for event-system.
 *
 *   GET    /events/:playthroughId/pending           — pending STOP events
 *   GET    /events/:playthroughId/feed?weeks=4      — recent feed (ADVISORY + resolved)
 *   POST   /events/:playthroughId/:eventId/decide   — submit a choice
 *
 * Story: EVENT-SYSTEM-006
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@smt/db';
import * as Repo from './repo.js';
import { resolveEventById } from './service.js';

const decideSchema = z.object({
  choice: z.string().min(1).max(64),
  currentWeek: z.number().int().min(0),
  playerClubId: z.string().uuid(),
});

export function createEventRoutes(): Hono {
  const app = new Hono();

  app.get('/:playthroughId/pending', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const weekParam = c.req.query('week');
    if (!weekParam) return c.json({ error: 'week_required' }, 400);
    const week = parseInt(weekParam, 10);
    const events = await db.transaction((tx) =>
      Repo.findPendingForWeek(tx, playthroughId, week),
    );
    const stop = events.filter((e) => e.priority === 'STOP');
    const advisory = events.filter((e) => e.priority === 'ADVISORY');
    const notify = events.filter((e) => e.priority === 'NOTIFY');
    return c.json({ stop, advisory, notify });
  });

  app.get('/:playthroughId/feed', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const events = await db.transaction((tx) => Repo.getRecentResolved(tx, playthroughId));
    return c.json({ events });
  });

  app.post(
    '/:playthroughId/:eventId/decide',
    zValidator('json', decideSchema),
    async (c) => {
      const eventId = c.req.param('eventId');
      const body = c.req.valid('json');
      const result = await db.transaction((tx) =>
        resolveEventById(tx, eventId, body.choice, {
          rng: () => 0.5, // production wires ctx.rng via advance-worker
          currentWeek: body.currentWeek,
          playerClubId: body.playerClubId,
        }),
      );
      if (!result.ok) {
        const status =
          result.reason === 'event_not_found' ? 404 :
          result.reason === 'invalid_choice' ? 400 : 409;
        return c.json({ error: result.reason }, status);
      }
      return c.json({
        deltas: result.result.deltas,
        sideEffects: result.result.sideEffects,
      });
    },
  );

  return app;
}

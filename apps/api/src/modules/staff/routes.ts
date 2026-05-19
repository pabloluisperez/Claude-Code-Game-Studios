/**
 * Hono routes for staff-system.
 *
 *   GET    /staff/:playthroughId                  — list active staff
 *   POST   /staff/:playthroughId/hire             — hire/upgrade staff
 *   POST   /staff/:playthroughId/dismiss/:id      — dismiss
 *   GET    /staff/:playthroughId/messages         — message feed (latest 200)
 *   POST   /staff/:playthroughId/messages/read    — mark read (body: { ids[] })
 *
 * Story: STAFF-SYSTEM-005
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@smt/db';
import { STAFF_ROLES } from '@smt/shared';
import * as Repo from './repo';
import { hireStaff } from './service';

const hireSchema = z.object({
  clubId: z.string().uuid(),
  role: z.enum(STAFF_ROLES as unknown as [string, ...string[]]),
  qualityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  name: z.string().min(1).max(100),
  hiredWeek: z.number().int().min(0),
});

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export function createStaffRoutes(): Hono {
  const app = new Hono();

  app.get('/:playthroughId', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const clubId = c.req.query('clubId');
    if (!clubId) return c.json({ error: 'club_id_required' }, 400);
    const staff = await db.transaction((tx) => Repo.findActiveStaff(tx, playthroughId, clubId));
    return c.json({ staff });
  });

  app.post(
    '/:playthroughId/hire',
    zValidator('json', hireSchema),
    async (c) => {
      const playthroughId = c.req.param('playthroughId');
      const body = c.req.valid('json');
      const result = await db.transaction((tx) =>
        hireStaff(tx, {
          playthroughId,
          clubId: body.clubId,
          role: body.role as never,
          qualityTier: body.qualityTier,
          name: body.name,
          hiredWeek: body.hiredWeek,
        }),
      );
      if (!result.ok) {
        const status = result.reason === 'manager_not_found' ? 404 : 403;
        return c.json({ error: result.reason }, status);
      }
      return c.json({ id: result.id, replaced: result.replaced }, 201);
    },
  );

  app.post('/:playthroughId/dismiss/:id', async (c) => {
    const id = c.req.param('id');
    await db.transaction((tx) => Repo.dismissStaff(tx, id));
    return c.json({ dismissed: id });
  });

  app.get('/:playthroughId/messages', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const sinceParam = c.req.query('sinceWeek');
    const sinceWeek = sinceParam ? parseInt(sinceParam, 10) : 0;
    const messages = await db.transaction((tx) =>
      Repo.getMessagesSince(tx, playthroughId, sinceWeek),
    );
    return c.json({ messages });
  });

  app.post(
    '/:playthroughId/messages/read',
    zValidator('json', markReadSchema),
    async (c) => {
      const body = c.req.valid('json');
      await db.transaction((tx) => Repo.markMessagesRead(tx, body.ids));
      return c.json({ marked: body.ids.length });
    },
  );

  return app;
}

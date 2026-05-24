/**
 * Hono routes for manager-rpg.
 *
 *   GET    /manager-rpg/:playthroughId        — current profile + skills
 *   GET    /manager-rpg/:playthroughId/log    — career log (recent XP events)
 *   POST   /manager-rpg/:playthroughId/init   — create profile (admin/test)
 *
 * Manual skill allocation routes are NOT provided per ADR-010: XP is
 * event-driven, never manually allocated.
 *
 * Story: MANAGER-RPG-005
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@smt/db';
import {
  getMaxHirableStaffQuality,
  type ManagerSkills,
} from '@smt/shared';
import * as Repo from './repo.js';
import { initialiseManagerProfile } from './service.js';

const initSchema = z.object({
  name: z.string().min(1).max(100),
});

export function createManagerRpgRoutes(): Hono {
  const app = new Hono();

  app.get('/:playthroughId', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const row = await db.transaction((tx) => Repo.findByPlaythrough(tx, playthroughId));
    if (!row) return c.json({ error: 'profile_not_found' }, 404);
    const skills = row.skills as ManagerSkills;
    return c.json({
      id: row.id,
      playthroughId: row.playthroughId,
      name: row.name,
      skills,
      maxHirableStaffQuality: getMaxHirableStaffQuality(skills.reputation.level),
    });
  });

  app.get('/:playthroughId/log', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;
    const events = await db.transaction((tx) =>
      Repo.getRecentXpEvents(tx, playthroughId, limit),
    );
    return c.json({ events });
  });

  app.post(
    '/:playthroughId/init',
    zValidator('json', initSchema),
    async (c) => {
      const playthroughId = c.req.param('playthroughId');
      const body = c.req.valid('json');
      const inserted = await db.transaction((tx) =>
        initialiseManagerProfile(tx, { playthroughId, name: body.name }),
      );
      return c.json({ id: inserted.id }, 201);
    },
  );

  return app;
}

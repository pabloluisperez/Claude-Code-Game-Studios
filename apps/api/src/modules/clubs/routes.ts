import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createClubSchema, clubIdSchema } from '@smt/shared/schemas/clubs';
import { requireUser } from '../../auth/middleware.js';
import { foundClub, getClub, getManagerClubs } from './service.js';
import type { AuthEnv } from '../../auth/middleware.js';

export const clubRoutes = new Hono<AuthEnv>()
  .get('/', requireUser, async (c) => {
    const user = c.get('user');
    const clubs = await getManagerClubs(user.id);
    return c.json(clubs);
  })

  .get('/:id', requireUser, zValidator('param', clubIdSchema), async (c) => {
    const { id } = c.req.valid('param');
    const club = await getClub(id);
    if (!club) throw new HTTPException(404, { message: 'Club not found' });
    return c.json(club);
  })

  .post('/', requireUser, zValidator('json', createClubSchema), async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const club = await foundClub(user.id, input);
    return c.json(club, 201);
  });

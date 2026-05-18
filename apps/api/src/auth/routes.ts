import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db, users } from '@smt/db';
import { signupSchema, loginSchema } from '@smt/shared/schemas/auth';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, createSession, invalidateSession } from './session.js';
import { requireUser } from './middleware.js';
import type { AuthEnv } from './middleware.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: process.env['NODE_ENV'] === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30
};

export const authRoutes = new Hono<AuthEnv>()
  .post('/signup', zValidator('json', signupSchema), async (c) => {
    const { email, username, password } = c.req.valid('json');

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email)
    });
    if (existing) return c.json({ error: 'Email already registered' }, 409);

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ email, username, passwordHash })
      .returning({ id: users.id, email: users.email, username: users.username });

    if (!user) return c.json({ error: 'Failed to create account' }, 500);

    const token = generateSessionToken();
    await createSession(token, user.id);
    setCookie(c, 'session', token, COOKIE_OPTIONS);

    return c.json({ user: { id: user.id, email: user.email, username: user.username } }, 201);
  })

  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return c.json({ error: 'Invalid credentials' }, 401);

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

    const token = generateSessionToken();
    await createSession(token, user.id);
    setCookie(c, 'session', token, COOKIE_OPTIONS);

    return c.json({ user: { id: user.id, email: user.email, username: user.username } });
  })

  .post('/logout', requireUser, async (c) => {
    const session = c.get('session');
    await invalidateSession(session.id);
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ ok: true });
  })

  .get('/me', requireUser, (c) => {
    const user = c.get('user');
    return c.json({ id: user.id, email: user.email, username: user.username });
  });

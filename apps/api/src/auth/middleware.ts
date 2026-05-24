import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { validateSessionToken } from './session.js';
import type { User, Session } from '@smt/db';

export type AuthEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};

export async function requireUser(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const token = getCookie(c, 'session');
  if (!token) throw new HTTPException(401, { message: 'Unauthorized' });

  const result = await validateSessionToken(token);
  if (!result) throw new HTTPException(401, { message: 'Session expired' });

  c.set('user', result.user);
  c.set('session', result.session);
  return next();
}

export async function attachUser(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const token = getCookie(c, 'session');
  if (token) {
    const result = await validateSessionToken(token);
    if (result) {
      c.set('user', result.user);
      c.set('session', result.session);
    }
  }
  return next();
}

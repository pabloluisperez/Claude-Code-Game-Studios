import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '@smt/db/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');

  if (token) {
    const result = await validateSessionToken(token);
    if (result) {
      event.locals.user = result.user;
      event.locals.session = result.session;
    } else {
      event.locals.user = null;
      event.locals.session = null;
      event.cookies.delete('session', { path: '/' });
    }
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  return resolve(event);
};

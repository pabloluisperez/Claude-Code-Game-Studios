/**
 * Self-service routes for authenticated user.
 *
 * Story v1.0.x (sprint 16 adelantado): cumple la promesa de
 * `apps/web/src/routes/privacy/+page.svelte` §7 (derechos GDPR):
 *
 *   - GET /me/export   → bundle JSON con todos los datos del usuario
 *   - DELETE /me       → borrado completo (cascade) tras cooldown 24h
 *   - GET /me/delete-status → status del cooldown si está pending
 *
 * Auth: requireUser middleware en cada ruta.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser } from '../../auth/middleware.js';
import type { AuthEnv } from '../../auth/middleware.js';
import { rateLimit } from '../../lib/rate-limit.js';
import * as Repo from './repo.js';

export function createMeRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  // GET /me/export — JSON bundle de todos los datos del usuario.
  app.get('/export', requireUser, rateLimit('matchStart'), async (c) => {
    const user = c.get('user');
    const bundle = await Repo.exportUserData(user.id);
    c.header('Content-Disposition', `attachment; filename="export-${user.id}.json"`);
    return c.json(bundle);
  });

  // POST /me/delete-request — inicia cooldown 24h antes del borrado real.
  app.post('/delete-request', requireUser, async (c) => {
    const user = c.get('user');
    const status = await Repo.requestUserDeletion(user.id);
    return c.json({
      message: 'Deletion requested. You have 24h to cancel.',
      cooldownEndsAt: status.cooldownEndsAt,
    });
  });

  // POST /me/delete-cancel — cancela el cooldown si está pending.
  app.post('/delete-cancel', requireUser, async (c) => {
    const user = c.get('user');
    const cancelled = await Repo.cancelUserDeletion(user.id);
    if (!cancelled) {
      throw new HTTPException(404, { message: 'No pending deletion to cancel' });
    }
    return c.json({ message: 'Deletion cancelled' });
  });

  // DELETE /me — ejecuta el borrado si el cooldown ha expirado.
  // Para borrado inmediato durante tests / soporte, body { force: true }
  // sólo se acepta si el user.id coincide con un admin flag (TBD v1.3).
  app.delete('/', requireUser, async (c) => {
    const user = c.get('user');
    let force = false;
    try {
      const body = (await c.req.json()) as { force?: boolean };
      force = body?.force === true;
    } catch {
      force = false;
    }
    const result = await Repo.executeUserDeletion(user.id, { force });
    if (result.status === 'cooldown_active') {
      return c.json(
        {
          error: 'Cooldown still active',
          cooldownEndsAt: result.cooldownEndsAt,
        },
        409,
      );
    }
    if (result.status === 'no_request') {
      throw new HTTPException(400, {
        message: 'No active deletion request. Call POST /me/delete-request first.',
      });
    }
    return c.json({ message: 'Account deleted' }, 200);
  });

  // GET /me/delete-status — útil para que la UI muestre el cooldown.
  app.get('/delete-status', requireUser, async (c) => {
    const user = c.get('user');
    const status = await Repo.getDeletionStatus(user.id);
    return c.json(status);
  });

  return app;
}

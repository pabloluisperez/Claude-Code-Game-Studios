/**
 * Hono routes for the stadium-upgrades module. Story STADIUM-UPGRADES-006.
 *
 * Exposes:
 *   - GET    /api/stadium/catalog            — full catalog + per-item state
 *   - POST   /api/stadium/buy                — queue a new upgrade
 *   - POST   /api/stadium/cancel             — cancel in-progress upgrade
 *   - GET    /api/stadium/history            — completed items (for trophies)
 *
 * Per ADR-029 §D4. Session-authenticated via existing `requireUser` middleware.
 * Service errors mapped to HTTP status per ADR-029:
 *   ITEM_NOT_FOUND / NOT_FOUND          → 404
 *   INVALID_PREREQ                       → 400
 *   SLOT_OCCUPIED / NOT_IN_PROGRESS      → 409
 *   INSUFFICIENT_BALANCE                 → 402
 *   CRITICAL_BALANCE_WARNING             → 409 (client must re-POST with acceptRisk)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, clubs, stadiumUpgradeItems } from '@smt/db';
import { requireUser, type AuthEnv } from '../../auth/middleware.js';
import { logger } from '../../lib/logger.js';
import { getCatalog } from './catalog.js';
import * as service from './service.js';

const buySchema = z.object({
  clubId: z.string().uuid(),
  itemSlug: z.string().regex(/^[a-z0-9-]+$/),
  acceptRisk: z.boolean().optional(),
  activeOfferId: z.string().uuid().optional(),
});

const cancelSchema = z.object({
  clubId: z.string().uuid(),
  itemId: z.string().uuid(),
});

const catalogQuerySchema = z.object({
  clubId: z.string().uuid(),
});

function errorStatus(code: string): 400 | 402 | 404 | 409 | 500 {
  switch (code) {
    case 'ITEM_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;
    case 'INVALID_PREREQ':
      return 400;
    case 'SLOT_OCCUPIED':
    case 'NOT_IN_PROGRESS':
    case 'CRITICAL_BALANCE_WARNING':
      return 409;
    case 'INSUFFICIENT_BALANCE':
      return 402;
    default:
      return 500;
  }
}

async function assertClubOwnedByUser(userId: string, clubId: string): Promise<boolean> {
  const rows = await db
    .select({ managerId: clubs.managerId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return rows[0]?.managerId === userId;
}

export function createStadiumUpgradesRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.use('*', requireUser);

  /** GET /api/stadium/catalog?clubId=… */
  app.get('/catalog', zValidator('query', catalogQuerySchema), async (c) => {
    const user = c.get('user');
    const { clubId } = c.req.valid('query');
    if (!(await assertClubOwnedByUser(user.id, clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }

    const catalog = getCatalog();
    const items = await db
      .select()
      .from(stadiumUpgradeItems)
      .where(eq(stadiumUpgradeItems.clubId, clubId));
    const active = items.find((i) => i.status === 'in_progress') ?? null;
    const completedSlugs = new Set(items.filter((i) => i.status === 'complete').map((i) => i.itemSlug));

    // Compute per-item state per GDD §3.2 FSM table:
    // Locked: prereq not met. Available: prereq + queue free. Queued: prereq met but queue occupied.
    // InProgress / Complete: from DB rows.
    const completedByTrackTier = new Map<string, number>();
    for (const item of items) {
      if (item.status !== 'complete') continue;
      const key = `${item.track}-${item.tier - 1}`;
      completedByTrackTier.set(key, (completedByTrackTier.get(key) ?? 0) + 1);
    }

    const itemsWithState = catalog.map((catItem) => {
      if (completedSlugs.has(catItem.slug)) {
        return { ...catItem, state: 'Complete' as const };
      }
      if (active && active.itemSlug === catItem.slug) {
        return {
          ...catItem,
          state: 'InProgress' as const,
          weeksRemaining: active.weeksRemaining ?? 0,
        };
      }
      // Prereq check: tier 1 always satisfies; tier N requires ≥1 complete at tier N-1.
      const prereqOk =
        catItem.tier === 1 || (completedByTrackTier.get(`${catItem.track}-${catItem.tier - 1}`) ?? 0) > 0;
      if (!prereqOk) {
        return { ...catItem, state: 'Locked' as const };
      }
      if (active) {
        return { ...catItem, state: 'Queued' as const };
      }
      return { ...catItem, state: 'Available' as const };
    });

    return c.json({ items: itemsWithState, active });
  });

  /** POST /api/stadium/buy */
  app.post('/buy', zValidator('json', buySchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await assertClubOwnedByUser(user.id, body.clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }

    const result = await service.buy({
      clubId: body.clubId,
      itemSlug: body.itemSlug,
      ...(body.acceptRisk !== undefined ? { acceptRisk: body.acceptRisk } : {}),
      ...(body.activeOfferId !== undefined ? { activeOfferId: body.activeOfferId } : {}),
    });
    if (result.ok) {
      logger.info(
        {
          clubId: body.clubId,
          itemSlug: body.itemSlug,
          totalCost: result.value.totalCost,
          installmentEurK: result.value.installmentEurK,
        },
        'stadium-upgrades buy',
      );
      return c.json(
        {
          itemId: result.value.itemId,
          totalCost: result.value.totalCost,
          durationWeeks: result.value.durationWeeks,
          installmentEurK: result.value.installmentEurK,
        },
        200,
      );
    }
    logger.warn({ clubId: body.clubId, itemSlug: body.itemSlug, error: result.error }, 'stadium-upgrades buy denied');
    return c.json({ error: result.error }, errorStatus(result.error));
  });

  /** POST /api/stadium/cancel */
  app.post('/cancel', zValidator('json', cancelSchema), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!(await assertClubOwnedByUser(user.id, body.clubId))) {
      // Security: don't leak club existence — return NOT_FOUND
      return c.json({ error: 'NOT_FOUND' }, 404);
    }

    const result = await service.cancel(body);
    if (result.ok) {
      logger.info({ clubId: body.clubId, itemId: body.itemId, refundEurK: result.value.refundEurK }, 'stadium-upgrades cancel');
      return c.json({ refundEurK: result.value.refundEurK }, 200);
    }
    logger.warn({ clubId: body.clubId, itemId: body.itemId, error: result.error }, 'stadium-upgrades cancel denied');
    return c.json({ error: result.error }, errorStatus(result.error));
  });

  /** GET /api/stadium/history?clubId=… — completed items chronological. */
  app.get('/history', zValidator('query', catalogQuerySchema), async (c) => {
    const user = c.get('user');
    const { clubId } = c.req.valid('query');
    if (!(await assertClubOwnedByUser(user.id, clubId))) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }

    const rows = await db
      .select()
      .from(stadiumUpgradeItems)
      .where(and(eq(stadiumUpgradeItems.clubId, clubId), eq(stadiumUpgradeItems.status, 'complete')));
    rows.sort((a, b) => {
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    return c.json({ history: rows });
  });

  return app;
}

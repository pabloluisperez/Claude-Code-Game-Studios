/**
 * Hono routes for the economy module.
 *
 * Per ADR-014 + GDD economy.md UI requirements:
 *   - GET /economy/:playthroughId/state — current financial snapshot
 *   - GET /economy/:playthroughId/sponsors — sponsor list
 *   - POST /economy/:playthroughId/sponsors/sign — sign a new sponsor (admin/test)
 *   - POST /economy/:playthroughId/payroll-freeze — accept/decline the catch-up
 *
 * Hud-ui consumes /state instead of the slice's client-side proxy.
 *
 * Story: ECONOMY-008 (TR-ECO-008)
 * Control Manifest: 2026-05-19
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, sponsors, playthroughs, worldSnapshots } from '@smt/db';
import {
  applyFreezeDecision,
  INITIAL_PAYROLL_FREEZE_STATE,
  type PayrollFreezeState,
} from './payroll-freeze.js';
import * as SponsorsService from './sponsors-service.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const signSponsorSchema = z.object({
  clubId: z.string().uuid(),
  name: z.string().min(1).max(100),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  weeklyEurK: z.number().int().min(0),
  qualityContribution: z.number().int().min(0).max(100),
  startedWeek: z.number().int().min(0),
  contractWeeks: z.number().int().min(1).max(52),
});

const freezeDecisionSchema = z.object({
  decision: z.enum(['accept', 'decline']),
  currentWeek: z.number().int().min(0),
});

// ── Factory ──────────────────────────────────────────────────────────────────

export function createEconomyRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /economy/:playthroughId/state
   * Returns the latest WorldState snapshot economy nodes + active sponsor count.
   */
  app.get('/:playthroughId/state', async (c) => {
    const playthroughId = c.req.param('playthroughId');

    const latestSnap = await db
      .select()
      .from(worldSnapshots)
      .where(eq(worldSnapshots.playthroughId, playthroughId))
      .orderBy(desc(worldSnapshots.week))
      .limit(1);

    const ws = latestSnap[0];
    if (!ws) return c.json({ error: 'no_snapshot' }, 404);

    const state = ws.worldState as Record<string, number>;
    return c.json({
      week: ws.week,
      financialBalance: state['financial_balance'] ?? 0,
      weeklyCashflow: state['weekly_cashflow'] ?? 0,
      financialStatus: state['financial_status'] ?? 0,
      sponsorQuality: state['sponsor_quality'] ?? 0,
      stadiumCapacity: state['stadium_capacity'] ?? 3000,
      fanCultureIndex: state['fan_culture_index'] ?? 35,
    });
  });

  /**
   * GET /economy/:playthroughId/sponsors
   * Returns all sponsors (active + cancelled + expired), most-recent first.
   */
  app.get('/:playthroughId/sponsors', async (c) => {
    const playthroughId = c.req.param('playthroughId');
    const rows = await db
      .select()
      .from(sponsors)
      .where(eq(sponsors.playthroughId, playthroughId))
      .orderBy(desc(sponsors.createdAt));
    return c.json({ sponsors: rows });
  });

  /**
   * POST /economy/:playthroughId/sponsors/sign
   * Sign a new sponsor (admin/test endpoint — production wire via event-system).
   */
  app.post(
    '/:playthroughId/sponsors/sign',
    zValidator('json', signSponsorSchema),
    async (c) => {
      const playthroughId = c.req.param('playthroughId');
      const body = c.req.valid('json');
      const inserted = await db.transaction((tx) =>
        SponsorsService.signSponsor(tx, {
          playthroughId,
          clubId: body.clubId,
          name: body.name,
          tier: body.tier,
          weeklyEurK: body.weeklyEurK,
          qualityContribution: body.qualityContribution,
          startedWeek: body.startedWeek,
          contractWeeks: body.contractWeeks,
        }),
      );
      return c.json({ id: inserted.id }, 201);
    },
  );

  /**
   * POST /economy/:playthroughId/payroll-freeze
   * Accept or decline the catch-up freeze offer.
   *
   * Note: production tracks freeze state on playthroughs.metadata; this route
   * applies the decision and returns the resulting modifiers. The advance-worker
   * persists the state via the playthroughs table.
   */
  app.post(
    '/:playthroughId/payroll-freeze',
    zValidator('json', freezeDecisionSchema),
    async (c) => {
      const body = c.req.valid('json');
      // For now, always start from INITIAL state — production would read from
      // playthroughs.metadata.payrollFreezeState.
      const current: PayrollFreezeState = INITIAL_PAYROLL_FREEZE_STATE;
      const result =
        body.decision === 'accept'
          ? applyFreezeDecision(current, { kind: 'accept', currentWeek: body.currentWeek })
          : applyFreezeDecision(current, { kind: 'decline' });

      return c.json({
        applied: result.applied,
        reason: result.reason,
        nextState: result.nextState,
        sideEffects: {
          happinessDelta: result.happinessDelta,
          payrollMultiplier: result.payrollMultiplier,
        },
      });
    },
  );

  return app;
}

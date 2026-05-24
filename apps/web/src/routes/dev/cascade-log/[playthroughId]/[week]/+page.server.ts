/**
 * Dev viewer for `world_snapshots.cascade_log` + `threshold_crossings`.
 *
 * Sprint 9 task 9-7. Minimal read-only viewer for debugging player-reported
 * issues. NOT auth-gated — this is a dev tool, served only in dev environments.
 * Production deploys should disable /dev/* routes via SvelteKit hooks or
 * reverse-proxy rules.
 */

import { error } from '@sveltejs/kit';
import { db, worldSnapshots, eq, and } from '@smt/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const playthroughId = params.playthroughId;
  const week = parseInt(params.week, 10);
  if (Number.isNaN(week) || week < 0) error(400, 'Week must be a non-negative integer');

  const [row] = await db
    .select({
      week: worldSnapshots.week,
      worldState: worldSnapshots.worldState,
      delayedEffectsBuffer: worldSnapshots.delayedEffectsBuffer,
      cascadeLog: worldSnapshots.cascadeLog,
      thresholdCrossings: worldSnapshots.thresholdCrossings,
      seedState: worldSnapshots.seedState,
      createdAt: worldSnapshots.createdAt,
    })
    .from(worldSnapshots)
    .where(
      and(
        eq(worldSnapshots.playthroughId, playthroughId),
        eq(worldSnapshots.week, week),
      ),
    )
    .limit(1);

  if (!row) error(404, `No world_snapshots row for playthrough ${playthroughId} week ${week}`);

  return {
    playthroughId,
    week: row.week,
    worldState: row.worldState as Record<string, number>,
    delayedEffectsBuffer:
      (row.delayedEffectsBuffer as unknown as readonly Record<string, unknown>[]) ?? [],
    cascadeLog:
      (row.cascadeLog as unknown as readonly Record<string, unknown>[] | null) ?? [],
    thresholdCrossings:
      (row.thresholdCrossings as unknown as readonly Record<string, unknown>[] | null) ?? [],
    seedState: row.seedState ?? null,
    createdAt: row.createdAt,
  };
};

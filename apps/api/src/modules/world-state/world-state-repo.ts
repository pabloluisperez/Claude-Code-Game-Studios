/**
 * Repository for `world_snapshots` — the ADR-005 append-only persistence layer
 * for the cascade engine.
 *
 * This module is the boundary between the pure-functional cascade engine
 * (in `packages/shared/src/sim/`) and the Postgres-backed history table. The
 * advance loop (event-system epic, ADR-008) is the only caller of
 * `saveTickResult`; `loadCurrentWorldState` is used by both the advance worker
 * (resume from latest) and read-only services like /economy.
 *
 * **Schema note (Sprint 7 deviation from CASCADE-015 spec)**: the live schema
 * in `packages/db/src/schema/playthroughs.ts` has a `uniqueIndex(playthroughId, week)`
 * — i.e. the "idempotent append-only" design. The story spec AC #6 anticipated
 * pure-append (no unique constraint). Both designs satisfy ADR-005's append-only
 * intent; the live design is stricter (DB rejects duplicates loudly). The
 * integration test for AC #6 asserts that duplicate INSERT throws.
 *
 * Story: CASCADE-ENGINE-015
 * Control Manifest: 2026-05-19
 */

import { db, worldSnapshots, eq, desc } from '@smt/db';
import {
  WorldStateJsonSchema,
  DelayedEffectsJsonSchema,
  type DelayedEffectsBuffer,
  type SnapshotPayload,
} from '@smt/shared';
import type { WorldState } from '@smt/shared/sim/cascade-types';

/**
 * Tx-or-db handle: either the global `db` client or a Drizzle transaction
 * handle from `db.transaction(async (tx) => { ... })`. The advance loop
 * wraps its full pipeline in one transaction (per control-manifest
 * "Transactional advance() pipeline" rule), passing `tx` here.
 */
export type DbHandle = typeof db;

interface SaveTickResultArgs {
  readonly playthroughId: string;
  readonly week: number;
  readonly worldState: Readonly<WorldState>;
  readonly delayedEffectsBuffer: DelayedEffectsBuffer;
}

/**
 * Append a snapshot row for the given week. Throws if `(playthroughId, week)`
 * is already present (live schema's unique index — see module comment).
 *
 * The caller controls transaction discipline: pass `tx` to keep the insert
 * atomic with the surrounding advance pipeline.
 */
export async function saveTickResult(
  handle: DbHandle,
  args: SaveTickResultArgs,
): Promise<void> {
  await handle.insert(worldSnapshots).values({
    playthroughId: args.playthroughId,
    week: args.week,
    worldState: args.worldState as unknown as Record<string, number>,
    delayedEffectsBuffer: args.delayedEffectsBuffer as unknown as readonly unknown[],
  });
}

interface LoadResult {
  readonly week: number;
  readonly worldState: WorldState;
  readonly delayedEffectsBuffer: DelayedEffectsBuffer;
}

/**
 * Load the most recent snapshot for the given playthrough. Returns `null` if
 * the playthrough has no snapshots yet (i.e. first advance() not yet executed).
 *
 * Validates the persisted jsonb columns via Zod — schema drift / manual DB
 * edits surface here as a `ZodError` rather than silent data corruption.
 */
export async function loadCurrentWorldState(
  handle: DbHandle,
  playthroughId: string,
): Promise<LoadResult | null> {
  const rows = await handle
    .select()
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthroughId))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const worldState = WorldStateJsonSchema.parse(row.worldState);
  const delayedEffectsBuffer = DelayedEffectsJsonSchema.parse(
    row.delayedEffectsBuffer,
  );

  return {
    week: row.week,
    worldState,
    delayedEffectsBuffer,
  };
}

/**
 * Combined-payload helper. Used by callers that hold a `SnapshotPayload`
 * (e.g. the advance loop building one from a TickResult).
 */
export async function saveSnapshotPayload(
  handle: DbHandle,
  playthroughId: string,
  week: number,
  payload: SnapshotPayload,
): Promise<void> {
  return saveTickResult(handle, {
    playthroughId,
    week,
    worldState: payload.worldState,
    delayedEffectsBuffer: payload.delayedEffectsBuffer,
  });
}

/**
 * Stadium upgrades shared types.
 *
 * Story STADIUM-UPGRADES-003. Mirrors the Drizzle schema in
 * packages/db/src/schema/stadium-upgrades.ts but lives in @smt/shared so
 * sim code, frontend, and backend can all reference the same type contracts
 * without depending on the db package.
 */

export const STADIUM_TRACKS = ['gradas', 'pitch', 'servicios', 'training', 'academy'] as const;
export type Track = (typeof STADIUM_TRACKS)[number];

export type ItemTier = 1 | 2 | 3 | 4;

export type ItemStatus = 'queued' | 'in_progress' | 'complete' | 'cancelled';

/**
 * Snapshot of completed items per track-Estadio (used by F1).
 * The 3 tracks-Estadio (gradas + pitch + servicios) feed `stadium_visual_level`.
 */
export type CompletedItemsByTrack = {
  gradas: number;
  pitch: number;
  servicios: number;
};

/**
 * Persisted denormalized counters (in world_snapshots).
 *
 * - `stadium_upgrade_count` = gradas + pitch + servicios items complete (max 24)
 * - `training_facility_level` = items complete in training track (max 8)
 * - `youth_academy_level` = items complete in academy track (max 8)
 */
export type StadiumState = {
  stadium_upgrade_count: number;
  training_facility_level: number;
  youth_academy_level: number;
};

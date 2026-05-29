/**
 * DB reset — wipes ALL game + auth data to start completely fresh.
 * Pablo 2026-05-27. Run via `pnpm db:reset` (root) or `turbo run db:reset`.
 *
 * TRUNCATE ... RESTART IDENTITY CASCADE drops every row but keeps the schema
 * and applied migrations, so no re-migration is needed afterwards.
 *
 * Reference catalog tables (stadium_upgrade_items) are also cleared — a fresh
 * playthrough reseeds whatever it needs at creation time.
 */

import { db } from './client.js';
import { sql } from 'drizzle-orm';

const TABLES = [
  'ai_club_window_state',
  'calendar_events',
  'career_milestones',
  'clubs',
  'divisions',
  'fixtures',
  'leagues',
  'manager_profiles',
  'match_sessions',
  'player_buyer_rejections',
  'players',
  'playthroughs',
  'saved_searches',
  'scouting_actions',
  'scouting_market_window_status',
  'seasons',
  'skill_xp_events',
  'sponsors',
  'stadium_upgrade_items',
  'staff',
  'staff_messages',
  'standings',
  'transfer_offers',
  'tv_contracts',
  'world_snapshots',
  // Auth — full wipe (Pablo: 'que borre todo, incluido usuario').
  'sessions',
  'users',
];

async function main() {
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  // eslint-disable-next-line no-console
  console.log(`DB reset — ${TABLES.length} tablas vaciadas. Regístrate de nuevo y crea carrera.`);
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('DB reset failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

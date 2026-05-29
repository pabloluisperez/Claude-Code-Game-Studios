/**
 * Vitest globalSetup for @smt/api — schema drift guard.
 *
 * Runs once before the api test suite. If Postgres is reachable, verifies that a
 * set of recently-added columns exist. A missing column means the local DB is
 * behind on migrations — exactly the drift that silently failed 90 tests at the
 * start of the Sprint 25 verification (the `transfer_window_open` column from
 * migration 0044 had never been applied to the dev volume). We now fail fast
 * with an actionable message instead of a wall of confusing INSERT errors.
 *
 * If the DB is unreachable, this is a no-op: integration tests self-skip via the
 * `dbReachable ? describe : describe.skip` convention used across the suite.
 *
 * Sprint 26 — retro action item A3.
 */
import { db, sql } from '@smt/db';

/** Recently-added columns whose absence indicates an un-applied migration. */
const REQUIRED_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['playthroughs', 'transfer_window_open'],
  ['players', 'contract_status'],
  ['players', 'wage_expectation_eur_k_week'],
  ['clubs', 'merch_scarf_stock'],
  ['stadium_upgrade_items', 'weeks_remaining'],
];

async function closePool(): Promise<void> {
  try {
    await (db.$client as unknown as { end: () => Promise<void> }).end();
  } catch {
    /* pool already closed — ignore */
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  let reachable = true;
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    reachable = false;
  }

  if (!reachable) {
    // DB intentionally absent — per-test guards skip integration tests.
    console.warn(
      '[schema-healthcheck] Postgres unreachable — integration tests will self-skip.',
    );
    return closePool;
  }

  const missing: string[] = [];
  for (const [table, column] of REQUIRED_COLUMNS) {
    const res = await db.execute(
      sql`SELECT 1 FROM information_schema.columns
          WHERE table_name = ${table} AND column_name = ${column} LIMIT 1`,
    );
    const rows =
      (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
    if (!rows || rows.length === 0) missing.push(`${table}.${column}`);
  }

  if (missing.length > 0) {
    // Close the pool before throwing so the runner doesn't hang on an open handle.
    await closePool();
    throw new Error(
      `[schema-healthcheck] Local DB is missing column(s): ${missing.join(', ')}. ` +
        `The schema is behind on migrations. Run \`pnpm --filter @smt/db db:migrate\` ` +
        `(or apply the pending migration manually) before running the api test suite.`,
    );
  }

  return closePool;
}

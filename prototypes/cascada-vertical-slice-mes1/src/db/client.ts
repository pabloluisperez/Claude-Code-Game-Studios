// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const DEFAULT_URL = "postgres://slice:slice@localhost:5435/cascada_slice";

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (_db) return _db;
  const url = process.env.SLICE_DATABASE_URL ?? DEFAULT_URL;
  _pool = new pg.Pool({ connectionString: url, max: 10 });
  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export { schema };

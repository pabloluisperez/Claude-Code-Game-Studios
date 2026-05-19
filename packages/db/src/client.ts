import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgres://smt:smt@localhost:5433/smt',
  max: 10
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;

export * from './schema/index.js';

// Re-export drizzle query helpers so workspace consumers (apps/web) don't need
// to add drizzle-orm as a direct dependency.
export { and, or, eq, ne, gt, gte, lt, lte, desc, asc, sql, inArray } from 'drizzle-orm';
export { alias } from 'drizzle-orm/pg-core';

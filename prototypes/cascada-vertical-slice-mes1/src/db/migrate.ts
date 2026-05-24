// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./client.js";

async function main(): Promise<void> {
  const db = getDb();
  console.log("Running migrations from ./drizzle…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations done.");
  await closeDb();
}

main().catch((err) => {
  console.error("Migrate failed:", err);
  process.exit(1);
});

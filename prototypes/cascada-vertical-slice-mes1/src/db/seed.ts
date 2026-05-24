// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can we seed 20 clubs + 1 playthrough + 380 fixtures + 20 standings deterministically?
// Date: 2026-05-18

import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { REAL_PUEBLO, RIVALS, SLICE_HOME_FLAGS } from "../sim/player-gen.js";
import { REAL_PUEBLO_INITIAL, SLICE_SEED } from "../sim/seed-data.js";
import { getDb, schema } from "./client.js";
import { forceTargetSchedule, generateRoundRobin } from "./fixture-gen.js";

const SLICE_PLAYTHROUGH_ID = "playthrough-slice-001";

/**
 * Idempotent seed for the slice. Safe to re-run — clears slice rows then
 * inserts fresh state. Production seed lives in packages/db/src/seed/.
 */
export async function seedSlice(): Promise<void> {
  const db = getDb();
  const allClubs = buildAllClubs();

  console.log(`Seeding ${allClubs.length} clubs…`);

  // Clear in dependency order
  await db.delete(schema.staffMessages).execute();
  await db.delete(schema.standings).execute();
  await db.delete(schema.matchSessions).execute();
  await db.delete(schema.fixtures).execute();
  await db.delete(schema.worldSnapshots).execute();
  await db.delete(schema.playthroughs).execute();
  await db.delete(schema.clubs).execute();

  // 1. Clubs
  await db.insert(schema.clubs).values(
    allClubs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      shortName: c.slug.toUpperCase(),
      baseSkill: c.baseSkill,
    })),
  );

  // 2. Playthrough
  await db.insert(schema.playthroughs).values({
    id: SLICE_PLAYTHROUGH_ID,
    managerClubId: REAL_PUEBLO.id,
    currentWeek: 1,
    seed: SLICE_SEED,
  });

  // 3. Initial WorldSnapshot (week 0 — pre-week-1 state)
  await db.insert(schema.worldSnapshots).values({
    playthroughId: SLICE_PLAYTHROUGH_ID,
    week: 0,
    state: REAL_PUEBLO_INITIAL,
    delayedBuffer: [],
  });

  // 4. Fixtures — full 38-matchday double round-robin, then force RP's first 4
  const clubIds = allClubs.map((c) => c.id);
  const baseFixtures = generateRoundRobin(clubIds);
  const rivalIds = RIVALS.map((r) => r.id);
  const adjustedFixtures = forceTargetSchedule(
    baseFixtures,
    REAL_PUEBLO.id,
    rivalIds,
    SLICE_HOME_FLAGS,
  );

  console.log(`Inserting ${adjustedFixtures.length} fixtures…`);
  await db.insert(schema.fixtures).values(
    adjustedFixtures.map((f) => ({
      id: uuid(),
      playthroughId: SLICE_PLAYTHROUGH_ID,
      week: f.week,
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      status: "scheduled",
    })),
  );

  // 5. Standings — one row per club, all zeros
  await db.insert(schema.standings).values(
    allClubs.map((c) => ({
      playthroughId: SLICE_PLAYTHROUGH_ID,
      clubId: c.id,
    })),
  );

  console.log(`Seed complete. Playthrough: ${SLICE_PLAYTHROUGH_ID}`);
}

function buildAllClubs(): Array<{
  id: string;
  slug: string;
  name: string;
  baseSkill: number;
}> {
  // 1 Real Pueblo + 4 named rivals + 15 procedural "background" clubs (filler)
  const out = [REAL_PUEBLO, ...RIVALS];
  // Generate 15 filler clubs with stable IDs/seeds for determinism
  const fillerNames = [
    "Atlético del Norte",
    "Unión Sur",
    "CD Litoral",
    "Verde FC",
    "Roca Alta",
    "Sporting Vega",
    "Río Plata",
    "Cruz del Sol",
    "Mar y Sierra",
    "Bahía CF",
    "Llano Real",
    "Sierra Unida",
    "Costera FC",
    "Albión del Este",
    "Peñas Blancas",
  ];
  for (let i = 0; i < fillerNames.length; i++) {
    const name = fillerNames[i]!;
    out.push({
      id: `filler-${i + 1}`,
      slug: `f${i + 1}`,
      name,
      baseSkill: 45 + ((i * 7) % 18), // 45..62 spread
    });
  }
  // Should be 20 total
  if (out.length !== 20) {
    throw new Error(`Expected 20 clubs, got ${out.length}`);
  }
  return out;
}

export async function isSeeded(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.playthroughs)
    .where(eq(schema.playthroughs.id, SLICE_PLAYTHROUGH_ID))
    .limit(1);
  return rows.length > 0;
}

export { SLICE_PLAYTHROUGH_ID };

// CLI entry: `npx tsx src/db/seed.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSlice()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

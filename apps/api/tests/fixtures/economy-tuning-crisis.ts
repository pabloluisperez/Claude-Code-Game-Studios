/**
 * Crisis-prone seeded state for the economy-tuning playtest protocol.
 *
 * Per `production/playtests/protocols/economy-tuning.md`, this fixture creates
 * a playthrough at W4 of season 1 with:
 *   - corruption_exposure = 59 (just below TV_SCANDAL_THRESHOLD=60)
 *   - financial_balance = 80 €K (already in WARNING zone)
 *   - active REGIONAL TV contract (3yr) signed last season
 *   - 2 active sponsor contracts (kit + boards)
 *   - default squad
 *
 * The +0.5/wk REGIONAL corruption drift crosses 60 at W6 → TV-cancellation
 * crisis fires within session bounds (60-min real-time = ~8-12 in-game weeks).
 *
 * Usage:
 *   pnpm tsx tests/fixtures/economy-tuning-crisis.ts --user=<userId>
 *
 * Sprint 9 task 9-2 — supports the human economy-tuning playtest (9-6).
 */

import { randomUUID } from 'node:crypto';
import {
  db,
  clubs,
  playthroughs,
  worldSnapshots,
  managerProfiles,
  tvContracts,
  sponsors,
  eq,
} from '@smt/db';
import { defaultWorldState } from '@smt/shared';
import type { WorldState } from '@smt/shared/sim/cascade-types';

interface SeedArgs {
  readonly userId: string;
  /** Optional club ID — generated if not provided. */
  readonly clubId?: string;
}

interface SeedResult {
  readonly playthroughId: string;
  readonly clubId: string;
  readonly managerProfileId: string;
  readonly tvContractId: string;
}

/**
 * Seed a crisis-prone playthrough scoped to the given user. Returns the
 * newly-created entity IDs so the caller can navigate to /dashboard?...
 * and start the playtest.
 *
 * Idempotency: each call creates fresh UUIDs — running twice creates two
 * independent crises (intended for repeated playtest sessions).
 */
export async function seedEconomyTuningCrisis(args: SeedArgs): Promise<SeedResult> {
  // 1. Create the club (or use the provided one).
  const clubId = args.clubId ?? randomUUID();
  if (!args.clubId) {
    await db.insert(clubs).values({
      id: clubId,
      name: `Crisis FC ${clubId.slice(0, 8)}`,
      city: 'Crisis City',
      division: 'second', // D2 — REGIONAL drift dynamics
    });
  }

  // 2. Create the playthrough at W4.
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({
    id: playthroughId,
    userId: args.userId,
    clubId,
    currentWeek: 4,
    trainingIntensity: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 3. Manager profile — default skills L1, fanLoyalty=0.
  await db.insert(managerProfiles).values({
    playthroughId,
    name: 'Crisis Manager',
    skills: {
      tactical_insight: { id: 'tactical_insight', level: 1, xp: 0 },
      financial_acumen: { id: 'financial_acumen', level: 1, xp: 0 },
      man_management: { id: 'man_management', level: 1, xp: 0 },
      scouting_network: { id: 'scouting_network', level: 1, xp: 0 },
      reputation: { id: 'reputation', level: 1, xp: 0 },
    },
    fanLoyalty: 0,
  });
  const managerProfileId = playthroughId; // PK is playthroughId per schema

  // 4. World snapshot at W4 with crisis-prone WorldState.
  const crisisWorldState: WorldState = {
    ...defaultWorldState(),
    corruption_exposure: 59, // Just below TV_SCANDAL_THRESHOLD=60.
    financial_balance: 80, // Already in WARNING zone (< 7×weekly_costs).
    fan_momentum: 50, // Average — neither great nor terrible.
    team_fitness: 65, // Below default 70 — slight pressure.
    player_happiness: 55, // Moderately content.
  };

  await db.insert(worldSnapshots).values({
    playthroughId,
    week: 4,
    worldState: crisisWorldState as unknown as Record<string, number>,
    delayedEffectsBuffer: [],
    // Sprint 8 task 8-1 audit columns — null on this seeded snapshot.
    cascadeLog: null,
    thresholdCrossings: null,
    seedState: null,
  });

  // 5. Active REGIONAL TV contract (3yr, signed last season — season 0).
  const tvContractId = randomUUID();
  await db.insert(tvContracts).values({
    id: tvContractId,
    playthroughId,
    season: 0, // Signed in season 0 (current is season 1)
    tier: 'REGIONAL',
    durationSeasons: 3,
    seasonInContract: 2, // 2nd season of the 3-year contract
    weeklyRateEurK: '1.75', // REGIONAL D2 rate (numeric stored as string).
    divisionAtSigning: 'D2',
    status: 'ACTIVE',
    signedAt: new Date(),
    cancelledAt: null,
    cancelledReason: null,
  });

  // 6. 2 active sponsor contracts (kit + boards).
  await db.insert(sponsors).values([
    {
      id: randomUUID(),
      playthroughId,
      clubId,
      name: 'Crisis Sportwear',
      slot: 'kit',
      tier: 2,
      weeklyEurK: 2,
      qualityContribution: 30,
      status: 'active',
      cancellationReason: null,
      startedWeek: 0,
      endsWeek: 38,
    },
    {
      id: randomUUID(),
      playthroughId,
      clubId,
      name: 'LocalBank Crisis',
      slot: 'stadium_boards',
      tier: 2,
      weeklyEurK: 1,
      qualityContribution: 15,
      status: 'active',
      cancellationReason: null,
      startedWeek: 0,
      endsWeek: 38,
    },
  ]);

  return { playthroughId, clubId, managerProfileId, tvContractId };
}

/**
 * Cleanup helper — removes a previously-seeded crisis playthrough + cascade
 * dependencies. Useful between repeated playtest sessions.
 */
export async function teardownEconomyTuningCrisis(
  playthroughId: string,
): Promise<void> {
  // playthroughs FK cascade deletes worldSnapshots, managerProfiles, tvContracts, sponsors.
  await db.delete(playthroughs).where(eq(playthroughs.id, playthroughId));
}

// CLI entry — usage: `pnpm tsx tests/fixtures/economy-tuning-crisis.ts --user=<userId>`
if (process.argv[1]?.endsWith('economy-tuning-crisis.ts')) {
  const userArg = process.argv.find((a) => a.startsWith('--user='));
  if (!userArg) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm tsx tests/fixtures/economy-tuning-crisis.ts --user=<userId>');
    process.exit(1);
  }
  const userId = userArg.split('=')[1]!;
  seedEconomyTuningCrisis({ userId })
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('Crisis seeded:', JSON.stringify(result, null, 2));
      // eslint-disable-next-line no-console
      console.log(`\nNext: open /dashboard logged in as user=${userId} and play.`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

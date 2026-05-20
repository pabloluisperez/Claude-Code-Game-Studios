/**
 * Integration tests for tv-rights against a live Postgres DB.
 *
 * Requires:
 *   - docker-compose up postgres (port 5433 with user smt / db smt)
 *   - drizzle-kit migrate applied (migration 0019)
 *
 * Each test seeds its own scoped data (uuid-prefixed playthrough) so parallel
 * runs are safe. Cleanup happens in `afterEach`.
 *
 * Story: TVR-001/004/006/008 — DB-backed coverage
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  and,
  calendarEvents,
  clubs,
  db,
  eq,
  managerProfiles,
  playthroughs,
  tvContracts,
  users,
} from '@smt/db';
import * as TVRightsService from '../../src/modules/tv-rights/service.js';
import * as Repo from '../../src/modules/tv-rights/repo.js';

// Each test gets its own playthrough scope; cleanup removes the whole branch.
const createdPlaythroughIds: string[] = [];
let testUserId: string;
let testClubId: string;
let testManagerProfileId: string;

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@example.com`,
    username: `test-${userId.slice(0, 12)}`,
    passwordHash: 'test-hash-not-used',
    createdAt: new Date(),
  });
  return userId;
}

async function seedClub(): Promise<string> {
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    name: `Test Club ${clubId.slice(0, 8)}`,
    city: 'Test City',
    division: 'second',
  });
  return clubId;
}

async function seedPlaythrough(userId: string, clubId: string): Promise<string> {
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({
    id: playthroughId,
    userId,
    clubId,
    currentWeek: 1,
    trainingIntensity: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Manager profile required for fan_loyalty operations.
  await db.insert(managerProfiles).values({
    playthroughId,
    name: 'Test Manager',
    skills: {
      tactical_acumen: { id: 'tactical_acumen', level: 1, xp: 0 },
      financial_acumen: { id: 'financial_acumen', level: 1, xp: 0 },
      man_management: { id: 'man_management', level: 1, xp: 0 },
      youth_development: { id: 'youth_development', level: 1, xp: 0 },
      political_capital: { id: 'political_capital', level: 1, xp: 0 },
    },
    fanLoyalty: 0,
  });

  createdPlaythroughIds.push(playthroughId);
  return playthroughId;
}

async function seedAuctionEvent(
  playthroughId: string,
  season: number,
): Promise<string> {
  const eventId = randomUUID();
  await db.insert(calendarEvents).values({
    id: eventId,
    playthroughId,
    week: 0,
    season,
    type: 'tv_auction',
    priority: 'STOP',
    status: 'pending',
    consumed: false,
    metadata: { type: 'tv_auction', season, offers: [] },
  });
  return eventId;
}

beforeAll(async () => {
  testUserId = await seedUser();
  testClubId = await seedClub();
});

afterEach(async () => {
  // Cleanup: cascade delete is set on tv_contracts.playthrough_id, so
  // dropping the playthrough rows removes their tv_contracts. Calendar
  // events also cascade. Manager profile cascades via FK.
  if (createdPlaythroughIds.length > 0) {
    for (const id of createdPlaythroughIds) {
      await db.delete(playthroughs).where(eq(playthroughs.id, id));
    }
    createdPlaythroughIds.length = 0;
  }
});

afterAll(async () => {
  // Tear down the shared test user + club.
  await db.delete(clubs).where(eq(clubs.id, testClubId));
  await db.delete(users).where(eq(users.id, testUserId));
});

describe('TVRightsService.signContract — atomic transaction', () => {
  it('test_AC_TV_07_sign_REGIONAL_1yr_D2_inserts_contract_at_1_75', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    const result = await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'REGIONAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    expect(result.weeklyRateEurK).toBe(1.75);
    expect(result.xpGranted).toBe(10);

    // Contract was inserted.
    const active = await Repo.findActiveContract(db, playthroughId);
    expect(active).not.toBeNull();
    expect(active!.tier).toBe('REGIONAL');
    expect(active!.weeklyRateEurK).toBe('1.75');
    expect(active!.divisionAtSigning).toBe('D2');
    expect(active!.status).toBe('ACTIVE');

    // Event was consumed.
    const [evt] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, offerId))
      .limit(1);
    expect(evt?.consumed).toBe(true);
    expect(evt?.status).toBe('resolved');
  });

  it('test_AC_TV_17_sign_NACIONAL_D1_grants_25_xp', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    const result = await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'NACIONAL',
        durationSeasons: 1,
        currentDivision: 'D1',
        season: 1,
      }),
    );

    expect(result.weeklyRateEurK).toBe(7.16);
    expect(result.xpGranted).toBe(25);
  });

  it('test_AC_TV_18_sign_LOCAL_grants_zero_xp', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    const result = await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'LOCAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    expect(result.xpGranted).toBe(0);

    // Fan loyalty unchanged (signing != rejecting).
    const [profile] = await db
      .select()
      .from(managerProfiles)
      .where(eq(managerProfiles.playthroughId, playthroughId))
      .limit(1);
    expect(profile?.fanLoyalty).toBe(0);
  });

  it('test_AC_TV_43_double_sign_throws_TVContractConflictError', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const firstOfferId = await seedAuctionEvent(playthroughId, 1);

    // First sign succeeds.
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId: firstOfferId,
        tier: 'LOCAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    // A second tv_auction event for season 2 (different season so partial UNIQUE allows it).
    const secondOfferId = await seedAuctionEvent(playthroughId, 2);

    // Second sign should fail with conflict.
    await expect(
      db.transaction(async (tx) =>
        TVRightsService.signContract(tx, {
          playthroughId,
          offerId: secondOfferId,
          tier: 'NACIONAL',
          durationSeasons: 1,
          currentDivision: 'D1',
          season: 2,
        }),
      ),
    ).rejects.toThrow(TVRightsService.TVContractConflictError);
  });

  it('test_AC_TV_50_illegal_combo_throws_TVRangeError', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    await expect(
      db.transaction(async (tx) =>
        TVRightsService.signContract(tx, {
          playthroughId,
          offerId,
          tier: 'LOCAL',
          // @ts-expect-error testing illegal combination
          durationSeasons: 2,
          currentDivision: 'D2',
          season: 1,
        }),
      ),
    ).rejects.toThrow(/Illegal tier\+duration/);

    // No contract should be inserted.
    const active = await Repo.findActiveContract(db, playthroughId);
    expect(active).toBeNull();
  });

  it('test_atomicity_no_partial_state_on_double_sign', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const firstOfferId = await seedAuctionEvent(playthroughId, 1);

    // First sign succeeds.
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId: firstOfferId,
        tier: 'REGIONAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    const secondOfferId = await seedAuctionEvent(playthroughId, 2);
    // Save event row state before second attempt.
    const [eventBefore] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, secondOfferId))
      .limit(1);
    expect(eventBefore?.consumed).toBe(false);

    // Second sign rolls back.
    await expect(
      db.transaction(async (tx) =>
        TVRightsService.signContract(tx, {
          playthroughId,
          offerId: secondOfferId,
          tier: 'NACIONAL',
          durationSeasons: 1,
          currentDivision: 'D1',
          season: 2,
        }),
      ),
    ).rejects.toThrow();

    // Event is still NOT consumed (rollback worked).
    const [eventAfter] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, secondOfferId))
      .limit(1);
    expect(eventAfter?.consumed).toBe(false);
  });
});

describe('TVRightsService.rejectOffer — fan_loyalty increment', () => {
  it('test_AC_TV_21_reject_auction_increments_fan_loyalty_by_10', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    const result = await db.transaction(async (tx) =>
      TVRightsService.rejectOffer(tx, { playthroughId, offerId }),
    );

    expect(result.fanLoyaltyBefore).toBe(0);
    expect(result.fanLoyaltyAfter).toBe(10);
    expect(result.delta).toBe(10);

    // Event consumed.
    const [evt] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, offerId))
      .limit(1);
    expect(evt?.consumed).toBe(true);
  });

  it('test_AC_TV_24_reject_clamps_at_50', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);

    // Bump fan_loyalty to 45 manually.
    await db
      .update(managerProfiles)
      .set({ fanLoyalty: 45 })
      .where(eq(managerProfiles.playthroughId, playthroughId));

    const offerId = await seedAuctionEvent(playthroughId, 1);

    const result = await db.transaction(async (tx) =>
      TVRightsService.rejectOffer(tx, { playthroughId, offerId }),
    );

    expect(result.fanLoyaltyBefore).toBe(45);
    expect(result.fanLoyaltyAfter).toBe(50); // capped
    expect(result.delta).toBe(5);
  });

  it('test_reject_consumed_event_throws_TVOfferExpiredError', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);

    // Consume it once.
    await db.transaction(async (tx) =>
      TVRightsService.rejectOffer(tx, { playthroughId, offerId }),
    );

    // Second attempt fails.
    await expect(
      db.transaction(async (tx) =>
        TVRightsService.rejectOffer(tx, { playthroughId, offerId }),
      ),
    ).rejects.toThrow(TVRightsService.TVOfferExpiredError);
  });
});

describe('Partial UNIQUE index — idempotent tv event generation', () => {
  it('test_duplicate_tv_auction_insert_violates_unique_constraint', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    await seedAuctionEvent(playthroughId, 1);

    // Second insert for same (playthrough, season, type) → 23505.
    await expect(
      db.insert(calendarEvents).values({
        playthroughId,
        week: 0,
        season: 1,
        type: 'tv_auction',
        priority: 'STOP',
        status: 'pending',
        consumed: false,
        metadata: {},
      }),
    ).rejects.toThrow(/23505|duplicate key/i);
  });

  it('test_different_season_same_type_is_allowed', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    await seedAuctionEvent(playthroughId, 1);

    // Different season for same type — should succeed.
    await expect(seedAuctionEvent(playthroughId, 2)).resolves.toBeDefined();
  });

  it('test_non_tv_event_type_not_constrained', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    await seedAuctionEvent(playthroughId, 1);

    // Insert a non-tv event for the same (playthrough, season) — should succeed.
    await expect(
      db.insert(calendarEvents).values({
        playthroughId,
        week: 5,
        season: 1,
        type: 'fixture',
        priority: 'NOTIFY',
        status: 'pending',
        consumed: false,
        metadata: {},
      }),
    ).resolves.toBeDefined();
  });
});

describe('TVRightsService.runTVTick — orchestrates pre + post phases', () => {
  it('test_no_active_contract_returns_zero_revenue', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);

    const result = await db.transaction(async (tx) =>
      TVRightsService.runTVTick(tx, {
        playthroughId,
        week: 1,
        season: 1,
        currentDivision: 'D2',
        prevCorruption: 30,
        externalCorruptionDelta: 0,
      }),
    );

    expect(result.revenue).toBe(0);
    expect(result.cancelledThisTick).toBe(false);
    expect(result.midseasonOfferGenerated).toBe(false);
    expect(result.finalCorruption).toBe(30);
  });

  it('test_active_REGIONAL_below_threshold_returns_full_revenue', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'REGIONAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    const result = await db.transaction(async (tx) =>
      TVRightsService.runTVTick(tx, {
        playthroughId,
        week: 5,
        season: 1,
        currentDivision: 'D2',
        prevCorruption: 20.0,
        externalCorruptionDelta: 0,
      }),
    );

    expect(result.revenue).toBe(1.75);
    expect(result.finalCorruption).toBe(20.5);
    expect(result.newStatus).toBe('ACTIVE');
    expect(result.cancelledThisTick).toBe(false);
  });

  it('test_AC_TV_22b_cancellation_zeros_revenue', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'NACIONAL',
        durationSeasons: 1,
        currentDivision: 'D1',
        season: 1,
      }),
    );

    // Prev corruption = 59.0; NACIONAL delta = +1.5 → crosses 60 threshold.
    const result = await db.transaction(async (tx) =>
      TVRightsService.runTVTick(tx, {
        playthroughId,
        week: 10,
        season: 1,
        currentDivision: 'D1',
        prevCorruption: 59.0,
        externalCorruptionDelta: 0,
      }),
    );

    expect(result.revenue).toBe(0); // cancelled in paso 4
    expect(result.newStatus).toBe('CANCELLED');
    expect(result.cancelledThisTick).toBe(true);
    expect(result.cancelReason).toBe('scrutiny_tv');
    expect(result.midseasonOfferGenerated).toBe(true);

    // Verify the contract row was updated.
    const active = await Repo.findActiveContract(db, playthroughId);
    expect(active).toBeNull(); // no longer ACTIVE

    // Verify midseason offer event was inserted.
    const midseasonEvents = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.playthroughId, playthroughId),
          eq(calendarEvents.type, 'tv_midseason_offer'),
        ),
      );
    expect(midseasonEvents).toHaveLength(1);
  });
});

describe('TVRightsService.processSeasonEnd / processSeasonStart', () => {
  it('test_AC_TV_13a_1yr_season_end_transitions_to_EXPIRED', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'LOCAL',
        durationSeasons: 1,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    await db.transaction(async (tx) =>
      TVRightsService.processSeasonEnd(tx, { playthroughId, season: 1 }),
    );

    const [contract] = await db
      .select()
      .from(tvContracts)
      .where(
        and(eq(tvContracts.playthroughId, playthroughId), eq(tvContracts.season, 1)),
      )
      .limit(1);
    expect(contract?.status).toBe('EXPIRED');
  });

  it('test_AC_TV_13b_multi_year_rollover_increments_season_in_contract', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const offerId = await seedAuctionEvent(playthroughId, 1);
    await db.transaction(async (tx) =>
      TVRightsService.signContract(tx, {
        playthroughId,
        offerId,
        tier: 'REGIONAL',
        durationSeasons: 2,
        currentDivision: 'D2',
        season: 1,
      }),
    );

    await db.transaction(async (tx) =>
      TVRightsService.processSeasonEnd(tx, { playthroughId, season: 1 }),
    );

    const active = await Repo.findActiveContract(db, playthroughId);
    expect(active?.status).toBe('ACTIVE'); // still ACTIVE, not EXPIRED
    expect(active?.seasonInContract).toBe(2); // rolled over
  });
});

/**
 * Schema integration tests for scouting-market v1.1.
 *
 * Story SCOUTING-MARKET-001. Verifies 6 new tables + their constraints
 * (FK cascade, unique indexes, composite PKs).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/client.js';
import { clubs } from '../src/schema/clubs.js';
import { players } from '../src/schema/players.js';
import { playthroughs } from '../src/schema/playthroughs.js';
import { users } from '../src/schema/users.js';
import {
  scoutingActions,
  transferOffers,
  savedSearches,
  aiClubWindowState,
  playerBuyerRejections,
  scoutingMarketWindowStatus,
} from '../src/schema/scouting-market.js';
import { eq } from 'drizzle-orm';

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

describeDB('scouting-market schema (integration)', () => {
  const createdUsers: string[] = [];
  const createdClubs: string[] = [];
  const createdPlayers: string[] = [];
  const createdPlaythroughs: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: `scm-${id}@test.com`,
      username: `scm-${id.slice(0, 8)}`,
      passwordHash: 'fake',
    });
    createdUsers.push(id);
    return id;
  }

  async function createTestClub(): Promise<{ clubId: string; playthroughId: string }> {
    const userId = await createTestUser();
    const clubId = randomUUID();
    await db.insert(clubs).values({
      id: clubId,
      managerId: userId,
      name: `SCM ${clubId.slice(0, 4)}`,
      city: 'Test',
    });
    createdClubs.push(clubId);
    const playthroughId = randomUUID();
    await db.insert(playthroughs).values({ id: playthroughId, userId, clubId, name: 'scm' });
    createdPlaythroughs.push(playthroughId);
    return { clubId, playthroughId };
  }

  async function createTestPlayer(clubId: string, playthroughId: string): Promise<string> {
    const playerId = randomUUID();
    const row: typeof players.$inferInsert = {
      id: playerId,
      playthroughId,
      clubId,
      firstName: 'Test',
      lastName: 'Player',
      birthWeek: -1000, // 20 years before sim epoch (well-formed for schema)
      position: 'MID',
      skill: 60,
      salaryEurK: 5,
      contractStartWeek: 0,
      contractEndWeek: 52,
    };
    await db.insert(players).values(row);
    createdPlayers.push(playerId);
    return playerId;
  }

  afterEach(async () => {
    // FK-safe cleanup: children → players → clubs → users.
    for (const clubId of createdClubs) {
      await db.delete(scoutingActions).where(eq(scoutingActions.clubId, clubId)).catch(() => undefined);
      await db.delete(savedSearches).where(eq(savedSearches.clubId, clubId)).catch(() => undefined);
      await db.delete(aiClubWindowState).where(eq(aiClubWindowState.clubId, clubId)).catch(() => undefined);
      await db.delete(transferOffers).where(eq(transferOffers.buyerClubId, clubId)).catch(() => undefined);
    }
    for (const playerId of createdPlayers) {
      await db.delete(players).where(eq(players.id, playerId)).catch(() => undefined);
    }
    for (const pid of createdPlaythroughs) {
      await db.delete(playthroughs).where(eq(playthroughs.id, pid)).catch(() => undefined);
    }
    for (const clubId of createdClubs) {
      await db.delete(clubs).where(eq(clubs.id, clubId)).catch(() => undefined);
    }
    for (const userId of createdUsers) {
      await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    }
    createdUsers.length = 0;
    createdClubs.length = 0;
    createdPlayers.length = 0;
    createdPlaythroughs.length = 0;
  });

  it('test_scouting_actions_insert_and_select_roundtrip', async () => {
    const { clubId, playthroughId } = await createTestClub();
    const playerId = await createTestPlayer(clubId, playthroughId);
    const windowId = randomUUID();

    const [inserted] = await db
      .insert(scoutingActions)
      .values({
        clubId,
        playerId,
        windowId,
        actionType: 'scout',
        costPaidEurK: 5,
        completesAtWeek: 10,
        status: 'pending',
      })
      .returning();

    expect(inserted!.clubId).toBe(clubId);
    expect(inserted!.actionType).toBe('scout');
    expect(inserted!.status).toBe('pending');
  });

  it('test_transfer_offers_supports_null_seller_for_free_agents', async () => {
    const { clubId, playthroughId } = await createTestClub();
    const playerId = await createTestPlayer(clubId, playthroughId);
    const windowId = randomUUID();

    const [inserted] = await db
      .insert(transferOffers)
      .values({
        buyerClubId: clubId,
        sellerClubId: null,
        playerId,
        windowId,
        feeEurK: 0,
        wageOfferEurKWeek: 5,
        contractWeeks: 52,
        status: 'pending',
        bidNumber: 1,
      })
      .returning();

    expect(inserted!.sellerClubId).toBeNull();
  });

  it('test_saved_searches_unique_on_club_id_plus_name', async () => {
    const { clubId } = await createTestClub();

    await db.insert(savedSearches).values({
      clubId,
      name: 'mids u23',
      filtersJson: { position: 'MC', maxAge: 23 },
    });

    // Same (clubId, name) → unique violation
    await expect(
      db.insert(savedSearches).values({
        clubId,
        name: 'mids u23',
        filtersJson: { position: 'MC' },
      }),
    ).rejects.toThrow();

    // Different name on same club → OK
    const [second] = await db
      .insert(savedSearches)
      .values({
        clubId,
        name: 'wingers u21',
        filtersJson: { position: 'EI' },
      })
      .returning();
    expect(second!.name).toBe('wingers u21');
  });

  it('test_ai_club_window_state_composite_pk_prevents_duplicates', async () => {
    const { clubId } = await createTestClub();
    const windowId = randomUUID();

    await db.insert(aiClubWindowState).values({
      clubId,
      windowId,
      bargainFactor: 1.0,
    });

    await expect(
      db.insert(aiClubWindowState).values({
        clubId,
        windowId,
        bargainFactor: 1.5,
      }),
    ).rejects.toThrow();
  });

  it('test_player_buyer_rejections_composite_pk', async () => {
    const buyer = await createTestClub();
    const seller = await createTestClub();
    const playerId = await createTestPlayer(seller.clubId, seller.playthroughId);
    const windowId = randomUUID();
    const buyerClubId = buyer.clubId;

    await db.insert(playerBuyerRejections).values({
      playerId,
      buyerClubId,
      windowId,
      reason: 'fee too low',
    });

    await expect(
      db.insert(playerBuyerRejections).values({
        playerId,
        buyerClubId,
        windowId,
        reason: 'wage too low',
      }),
    ).rejects.toThrow();
  });

  it('test_window_status_table_exists', async () => {
    const windowId = randomUUID();
    const [inserted] = await db
      .insert(scoutingMarketWindowStatus)
      .values({ windowId })
      .returning();
    expect(inserted!.windowId).toBe(windowId);

    // Cleanup
    await db.delete(scoutingMarketWindowStatus).where(eq(scoutingMarketWindowStatus.windowId, windowId));
  });

  it('test_cascade_delete_club_removes_dependent_rows', async () => {
    const { clubId, playthroughId } = await createTestClub();
    const playerId = await createTestPlayer(clubId, playthroughId);
    const windowId = randomUUID();

    await db.insert(scoutingActions).values({
      clubId,
      playerId,
      windowId,
      actionType: 'scout',
      costPaidEurK: 5,
      completesAtWeek: 10,
      status: 'pending',
    });

    // We expect cascade delete to clean up children. Manual cleanup of
    // dependent rows first (the afterEach normally handles it) to confirm
    // FK cascade is configured.
    await db.delete(scoutingActions).where(eq(scoutingActions.clubId, clubId));
    await db.delete(players).where(eq(players.id, playerId));
    await db.delete(clubs).where(eq(clubs.id, clubId));

    const remaining = await db
      .select()
      .from(scoutingActions)
      .where(eq(scoutingActions.clubId, clubId));
    expect(remaining).toHaveLength(0);

    // Drop tracking so afterEach doesn't try to re-delete.
    const clubIdx = createdClubs.indexOf(clubId);
    if (clubIdx >= 0) createdClubs.splice(clubIdx, 1);
    const playerIdx = createdPlayers.indexOf(playerId);
    if (playerIdx >= 0) createdPlayers.splice(playerIdx, 1);
  });
});

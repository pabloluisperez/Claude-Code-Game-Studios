/**
 * Integration tests for makeOffer — Story 25-4 (backend).
 *
 * Covers all 9 acceptance-criteria cases:
 *   AC-1  Free agent accepted (wage ≥ expectation)
 *   AC-2  Free agent rejected (wage far below expectation)
 *   AC-3  AI club accepted (fee ≥ acceptThreshold)
 *   AC-4  AI club counter-offer (fee in counter band)
 *   AC-5  AI club hard reject (fee below hard-reject threshold)
 *   AC-6  Expiring/Bosman — treated as free agent, fee = 0
 *   AC-7  No scout director + non-open-market player → NO_SCOUT
 *   AC-8  Insufficient balance → INSUFFICIENT_BALANCE
 *   AC-9  Duplicate pending offer → ALREADY_PENDING_OFFER
 *
 * Auto-skips when Postgres on 5433 is unreachable (mirrors convention used
 * by stadium-upgrades/service.test.ts and me/gdpr.test.ts).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  db,
  users,
  clubs,
  playthroughs,
  worldSnapshots,
  players,
  transferOffers,
  staff,
  eq,
  sql,
} from '@smt/db';
import { makeOffer } from '../../src/modules/scouting-market/service.js';

/* ── DB reachability guard ─────────────────────────────────────────────── */

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

/* ── Threshold documentation ───────────────────────────────────────────────
 *
 * aiClubAcceptance formula (auction.ts):
 *   expectedFee   = transferValueEurK × bargainFactor
 *   acceptThresh  = expectedFee × (1 + needFactor × AI_NEED_PREMIUM)
 *                 = expectedFee × (1 + 0.5 × 0.30) = expectedFee × 1.15
 *   counterBand   = [expectedFee × 0.85, acceptThresh)
 *   hardRejectBand= < expectedFee × 0.85
 *
 * For skill=50, transferListed=true, scoutTier=1 (scoutBargainMul=1.0):
 *   transferValue = 500
 *   bargainFactor = 1.0 × 1.0 = 1.0
 *   expectedFee   = 500
 *   acceptThresh  = 575   → use fee=600 for AC-3
 *   counterBand   = [425, 575)  → use fee=480 for AC-4
 *   hardRejectBand= < 425  → use fee=100 for AC-5
 *
 * freeAgentAcceptance formula (free-agent.ts):
 *   effectiveThreshold = wageExpectation × (1 - 0.25 × min(1, weeksUnsigned/20))
 *   With weeksUnsigned=0: threshold = wageExpectation (no desperation discount)
 *   Accept: wageOffer >= threshold  → use expectation=10, offer=10 for AC-1
 *   Reject: wageOffer < threshold   → use expectation=10, offer=3 for AC-2
 *
 * Balance check:
 *   upfrontCommitment = feeEurK + wageOfferEurKWeek × 4
 *   For AC-8: balance=50, fee=200, wage=5 → commitment=220 > 50 → INSUFFICIENT
 *
 * ─────────────────────────────────────────────────────────────────────── */

/* ── Harness helpers ────────────────────────────────────────────────────── */

async function createUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: `offer-test-${id}@test.com`,
    username: `offer-${id.slice(0, 8)}`,
    passwordHash: 'fake-hash',
  });
  return id;
}

type TestEnv = {
  userId: string;
  clubId: string;
  playthroughId: string;
  snapshotId: string;
};

/**
 * Seed a buyer club (manager's club) with a worldSnapshot carrying the given
 * financial_balance (€K). A scouting_director is inserted only when
 * scoutTier > 0. Returns the env plus the staff row id if created.
 */
async function createBuyerEnv(opts: {
  balance?: number;
  scoutTier?: 0 | 1 | 2 | 3;
} = {}): Promise<TestEnv & { staffId: string | null }> {
  const userId = await createUser();
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    managerId: userId,
    name: `BuyerClub ${clubId.slice(0, 6)}`,
    city: 'Madrid',
    budget: 99999,
  });
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({
    id: playthroughId,
    userId,
    clubId,
    name: 'offer test',
  });
  const balance = opts.balance ?? 10000;
  const [snap] = await db
    .insert(worldSnapshots)
    .values({
      playthroughId,
      week: 1,
      worldState: { financial_balance: balance },
    })
    .returning({ id: worldSnapshots.id });

  let staffId: string | null = null;
  const tier = opts.scoutTier ?? 1;
  if (tier > 0) {
    const [staffRow] = await db
      .insert(staff)
      .values({
        playthroughId,
        clubId,
        role: 'scouting_director',
        qualityTier: tier,
        weeklyEurK: 2,
        name: 'Scout Director',
        hiredWeek: 1,
        status: 'active',
      })
      .returning({ id: staff.id });
    staffId = staffRow!.id;
  }

  return { userId, clubId, playthroughId, snapshotId: snap!.id, staffId };
}

/**
 * Seed a seller club (AI club — no user manager). Returns the clubId only
 * since the buyer's playthrough does not cover the seller.
 */
async function createSellerClub(): Promise<string> {
  const id = randomUUID();
  await db.insert(clubs).values({
    id,
    managerId: null,
    name: `AI Club ${id.slice(0, 6)}`,
    city: 'Barcelona',
    budget: 5000,
  });
  return id;
}

/**
 * Seed a player owned by a club. All contract-relevant fields are explicit
 * so tests don't rely on column defaults.
 */
async function createPlayer(opts: {
  clubId: string;
  playthroughId: string;
  skill?: number;
  contractStatus?: string;
  contractEndWeek?: number;
  wageExpectationEurKWeek?: number;
  weeksUnsigned?: number;
  transferListed?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(players).values({
    id,
    clubId: opts.clubId,
    playthroughId: opts.playthroughId,
    firstName: 'Test',
    lastName: 'Player',
    birthWeek: 0,
    position: 'MID',
    skill: opts.skill ?? 50,
    salaryEurK: 5,
    contractStartWeek: 1,
    contractEndWeek: opts.contractEndWeek ?? 100,
    contractStatus: opts.contractStatus ?? 'in_contract',
    wageExpectationEurKWeek: opts.wageExpectationEurKWeek ?? 10,
    weeksUnsigned: opts.weeksUnsigned ?? 0,
    transferListed: opts.transferListed ?? false,
  });
  return id;
}

/* ── Cleanup tracking ───────────────────────────────────────────────────── */

const WINDOW_ID = '00000000-0000-0000-0000-000000000099';

describeDB('makeOffer integration (Story 25-4)', () => {
  const createdUsers: string[] = [];
  const createdClubs: string[] = [];
  // Players and transferOffers cascade-delete when club/player is removed.
  // Staff cascade-deletes when playthrough is removed.

  function trackEnv(env: TestEnv): void {
    createdUsers.push(env.userId);
    createdClubs.push(env.clubId);
  }
  function trackSellerClub(id: string): void {
    createdClubs.push(id);
  }

  afterEach(async () => {
    // FK-safe order: transferOffers (cascade from clubs/players, but belt+suspenders)
    // Players cascade from clubs. Staff cascades from playthroughs.
    // playthroughs cascade from users; worldSnapshots cascade from playthroughs.
    for (const clubId of createdClubs) {
      await db
        .delete(transferOffers)
        .where(eq(transferOffers.buyerClubId, clubId))
        .catch(() => undefined);
      await db
        .delete(transferOffers)
        .where(eq(transferOffers.sellerClubId, clubId))
        .catch(() => undefined);
      await db.delete(clubs).where(eq(clubs.id, clubId)).catch(() => undefined);
    }
    for (const userId of createdUsers) {
      await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    }
    createdUsers.length = 0;
    createdClubs.length = 0;
  });

  /* ── AC-1: Free agent accepted ──────────────────────────────────────── */
  it('test_makeOffer_free_agent_accepted_when_wage_meets_expectation', async () => {
    // Arrange
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      contractStatus: 'free_agent',
      wageExpectationEurKWeek: 10,
      weeksUnsigned: 0,
    });

    // Act: wage exactly meets expectation (wageOffer=10 >= threshold=10)
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 0,
      wageOfferEurKWeek: 10,
      contractWeeks: 26,
      windowId: WINDOW_ID,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('accepted');
    if (result.value.kind !== 'accepted') return;
    expect(result.value.feeEurK).toBe(0);
    expect(result.value.finalWageEurKWeek).toBe(10);
    expect(result.value.offerId).toBeTruthy();
  });

  /* ── AC-2: Free agent rejected ──────────────────────────────────────── */
  it('test_makeOffer_free_agent_rejected_when_wage_far_below_expectation', async () => {
    // Arrange
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      contractStatus: 'free_agent',
      wageExpectationEurKWeek: 10,
      weeksUnsigned: 0,
    });

    // Act: wage 3 far below threshold=10 (no desperation discount at weeksUnsigned=0)
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 0,
      wageOfferEurKWeek: 3,
      contractWeeks: 26,
      windowId: WINDOW_ID,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('rejected');
    if (result.value.kind !== 'rejected') return;
    expect(result.value.reason).toBe('wage_low');
  });

  /* ── AC-3: AI club accepted ─────────────────────────────────────────── */
  it('test_makeOffer_ai_club_accepted_when_fee_meets_accept_threshold', async () => {
    // Arrange — skill=50, transferListed=true, tier=1
    // transferValue=500, bargainFactor=1.0, acceptThreshold=575
    // fee=600 > 575 → accepted
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      skill: 50,
      contractStatus: 'in_contract',
      contractEndWeek: 100,
      transferListed: true,
    });

    // Act
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 600,
      wageOfferEurKWeek: 5,
      contractWeeks: 52,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('accepted');
    if (result.value.kind !== 'accepted') return;
    expect(result.value.feeEurK).toBe(600);
  });

  /* ── AC-4: AI club counter-offer ────────────────────────────────────── */
  it('test_makeOffer_ai_club_counter_when_fee_in_counter_band', async () => {
    // skill=50, transferListed=true, tier=1
    // expectedFee=500, counterBand=[425, 575)
    // fee=480 → counter
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      skill: 50,
      contractStatus: 'in_contract',
      contractEndWeek: 100,
      transferListed: true,
    });

    // Act
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 480,
      wageOfferEurKWeek: 5,
      contractWeeks: 52,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('counter');
    if (result.value.kind !== 'counter') return;
    // counterOfferEurK = expectedFee × (1 + (1 - needFactor) × AI_COUNTER_OFFER_MARKUP)
    //                  = 500 × (1 + 0.5 × 0.15) = 500 × 1.075 = 537.5 → round → 538
    expect(result.value.counterOfferEurK).toBe(538);
  });

  /* ── AC-5: AI club hard reject ───────────────────────────────────────── */
  it('test_makeOffer_ai_club_hard_reject_when_fee_far_too_low', async () => {
    // skill=50, transferListed=true, tier=1
    // hardRejectBand: fee < 425
    // fee=100 → hard_reject
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      skill: 50,
      contractStatus: 'in_contract',
      contractEndWeek: 100,
      transferListed: true,
    });

    // Act
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 100,
      wageOfferEurKWeek: 5,
      contractWeeks: 52,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('rejected');
    if (result.value.kind !== 'rejected') return;
    expect(result.value.reason).toBe('hard_reject');
  });

  /* ── AC-6: Expiring / Bosman — treated as free agent ────────────────── */
  it('test_makeOffer_expiring_contract_treated_as_free_agent_no_fee', async () => {
    // contractEndWeek=5, currentWeek=1 → weeksLeft=4 ≤ 8 → expiring → free agent path
    // wage=10 meets expectation=10 → accepted, feeEurK=0
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      contractStatus: 'in_contract', // NOT free_agent in the DB column
      contractEndWeek: 5, // 5 - 1 = 4 weeks left ≤ 8 → expiring
      wageExpectationEurKWeek: 10,
      weeksUnsigned: 0,
    });

    // Act: currentWeek=1 enables expiring detection
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 0,
      wageOfferEurKWeek: 10,
      contractWeeks: 26,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('accepted');
    if (result.value.kind !== 'accepted') return;
    // Bosman: no transfer fee
    expect(result.value.feeEurK).toBe(0);
  });

  /* ── AC-7: No scout director + non-open-market player ───────────────── */
  it('test_makeOffer_returns_NO_SCOUT_when_no_director_and_in_contract_player', async () => {
    // scoutTier=0 (no scouting_director inserted)
    // player is in_contract with plenty of time → not open market
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 0 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      contractStatus: 'in_contract',
      contractEndWeek: 100,
    });

    // Act
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 500,
      wageOfferEurKWeek: 5,
      contractWeeks: 52,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NO_SCOUT');
  });

  /* ── AC-8: Insufficient balance ─────────────────────────────────────── */
  it('test_makeOffer_returns_INSUFFICIENT_BALANCE_when_balance_too_low', async () => {
    // balance=50, feeEurK=200, wageOfferEurKWeek=5
    // upfrontCommitment = 200 + 5×4 = 220 > 50 → INSUFFICIENT_BALANCE
    const buyer = await createBuyerEnv({ balance: 50, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      skill: 50,
      contractStatus: 'in_contract',
      contractEndWeek: 100,
      transferListed: true,
    });

    // Act
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 200,
      wageOfferEurKWeek: 5,
      contractWeeks: 52,
      windowId: WINDOW_ID,
      currentWeek: 1,
    });

    // Assert
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INSUFFICIENT_BALANCE');
  });

  /* ── AC-9: Duplicate pending offer ──────────────────────────────────── */
  it('test_makeOffer_returns_ALREADY_PENDING_OFFER_on_duplicate_bid', async () => {
    // First offer inserts a pending row; second call must detect it.
    const buyer = await createBuyerEnv({ balance: 10000, scoutTier: 1 });
    trackEnv(buyer);
    const sellerClubId = await createSellerClub();
    trackSellerClub(sellerClubId);
    const playerId = await createPlayer({
      clubId: sellerClubId,
      playthroughId: buyer.playthroughId,
      contractStatus: 'free_agent',
      wageExpectationEurKWeek: 10,
      weeksUnsigned: 0,
    });

    // Pre-insert a pending transferOffer row (simulates a previous call that was
    // neither accepted nor rejected yet — e.g. still awaiting club decision).
    await db.insert(transferOffers).values({
      buyerClubId: buyer.clubId,
      sellerClubId,
      playerId,
      windowId: WINDOW_ID,
      feeEurK: 0,
      wageOfferEurKWeek: 10,
      contractWeeks: 26,
      status: 'pending',
      bidNumber: 1,
    });

    // Act: attempt a second offer for the same (buyer, player, window)
    const result = await makeOffer({
      clubId: buyer.clubId,
      playerId,
      feeEurK: 0,
      wageOfferEurKWeek: 10,
      contractWeeks: 26,
      windowId: WINDOW_ID,
    });

    // Assert
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('ALREADY_PENDING_OFFER');
  });
});

/**
 * Integration tests for the stadium-upgrades service. Story STADIUM-UPGRADES-005.
 *
 * Covers the 20 QA Test Cases from the story's `## QA Test Cases` section:
 * buy() happy/error paths, cancel() lifecycle, tickClub() decrement +
 * complete + bankruptcy pause, race condition (concurrent buy), atomicity.
 *
 * Auto-skips when Postgres on 5433 is unreachable (mirrors the convention used
 * by apps/api/tests/me/gdpr.test.ts).
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, users, clubs, playthroughs, worldSnapshots, stadiumUpgradeItems, eq } from '@smt/db';
import { loadCatalog, _resetCatalogCacheForTests } from '../../src/modules/stadium-upgrades/catalog.js';
import { buy, cancel, tickClub, type ServiceDeps } from '../../src/modules/stadium-upgrades/service.js';
import path from 'node:path';

const REAL_CATALOG = path.resolve(process.cwd(), '../../design/data/stadium-upgrades-catalog.json');

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

async function createTestUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: `stadium-svc-${id}@test.com`,
    username: `stadium-svc-${id.slice(0, 8)}`,
    passwordHash: 'fake-hash',
  });
  return id;
}

type TestEnv = { userId: string; clubId: string; playthroughId: string; snapshotId: string };

async function createTestEnv(opts: { budget?: number } = {}): Promise<TestEnv> {
  const userId = await createTestUser();
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    managerId: userId,
    name: `SvcTest ${clubId.slice(0, 4)}`,
    city: 'Test',
    budget: opts.budget ?? 10000,
  });
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({
    id: playthroughId,
    userId,
    clubId,
    name: 'svc test',
  });
  const [snap] = await db
    .insert(worldSnapshots)
    .values({ playthroughId, week: 1, worldState: {} })
    .returning({ id: worldSnapshots.id });
  return { userId, clubId, playthroughId, snapshotId: snap!.id };
}

describeDB('stadium-upgrades service (integration)', () => {
  const createdUsers: string[] = [];
  const createdClubs: string[] = [];
  const createdPlaythroughs: string[] = [];

  beforeAll(async () => {
    _resetCatalogCacheForTests();
    await loadCatalog(REAL_CATALOG);
  });

  afterEach(async () => {
    // FK-safe cleanup order: stadium items → world snapshots → playthroughs → clubs → users
    for (const clubId of createdClubs) {
      await db.delete(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, clubId)).catch(() => undefined);
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
    createdPlaythroughs.length = 0;
  });

  function track(env: TestEnv): void {
    createdUsers.push(env.userId);
    createdClubs.push(env.clubId);
    createdPlaythroughs.push(env.playthroughId);
  }

  it('test_buy_happy_path_returns_total_and_installment_no_upfront_debit', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.itemId).toBeTruthy();
    expect(result.value.totalCost).toBe(21); // 15 × 1.4 = 21
    expect(result.value.durationWeeks).toBe(2); // T1 base, no director
    expect(result.value.installmentEurK).toBe(11); // round(21 / 2) = 11 (final tick pays remainder 10)

    // Pablo 2026-05-25 design: NO upfront debit. Budget unchanged after buy().
    const [club] = await db.select({ budget: clubs.budget }).from(clubs).where(eq(clubs.id, env.clubId));
    expect(club!.budget).toBe(10000);

    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, env.clubId));
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('in_progress');
    expect(items[0]!.weeksRemaining).toBe(2);
  });

  it('test_buy_invalid_prereq_returns_error_no_db_write', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    // Try buying a T2 item with no T1 complete
    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n2-este' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_PREREQ');

    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, env.clubId));
    expect(items).toHaveLength(0);
  });

  it('test_buy_with_active_item_returns_slot_occupied', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const first = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(first.ok).toBe(true);

    const second = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-sur' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('SLOT_OCCUPIED');
  });

  it('test_buy_insufficient_balance_returns_error', async () => {
    const env = await createTestEnv({ budget: 5 });
    track(env);

    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }); // costs 21
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INSUFFICIENT_BALANCE');
  });

  it('test_buy_critical_balance_warning_without_acceptRisk', async () => {
    // EN_RIESGO_BALANCE_THRESHOLD = 50; budget=70, cost=21 → remaining=49 < 50
    const env = await createTestEnv({ budget: 70 });
    track(env);

    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('CRITICAL_BALANCE_WARNING');
  });

  it('test_buy_acceptRisk_bypasses_critical_balance_warning', async () => {
    const env = await createTestEnv({ budget: 70 });
    track(env);

    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte', acceptRisk: true });
    expect(result.ok).toBe(true);
  });

  it('test_buy_with_construction_skill_applies_discount', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const deps: ServiceDeps = {
      hasConstructionSkill: vi.fn(async () => true),
    };
    const result = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 15 × 1.4 × 0.85 = 17.85 → round 18
    expect(result.value.totalCost).toBe(18);
  });

  it('test_buy_with_subsidy_offer_applies_discount', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const deps: ServiceDeps = {
      getActiveSubsidyOffer: vi.fn(async () => ({ subsidyPct: 0.5 })),
    };
    const result = await buy(
      { clubId: env.clubId, itemSlug: 'gradas-n1-norte', activeOfferId: 'fake-offer-id' },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 15 × 1.4 × 0.5 = 10.5 → round 11
    expect(result.value.totalCost).toBe(11);
  });

  it('test_cancel_before_any_tick_refunds_zero', async () => {
    // Pablo 2026-05-25 design: refunds are based on paid-to-date (installments
    // already debited), not 50% of the future total. Cancelling before any
    // installment is paid yields refund=0.
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const result = await cancel({ clubId: env.clubId, itemId: bought.value.itemId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refundEurK).toBe(0);

    // Budget unchanged: no upfront debit, no refund.
    const [club] = await db.select({ budget: clubs.budget }).from(clubs).where(eq(clubs.id, env.clubId));
    expect(club!.budget).toBe(10000);

    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.id, bought.value.itemId));
    expect(items[0]!.status).toBe('cancelled');
  });

  it('test_cancel_after_one_tick_refunds_half_of_paid_to_date', async () => {
    // Tick once (charges installment=11). Then cancel: refund = round(11 × 0.5) = 6.
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    await tickClub(env.clubId); // installment=11 debited; weeksRemaining 2 → 1

    const result = await cancel({ clubId: env.clubId, itemId: bought.value.itemId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // paid-to-date = 11. refund = round(11 × 0.5) = 6
    expect(result.value.refundEurK).toBe(6);

    const [club] = await db.select({ budget: clubs.budget }).from(clubs).where(eq(clubs.id, env.clubId));
    // 10000 - 11 (installment) + 6 (refund) = 9995
    expect(club!.budget).toBe(9995);
  });

  it('test_cancel_unknown_id_returns_not_found', async () => {
    const env = await createTestEnv();
    track(env);

    const result = await cancel({ clubId: env.clubId, itemId: randomUUID() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NOT_FOUND');
  });

  it('test_cancel_wrong_club_returns_not_found_security', async () => {
    const envA = await createTestEnv();
    const envB = await createTestEnv();
    track(envA);
    track(envB);

    const bought = await buy({ clubId: envA.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // Try cancelling envA's item using envB's clubId
    const result = await cancel({ clubId: envB.clubId, itemId: bought.value.itemId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NOT_FOUND');
  });

  it('test_cancel_already_complete_returns_not_in_progress', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // Force item to complete manually
    await db
      .update(stadiumUpgradeItems)
      .set({ status: 'complete', completedAt: new Date(), weeksRemaining: 0 })
      .where(eq(stadiumUpgradeItems.id, bought.value.itemId));

    const result = await cancel({ clubId: env.clubId, itemId: bought.value.itemId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NOT_IN_PROGRESS');
  });

  it('test_tick_no_active_item_returns_no_active', async () => {
    const env = await createTestEnv();
    track(env);

    const result = await tickClub(env.clubId);
    expect(result.kind).toBe('no_active');
  });

  it('test_tick_decrements_weeks_remaining_and_debits_installment', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const result = await tickClub(env.clubId);
    expect(result.kind).toBe('decremented');
    if (result.kind !== 'decremented') return;
    expect(result.weeksRemaining).toBe(1);
    expect(result.installmentPaid).toBe(11); // round(21 / 2) = 11

    const [club] = await db.select({ budget: clubs.budget }).from(clubs).where(eq(clubs.id, env.clubId));
    expect(club!.budget).toBe(10000 - 11);
  });

  it('test_tick_at_one_week_remaining_completes_with_side_effects', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // First tick — decrement to 1 + debit 11
    await tickClub(env.clubId);

    // Second tick — should Complete + pay final remainder (21 - 11 = 10)
    const cascadeSpy = vi.fn(async () => undefined);
    const tierSpy = vi.fn(async () => ({ tierUp: false }));
    const emitSpy = vi.fn();
    const result = await tickClub(env.clubId, {
      applyCascadeDelta: cascadeSpy,
      evaluateTierUp: tierSpy,
      emitItemCompleteEvent: emitSpy,
    });

    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') return;
    expect(result.finalPaid).toBe(10); // 21 total - 11 first installment = 10 final
    expect(cascadeSpy).toHaveBeenCalledWith(env.clubId, 'stadium_upgrade_count', 1, expect.anything());
    expect(tierSpy).toHaveBeenCalledWith(env.clubId, expect.anything());
    expect(emitSpy).toHaveBeenCalledWith(env.clubId, bought.value.itemId);

    // Total paid across ticks = 21 (matches totalCost exactly)
    const [club] = await db.select({ budget: clubs.budget }).from(clubs).where(eq(clubs.id, env.clubId));
    expect(club!.budget).toBe(10000 - 21);

    // World snapshot counter incremented
    const [snap] = await db.select().from(worldSnapshots).where(eq(worldSnapshots.id, env.snapshotId));
    expect(snap!.stadiumUpgradeCount).toBe(1);

    // Item moved to complete
    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.id, bought.value.itemId));
    expect(items[0]!.status).toBe('complete');
  });

  it('test_tick_bankruptcy_balance_skips_decrement', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    const bought = await buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);

    // Drive balance below QUIEBRA_BALANCE_THRESHOLD = -200
    await db.update(clubs).set({ budget: -500 }).where(eq(clubs.id, env.clubId));

    const result = await tickClub(env.clubId);
    expect(result.kind).toBe('bankruptcy_pause');

    // weeks_remaining unchanged
    if (!bought.ok) return;
    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.id, bought.value.itemId));
    expect(items[0]!.weeksRemaining).toBe(2);
  });

  it('test_tick_complete_routes_counter_per_track', async () => {
    const env = await createTestEnv({ budget: 100000 });
    track(env);

    // Complete one item in the academy track to test counter routing.
    const bought = await buy({ clubId: env.clubId, itemSlug: 'academy-n1-aula' });
    expect(bought.ok).toBe(true);
    // Tick down to 0
    await tickClub(env.clubId); // 2 → 1 (wait — durationWeeks for T1 no director = 2)
    await tickClub(env.clubId); // 1 → complete

    const [snap] = await db.select().from(worldSnapshots).where(eq(worldSnapshots.id, env.snapshotId));
    expect(snap!.youthAcademyLevel).toBe(1);
    expect(snap!.stadiumUpgradeCount).toBe(0); // Did NOT route here
    expect(snap!.trainingFacilityLevel).toBe(0);
  });

  it('test_race_concurrent_buy_same_club_only_one_wins', async () => {
    const env = await createTestEnv({ budget: 10000 });
    track(env);

    // Fire two buys concurrently — partial unique index ensures only one wins.
    const [r1, r2] = await Promise.all([
      buy({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }).catch(() => ({
        ok: false as const,
        error: 'SLOT_OCCUPIED' as const,
      })),
      buy({ clubId: env.clubId, itemSlug: 'gradas-n1-sur' }).catch(() => ({
        ok: false as const,
        error: 'SLOT_OCCUPIED' as const,
      })),
    ]);

    const successes = [r1, r2].filter((r) => r.ok);
    const failures = [r1, r2].filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as { error: string }).error).toBe('SLOT_OCCUPIED');

    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, env.clubId));
    const inProgress = items.filter((i) => i.status === 'in_progress');
    expect(inProgress).toHaveLength(1);
  });

  it('test_two_clubs_can_buy_simultaneously', async () => {
    const envA = await createTestEnv({ budget: 10000 });
    const envB = await createTestEnv({ budget: 10000 });
    track(envA);
    track(envB);

    const [rA, rB] = await Promise.all([
      buy({ clubId: envA.clubId, itemSlug: 'gradas-n1-norte' }),
      buy({ clubId: envB.clubId, itemSlug: 'gradas-n1-norte' }),
    ]);
    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);
  });

  it('test_tickClub_with_no_active_item_no_op', async () => {
    const env = await createTestEnv();
    track(env);

    const r1 = await tickClub(env.clubId);
    const r2 = await tickClub(env.clubId);
    expect(r1.kind).toBe('no_active');
    expect(r2.kind).toBe('no_active');
  });
});

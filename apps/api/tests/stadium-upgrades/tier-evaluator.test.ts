/**
 * Tests for the tier-up doble-gate evaluator + multi-club tick.
 * Story STADIUM-UPGRADES-007.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, users, clubs, playthroughs, worldSnapshots, stadiumUpgradeItems, eq } from '@smt/db';
import { loadCatalog, _resetCatalogCacheForTests } from '../../src/modules/stadium-upgrades/catalog.js';
import {
  evaluateTierUp,
  tickAllClubsWithActiveUpgrades,
} from '../../src/modules/stadium-upgrades/tier-evaluator.js';
import { buy, tickClub } from '../../src/modules/stadium-upgrades/service.js';

const REAL_CATALOG = path.resolve(process.cwd(), '../../design/data/stadium-upgrades-catalog.json');

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

async function setupClub(opts: { budget?: number; cityTier?: number } = {}): Promise<{
  userId: string; clubId: string; playthroughId: string;
}> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `te-${userId}@test.com`,
    username: `te-${userId.slice(0, 8)}`,
    passwordHash: 'fake',
  });
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    managerId: userId,
    name: `TE ${clubId.slice(0, 4)}`,
    city: 'Test',
    budget: opts.budget ?? 100000,
    cityTier: opts.cityTier ?? 1,
  });
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({ id: playthroughId, userId, clubId, name: 'te' });
  await db.insert(worldSnapshots).values({ playthroughId, week: 1, worldState: {} });
  return { userId, clubId, playthroughId };
}

describeDB('tier-up doble-gate evaluator', () => {
  const cleanup: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    _resetCatalogCacheForTests();
    await loadCatalog(REAL_CATALOG);
  });

  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
    cleanup.length = 0;
  });

  function track(ids: { userId: string; clubId: string; playthroughId: string }): void {
    cleanup.push(async () => {
      await db.delete(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, ids.clubId));
      await db.delete(playthroughs).where(eq(playthroughs.id, ids.playthroughId));
      await db.delete(clubs).where(eq(clubs.id, ids.clubId));
      await db.delete(users).where(eq(users.id, ids.userId));
    });
  }

  it('test_evaluate_at_max_returns_AT_MAX', async () => {
    const ids = await setupClub({ cityTier: 4 });
    track(ids);
    const verdict = await evaluateTierUp(ids.clubId);
    expect(verdict.tierUp).toBe(false);
    if (verdict.tierUp) return;
    expect(verdict.reason).toBe('AT_MAX');
  });

  it('test_evaluate_reformas_not_met_with_metrics_ok', async () => {
    const ids = await setupClub({ cityTier: 1 });
    track(ids);
    // Club has zero T2 items complete → reformas gate fails.
    const verdict = await evaluateTierUp(ids.clubId, db, {
      metricsGateForTier: async () => true,
    });
    expect(verdict.tierUp).toBe(false);
    if (verdict.tierUp) return;
    expect(verdict.reason).toBe('REFORMAS_NOT_MET');
    expect(verdict.required).toBe(7); // ceil(10 × 0.70) = 7 (T2 has 10 items: 2 per track × 5 tracks)
  });

  it('test_evaluate_metrics_not_met_with_reformas_ok', async () => {
    const ids = await setupClub({ cityTier: 1, budget: 1_000_000 });
    track(ids);
    // Complete enough T2 items to satisfy reformas gate (7 of 10 = 70%).
    // 5 tracks × 2 items per tier = 10 items per tier total. Need ceil(10 × 0.7) = 7.
    // First complete prereq (1 T1 item per track) then 7 T2 items.
    const t1Slugs = ['gradas-n1-norte', 'pitch-n1-drenaje', 'servicios-n1-vestuarios', 'training-n1-cancha', 'academy-n1-aula'];
    const t2Slugs = ['gradas-n2-este', 'gradas-n2-oeste', 'pitch-n2-cesped-uniforme', 'pitch-n2-riego', 'servicios-n2-sala-tecnica', 'servicios-n2-prensa-basica', 'training-n2-cancha-doble'];
    for (const slug of t1Slugs) {
      await db.insert(stadiumUpgradeItems).values({
        clubId: ids.clubId, itemSlug: slug, track: slug.split('-')[0]!, tier: 1, status: 'complete',
        costPaidEurK: 10, durationWeeks: 2, completedAt: new Date(),
      });
    }
    for (const slug of t2Slugs) {
      await db.insert(stadiumUpgradeItems).values({
        clubId: ids.clubId, itemSlug: slug, track: slug.split('-')[0]!, tier: 2, status: 'complete',
        costPaidEurK: 50, durationWeeks: 4, completedAt: new Date(),
      });
    }

    const verdict = await evaluateTierUp(ids.clubId, db, {
      metricsGateForTier: async () => false, // metrics fail
    });
    expect(verdict.tierUp).toBe(false);
    if (verdict.tierUp) return;
    expect(verdict.reason).toBe('METRICS_NOT_MET');
  });

  it('test_evaluate_both_gates_pass_promotes_tier', async () => {
    const ids = await setupClub({ cityTier: 1, budget: 1_000_000 });
    track(ids);
    // Complete 7 T2 items to satisfy reformas gate
    const t2Slugs = ['gradas-n2-este', 'gradas-n2-oeste', 'pitch-n2-cesped-uniforme', 'pitch-n2-riego', 'servicios-n2-sala-tecnica', 'servicios-n2-prensa-basica', 'training-n2-cancha-doble'];
    for (const slug of t2Slugs) {
      await db.insert(stadiumUpgradeItems).values({
        clubId: ids.clubId, itemSlug: slug, track: slug.split('-')[0]!, tier: 2, status: 'complete',
        costPaidEurK: 50, durationWeeks: 4, completedAt: new Date(),
      });
    }

    const verdict = await evaluateTierUp(ids.clubId, db, {
      metricsGateForTier: async () => true,
    });
    expect(verdict.tierUp).toBe(true);
    if (!verdict.tierUp) return;
    expect(verdict.newTier).toBe(2);

    // Persisted in DB
    const [club] = await db.select({ cityTier: clubs.cityTier }).from(clubs).where(eq(clubs.id, ids.clubId));
    expect(club!.cityTier).toBe(2);
  });

  it('test_evaluate_default_metrics_gate_is_permissive', async () => {
    // When metricsGateForTier is omitted, defaults to true (allows reformas-only flow).
    const ids = await setupClub({ cityTier: 1, budget: 1_000_000 });
    track(ids);
    const t2Slugs = ['gradas-n2-este', 'gradas-n2-oeste', 'pitch-n2-cesped-uniforme', 'pitch-n2-riego', 'servicios-n2-sala-tecnica', 'servicios-n2-prensa-basica', 'training-n2-cancha-doble'];
    for (const slug of t2Slugs) {
      await db.insert(stadiumUpgradeItems).values({
        clubId: ids.clubId, itemSlug: slug, track: slug.split('-')[0]!, tier: 2, status: 'complete',
        costPaidEurK: 50, durationWeeks: 4, completedAt: new Date(),
      });
    }
    const verdict = await evaluateTierUp(ids.clubId);
    expect(verdict.tierUp).toBe(true);
  });

  it('test_tick_all_clubs_decrements_active_items_for_known_clubs', async () => {
    // Note: tickAllClubsWithActiveUpgrades() touches every club with an
    // in_progress item across the whole DB. Vitest may run other test files
    // in parallel against the same Postgres, so we don't assert an absolute
    // count — we assert that OUR 2 known clubs got ticked correctly.
    const a = await setupClub({ budget: 10000 });
    const b = await setupClub({ budget: 10000 });
    const c = await setupClub();
    track(a);
    track(b);
    track(c);

    // a + b buy items; c has none
    await buy({ clubId: a.clubId, itemSlug: 'gradas-n1-norte' });
    await buy({ clubId: b.clubId, itemSlug: 'gradas-n1-norte' });

    const result = await tickAllClubsWithActiveUpgrades();
    expect(result.ticked).toBeGreaterThanOrEqual(2);

    // T1 starting weeksRemaining=6 → after 1 tick = 5.
    const items = await db.select().from(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.status, 'in_progress'));
    const aItems = items.filter((i) => i.clubId === a.clubId);
    const bItems = items.filter((i) => i.clubId === b.clubId);
    const cItems = items.filter((i) => i.clubId === c.clubId);
    expect(aItems[0]!.weeksRemaining).toBe(5);
    expect(bItems[0]!.weeksRemaining).toBe(5);
    expect(cItems).toHaveLength(0); // c never bought anything
  });

  it('test_tick_determinism_same_state_same_outcome', async () => {
    // Setup club with active item at weeks_remaining=5; tick once.
    // Reset weeks_remaining to 5 and tick again. Must reach the same final state.
    const ids = await setupClub({ budget: 100_000 });
    track(ids);

    const bought = await buy({ clubId: ids.clubId, itemSlug: 'gradas-n1-norte' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // Pin weeks_remaining to 5 via SQL
    await db.update(stadiumUpgradeItems)
      .set({ weeksRemaining: 5 })
      .where(eq(stadiumUpgradeItems.id, bought.value.itemId));

    const r1 = await tickClub(ids.clubId);

    // Reset to 5 and tick again
    await db.update(stadiumUpgradeItems)
      .set({ weeksRemaining: 5 })
      .where(eq(stadiumUpgradeItems.id, bought.value.itemId));

    const r2 = await tickClub(ids.clubId);

    expect(r1.kind).toBe('decremented');
    expect(r2.kind).toBe('decremented');
    if (r1.kind === 'decremented' && r2.kind === 'decremented') {
      expect(r1.weeksRemaining).toBe(r2.weeksRemaining);
    }
  });

  it('test_evaluate_calls_promote_fn_when_both_gates_pass', async () => {
    const ids = await setupClub({ cityTier: 1, budget: 1_000_000 });
    track(ids);
    const t2Slugs = ['gradas-n2-este', 'gradas-n2-oeste', 'pitch-n2-cesped-uniforme', 'pitch-n2-riego', 'servicios-n2-sala-tecnica', 'servicios-n2-prensa-basica', 'training-n2-cancha-doble'];
    for (const slug of t2Slugs) {
      await db.insert(stadiumUpgradeItems).values({
        clubId: ids.clubId, itemSlug: slug, track: slug.split('-')[0]!, tier: 2, status: 'complete',
        costPaidEurK: 50, durationWeeks: 4, completedAt: new Date(),
      });
    }
    const promoteSpy = vi.fn(async () => undefined);
    await evaluateTierUp(ids.clubId, db, { promoteTier: promoteSpy });
    expect(promoteSpy).toHaveBeenCalledWith(ids.clubId, 2, expect.anything());
  });
});

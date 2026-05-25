/**
 * Integration tests for stadium-upgrades Hono routes. Story STADIUM-UPGRADES-006.
 *
 * Covers the 15 QA Test Cases: HTTP status mapping per service error,
 * Zod validation, session auth, security (don't leak cross-club existence).
 *
 * Auto-skips when Postgres on 5433 is unreachable.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { db, users, clubs, playthroughs, worldSnapshots, stadiumUpgradeItems, eq } from '@smt/db';
import { generateSessionToken, createSession } from '@smt/db/auth';
import { createStadiumUpgradesRoutes } from '../../src/modules/stadium-upgrades/routes.js';
import { loadCatalog, _resetCatalogCacheForTests } from '../../src/modules/stadium-upgrades/catalog.js';

const REAL_CATALOG = path.resolve(process.cwd(), '../../design/data/stadium-upgrades-catalog.json');

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

type TestEnv = { userId: string; clubId: string; playthroughId: string; sessionToken: string };

async function createTestEnv(opts: { budget?: number } = {}): Promise<TestEnv> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `routes-${userId}@test.com`,
    username: `routes-${userId.slice(0, 8)}`,
    passwordHash: 'fake-hash',
  });
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    managerId: userId,
    name: `RT ${clubId.slice(0, 4)}`,
    city: 'Test',
    budget: opts.budget ?? 10000,
  });
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({ id: playthroughId, userId, clubId, name: 'rt' });
  await db.insert(worldSnapshots).values({ playthroughId, week: 1, worldState: {} });
  const sessionToken = generateSessionToken();
  await createSession(sessionToken, userId);
  return { userId, clubId, playthroughId, sessionToken };
}

function authHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `session=${token}`,
  };
}

describeDB('stadium-upgrades routes (integration)', () => {
  const app = createStadiumUpgradesRoutes();
  const created: TestEnv[] = [];

  beforeAll(async () => {
    _resetCatalogCacheForTests();
    await loadCatalog(REAL_CATALOG);
  });

  afterEach(async () => {
    for (const env of created) {
      await db.delete(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, env.clubId)).catch(() => undefined);
      await db.delete(playthroughs).where(eq(playthroughs.id, env.playthroughId)).catch(() => undefined);
      await db.delete(clubs).where(eq(clubs.id, env.clubId)).catch(() => undefined);
      await db.delete(users).where(eq(users.id, env.userId)).catch(() => undefined);
    }
    created.length = 0;
  });

  async function setupEnv(opts: { budget?: number } = {}): Promise<TestEnv> {
    const env = await createTestEnv(opts);
    created.push(env);
    return env;
  }

  it('test_catalog_returns_401_without_session', async () => {
    const env = await setupEnv();
    const res = await app.fetch(new Request(`http://x/catalog?clubId=${env.clubId}`));
    expect(res.status).toBe(401);
  });

  it('test_catalog_returns_200_with_40_items_for_authenticated_user', async () => {
    const env = await setupEnv();
    const res = await app.fetch(
      new Request(`http://x/catalog?clubId=${env.clubId}`, { headers: authHeaders(env.sessionToken) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(40);
  });

  it('test_catalog_returns_404_for_other_users_club_security', async () => {
    const envA = await setupEnv();
    const envB = await setupEnv();
    const res = await app.fetch(
      new Request(`http://x/catalog?clubId=${envA.clubId}`, { headers: authHeaders(envB.sessionToken) }),
    );
    expect(res.status).toBe(404);
  });

  it('test_buy_happy_path_returns_200', async () => {
    const env = await setupEnv({ budget: 10000 });
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { itemId: string; costPaid: number };
    expect(body.itemId).toBeTruthy();
    expect(body.costPaid).toBe(21);
  });

  it('test_buy_zod_fail_returns_400', async () => {
    const env = await setupEnv();
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('test_buy_invalid_slug_regex_returns_400', async () => {
    const env = await setupEnv();
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'Bad Slug!' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('test_buy_invalid_prereq_returns_400', async () => {
    const env = await setupEnv({ budget: 10000 });
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n2-este' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_PREREQ');
  });

  it('test_buy_slot_occupied_returns_409', async () => {
    const env = await setupEnv({ budget: 10000 });
    // First buy
    await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    // Second buy
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-sur' }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('SLOT_OCCUPIED');
  });

  it('test_buy_insufficient_balance_returns_402', async () => {
    const env = await setupEnv({ budget: 5 });
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    expect(res.status).toBe(402);
  });

  it('test_buy_critical_balance_warning_returns_409', async () => {
    const env = await setupEnv({ budget: 70 });
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('CRITICAL_BALANCE_WARNING');
  });

  it('test_buy_acceptRisk_after_warning_returns_200', async () => {
    const env = await setupEnv({ budget: 70 });
    const res = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte', acceptRisk: true }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('test_cancel_happy_path_returns_200_with_refund', async () => {
    const env = await setupEnv({ budget: 10000 });
    const buyRes = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    const buyBody = await buyRes.json() as { itemId: string };

    const res = await app.fetch(
      new Request('http://x/cancel', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemId: buyBody.itemId }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { refundEurK: number };
    expect(body.refundEurK).toBe(11);
  });

  it('test_cancel_unknown_id_returns_404', async () => {
    const env = await setupEnv();
    const res = await app.fetch(
      new Request('http://x/cancel', {
        method: 'POST',
        headers: authHeaders(env.sessionToken),
        body: JSON.stringify({ clubId: env.clubId, itemId: randomUUID() }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('test_cancel_other_users_item_returns_404_security', async () => {
    const envA = await setupEnv({ budget: 10000 });
    const envB = await setupEnv();
    const buyRes = await app.fetch(
      new Request('http://x/buy', {
        method: 'POST',
        headers: authHeaders(envA.sessionToken),
        body: JSON.stringify({ clubId: envA.clubId, itemSlug: 'gradas-n1-norte' }),
      }),
    );
    const buyBody = await buyRes.json() as { itemId: string };

    // envB tries to cancel envA's item using envB's clubId
    const res = await app.fetch(
      new Request('http://x/cancel', {
        method: 'POST',
        headers: authHeaders(envB.sessionToken),
        body: JSON.stringify({ clubId: envB.clubId, itemId: buyBody.itemId }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('test_history_returns_chronological_complete_items', async () => {
    const env = await setupEnv({ budget: 10000 });
    // Manually insert a complete item
    await db.insert(stadiumUpgradeItems).values({
      clubId: env.clubId,
      itemSlug: 'gradas-n1-norte',
      track: 'gradas',
      tier: 1,
      status: 'complete',
      costPaidEurK: 21,
      durationWeeks: 2,
      completedAt: new Date('2026-01-01'),
    });
    await db.insert(stadiumUpgradeItems).values({
      clubId: env.clubId,
      itemSlug: 'pitch-n1-drenaje',
      track: 'pitch',
      tier: 1,
      status: 'complete',
      costPaidEurK: 12,
      durationWeeks: 2,
      completedAt: new Date('2026-02-01'),
    });

    const res = await app.fetch(
      new Request(`http://x/history?clubId=${env.clubId}`, { headers: authHeaders(env.sessionToken) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { history: Array<{ itemSlug: string }> };
    expect(body.history).toHaveLength(2);
    expect(body.history[0]!.itemSlug).toBe('gradas-n1-norte');
    expect(body.history[1]!.itemSlug).toBe('pitch-n1-drenaje');
  });

  it('test_all_responses_set_application_json', async () => {
    const env = await setupEnv();
    const res = await app.fetch(
      new Request(`http://x/catalog?clubId=${env.clubId}`, { headers: authHeaders(env.sessionToken) }),
    );
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

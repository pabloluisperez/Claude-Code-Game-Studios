/**
 * Museum aggregator route tests. Story TROPHIES-HISTORY-001.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  db,
  users,
  clubs,
  playthroughs,
  worldSnapshots,
  stadiumUpgradeItems,
  fixtures,
  eq,
} from '@smt/db';
import { generateSessionToken, createSession } from '@smt/db/auth';
import { createMuseumRoutes } from '../../src/modules/museum/routes.js';
import { _clearMuseumCacheForTests } from '../../src/modules/museum/service.js';

const dbReachable = await db
  .select({ ok: users.id })
  .from(users)
  .limit(1)
  .then(() => true)
  .catch(() => false);

const describeDB = dbReachable ? describe : describe.skip;

type Env = { userId: string; clubId: string; playthroughId: string; sessionToken: string };

async function setupEnv(): Promise<Env> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `mus-${userId}@test.com`,
    username: `mus-${userId.slice(0, 8)}`,
    passwordHash: 'fake',
  });
  const clubId = randomUUID();
  await db.insert(clubs).values({ id: clubId, managerId: userId, name: `M ${clubId.slice(0, 4)}`, city: 'T', budget: 10000 });
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({ id: playthroughId, userId, clubId, name: 'm' });
  await db.insert(worldSnapshots).values({ playthroughId, week: 1, worldState: {} });
  const sessionToken = generateSessionToken();
  await createSession(sessionToken, userId);
  return { userId, clubId, playthroughId, sessionToken };
}

function auth(token: string): Record<string, string> {
  return { 'content-type': 'application/json', cookie: `session=${token}` };
}

describeDB('museum routes (integration)', () => {
  const app = createMuseumRoutes();
  const created: Env[] = [];

  beforeAll(() => {
    _clearMuseumCacheForTests();
  });

  afterEach(async () => {
    for (const env of created) {
      await db.delete(stadiumUpgradeItems).where(eq(stadiumUpgradeItems.clubId, env.clubId)).catch(() => undefined);
      await db.delete(playthroughs).where(eq(playthroughs.id, env.playthroughId)).catch(() => undefined);
      await db.delete(clubs).where(eq(clubs.id, env.clubId)).catch(() => undefined);
      await db.delete(users).where(eq(users.id, env.userId)).catch(() => undefined);
    }
    created.length = 0;
    _clearMuseumCacheForTests();
  });

  it('test_contents_returns_401_without_session', async () => {
    const env = await setupEnv();
    created.push(env);
    const res = await app.fetch(new Request(`http://x/contents?clubId=${env.clubId}`));
    expect(res.status).toBe(401);
  });

  it('test_contents_returns_5_categories_and_totals_for_empty_club', async () => {
    const env = await setupEnv();
    created.push(env);
    const res = await app.fetch(
      new Request(`http://x/contents?clubId=${env.clubId}`, { headers: auth(env.sessionToken) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      trophies: unknown[]; banners: unknown[]; legendTransfers: unknown[];
      financialMilestones: unknown[]; stadiumHistory: unknown[];
      totalObjects: number; museumDensity: number;
    };
    expect(body.trophies).toEqual([]);
    expect(body.banners).toEqual([]);
    expect(body.legendTransfers).toEqual([]);
    expect(body.stadiumHistory).toEqual([]);
    expect(body.totalObjects).toBe(0);
    expect(body.museumDensity).toBe(0);
  });

  it('test_contents_returns_404_for_other_users_club', async () => {
    const envA = await setupEnv();
    const envB = await setupEnv();
    created.push(envA);
    created.push(envB);

    const res = await app.fetch(
      new Request(`http://x/contents?clubId=${envA.clubId}`, { headers: auth(envB.sessionToken) }),
    );
    expect(res.status).toBe(404);
  });

  it('test_contents_includes_stadium_history_from_completed_items', async () => {
    const env = await setupEnv();
    created.push(env);

    // Seed 2 complete stadium items
    await db.insert(stadiumUpgradeItems).values([
      {
        clubId: env.clubId,
        itemSlug: 'gradas-n1-norte',
        track: 'gradas',
        tier: 1,
        status: 'complete',
        costPaidEurK: 21,
        durationWeeks: 2,
        completedAt: new Date('2026-01-01'),
      },
      {
        clubId: env.clubId,
        itemSlug: 'pitch-n1-drenaje',
        track: 'pitch',
        tier: 1,
        status: 'complete',
        costPaidEurK: 12,
        durationWeeks: 2,
        completedAt: new Date('2026-02-01'),
      },
    ]);

    const res = await app.fetch(
      new Request(`http://x/contents?clubId=${env.clubId}`, { headers: auth(env.sessionToken) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { stadiumHistory: Array<{ itemSlug: string }>; totalObjects: number };
    expect(body.stadiumHistory).toHaveLength(2);
    expect(body.stadiumHistory[0]!.itemSlug).toBe('gradas-n1-norte'); // chronological
    expect(body.stadiumHistory[1]!.itemSlug).toBe('pitch-n1-drenaje');
    expect(body.totalObjects).toBeGreaterThanOrEqual(2);
  });

  it('test_contents_cache_hit_on_second_call', async () => {
    const env = await setupEnv();
    created.push(env);

    const first = await app.fetch(
      new Request(`http://x/contents?clubId=${env.clubId}`, { headers: auth(env.sessionToken) }),
    );
    expect(first.headers.get('X-Museum-Cache')).toBe('miss');

    const second = await app.fetch(
      new Request(`http://x/contents?clubId=${env.clubId}`, { headers: auth(env.sessionToken) }),
    );
    expect(second.headers.get('X-Museum-Cache')).toBe('hit');
  });

  it('test_contents_returns_application_json', async () => {
    const env = await setupEnv();
    created.push(env);
    const res = await app.fetch(
      new Request(`http://x/contents?clubId=${env.clubId}`, { headers: auth(env.sessionToken) }),
    );
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

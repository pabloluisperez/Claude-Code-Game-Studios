/**
 * Integration tests for GDPR self-service endpoints (/me/*).
 *
 * Story v1.0.x sprint 16 adelantado.
 *
 * Requires Postgres on port 5433 + migrations applied (incl. 0025_gdpr_deletion_request).
 *
 * Covers:
 *   - getDeletionStatus state machine (none → pending → ready)
 *   - DELETION_COOLDOWN_MS constant
 *   - exportUserData returns a bundle for a user that exists
 *   - cancelUserDeletion clears the pending state
 *   - executeUserDeletion respects cooldown unless force=true
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, users, clubs, playthroughs, eq } from '@smt/db';
import {
  DELETION_COOLDOWN_MS,
  exportUserData,
  getDeletionStatus,
  requestUserDeletion,
  cancelUserDeletion,
  executeUserDeletion,
} from '../../src/modules/me/repo';

// Pool reuse: skip these tests if no DB is reachable.
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
    email: `gdpr-${id}@test.com`,
    username: `gdpr-${id.slice(0, 8)}`,
    passwordHash: 'fake-hash',
  });
  return id;
}

describeDB('GDPR repo (integration)', () => {
  const created: string[] = [];

  afterEach(async () => {
    if (created.length) {
      for (const id of created) {
        await db.delete(users).where(eq(users.id, id)).catch(() => undefined);
      }
      created.length = 0;
    }
  });

  it('DELETION_COOLDOWN_MS is exactly 24h', () => {
    expect(DELETION_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('getDeletionStatus returns "none" for a user with no pending request', async () => {
    const userId = await createTestUser();
    created.push(userId);
    const status = await getDeletionStatus(userId);
    expect(status).toEqual({ state: 'none' });
  });

  it('requestUserDeletion sets pending state with cooldown 24h ahead', async () => {
    const userId = await createTestUser();
    created.push(userId);
    const { cooldownEndsAt } = await requestUserDeletion(userId);
    const endsMs = new Date(cooldownEndsAt).getTime();
    expect(endsMs).toBeGreaterThan(Date.now() + DELETION_COOLDOWN_MS - 5_000);
    expect(endsMs).toBeLessThan(Date.now() + DELETION_COOLDOWN_MS + 5_000);

    const status = await getDeletionStatus(userId);
    expect(status.state).toBe('pending');
  });

  it('cancelUserDeletion clears the pending state and returns true', async () => {
    const userId = await createTestUser();
    created.push(userId);
    await requestUserDeletion(userId);
    const ok = await cancelUserDeletion(userId);
    expect(ok).toBe(true);
    const status = await getDeletionStatus(userId);
    expect(status.state).toBe('none');
  });

  it('cancelUserDeletion returns false when no request was pending', async () => {
    const userId = await createTestUser();
    created.push(userId);
    const ok = await cancelUserDeletion(userId);
    expect(ok).toBe(false);
  });

  it('executeUserDeletion refuses without a request', async () => {
    const userId = await createTestUser();
    created.push(userId);
    const result = await executeUserDeletion(userId);
    expect(result.status).toBe('no_request');
  });

  it('executeUserDeletion refuses while cooldown is active', async () => {
    const userId = await createTestUser();
    created.push(userId);
    await requestUserDeletion(userId);
    const result = await executeUserDeletion(userId);
    expect(result.status).toBe('cooldown_active');
  });

  it('executeUserDeletion with force=true deletes immediately', async () => {
    const userId = await createTestUser();
    const result = await executeUserDeletion(userId, { force: true });
    expect(result.status).toBe('deleted');
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row).toBeUndefined();
    // Don't push to `created` cleanup — already deleted.
  });

  it('executeUserDeletion cascades to playthroughs', async () => {
    const userId = await createTestUser();
    const clubId = randomUUID();
    await db.insert(clubs).values({
      id: clubId,
      name: 'GDPR Test FC',
      city: 'Gdprville',
    });
    const ptId = randomUUID();
    await db.insert(playthroughs).values({
      id: ptId,
      userId,
      clubId,
      currentWeek: 1,
    });

    await executeUserDeletion(userId, { force: true });

    const [pt] = await db.select().from(playthroughs).where(eq(playthroughs.id, ptId));
    expect(pt).toBeUndefined();
    // Cleanup the orphan club we made
    await db.delete(clubs).where(eq(clubs.id, clubId));
  });

  it('exportUserData returns bundle for an existing user', async () => {
    const userId = await createTestUser();
    created.push(userId);
    const bundle = await exportUserData(userId);
    expect(bundle.user.id).toBe(userId);
    expect(bundle.user.email).toMatch(/gdpr-/);
    expect(Array.isArray(bundle.playthroughs)).toBe(true);
    expect(Array.isArray(bundle.worldSnapshots)).toBe(true);
    expect(Array.isArray(bundle.calendarEvents)).toBe(true);
    expect(typeof bundle.exportedAt).toBe('string');
  });

  it('exportUserData throws for a non-existent user', async () => {
    const fakeId = randomUUID();
    await expect(exportUserData(fakeId)).rejects.toThrow(/not found/);
  });
});

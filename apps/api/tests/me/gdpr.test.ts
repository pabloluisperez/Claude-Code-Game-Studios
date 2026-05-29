/**
 * Integration tests for GDPR self-service endpoints (/me/*).
 *
 * Story v1.0.x sprint 16 adelantado.
 * Story 25-8: extended exportUserData coverage.
 *
 * Requires Postgres on port 5433 + migrations applied (incl. 0025_gdpr_deletion_request).
 *
 * Covers:
 *   - getDeletionStatus state machine (none → pending → ready)
 *   - DELETION_COOLDOWN_MS constant
 *   - exportUserData returns bundle (basic user-only case)
 *   - exportUserData bundles clubs/players/staff/stadiumUpgradeItems/tvContracts/
 *     sponsors/standings/fixtures/milestones/managerProfiles/skillXpEvents
 *   - cancelUserDeletion clears the pending state
 *   - executeUserDeletion respects cooldown unless force=true
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  db,
  users,
  clubs,
  playthroughs,
  players,
  staff,
  stadiumUpgradeItems,
  tvContracts,
  sponsors,
  careerMilestones,
  managerProfiles,
  skillXpEvents,
  eq,
} from '@smt/db';
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

  it('exportUserData returns bundle for an existing user (no clubs)', async () => {
    // Arrange
    const userId = await createTestUser();
    created.push(userId);

    // Act
    const bundle = await exportUserData(userId);

    // Assert — core shape
    expect(bundle.user.id).toBe(userId);
    expect(bundle.user.email).toMatch(/gdpr-/);
    expect(Array.isArray(bundle.playthroughs)).toBe(true);
    expect(Array.isArray(bundle.worldSnapshots)).toBe(true);
    expect(Array.isArray(bundle.calendarEvents)).toBe(true);
    expect(typeof bundle.exportedAt).toBe('string');
    // New collections must be present even when empty
    expect(Array.isArray(bundle.clubs)).toBe(true);
    expect(Array.isArray(bundle.players)).toBe(true);
    expect(Array.isArray(bundle.staff)).toBe(true);
    expect(Array.isArray(bundle.stadiumUpgradeItems)).toBe(true);
    expect(Array.isArray(bundle.tvContracts)).toBe(true);
    expect(Array.isArray(bundle.sponsors)).toBe(true);
    expect(Array.isArray(bundle.fixtures)).toBe(true);
    expect(Array.isArray(bundle.standings)).toBe(true);
    expect(Array.isArray(bundle.milestones)).toBe(true);
    expect(Array.isArray(bundle.managerProfiles)).toBe(true);
    expect(Array.isArray(bundle.skillXpEvents)).toBe(true);
  });

  it('exportUserData throws for a non-existent user', async () => {
    const fakeId = randomUUID();
    await expect(exportUserData(fakeId)).rejects.toThrow(/not found/);
  });

  it('exportUserData bundles clubs, players, and staff for a user with a club+playthrough', async () => {
    // Arrange — user owns a club via managerId and has a playthrough linking them
    const userId = await createTestUser();
    created.push(userId);

    const clubId = randomUUID();
    await db.insert(clubs).values({
      id: clubId,
      managerId: userId,
      name: 'Export FC',
      city: 'Exportville',
    });

    const ptId = randomUUID();
    await db.insert(playthroughs).values({
      id: ptId,
      userId,
      clubId,
      currentWeek: 3,
    });

    // Seed a player
    const playerId = randomUUID();
    await db.insert(players).values({
      id: playerId,
      clubId,
      playthroughId: ptId,
      firstName: 'Carlos',
      lastName: 'Export',
      birthWeek: 100,
      position: 'MID',
      skill: 60,
      salaryEurK: 5,
      contractStartWeek: 1,
      contractEndWeek: 50,
    });

    // Seed a staff member
    const staffId = randomUUID();
    await db.insert(staff).values({
      id: staffId,
      playthroughId: ptId,
      clubId,
      role: 'fitness_coach',
      qualityTier: 1,
      weeklyEurK: 2,
      name: 'Pepe Staff',
      hiredWeek: 1,
    });

    // Seed a stadium upgrade
    const upgradeId = randomUUID();
    await db.insert(stadiumUpgradeItems).values({
      id: upgradeId,
      clubId,
      itemSlug: 'gradas-n2-norte',
      track: 'gradas',
      tier: 2,
      status: 'complete',
      costPaidEurK: 50,
      durationWeeks: 4,
    });

    // Seed a TV contract
    const tvId = randomUUID();
    await db.insert(tvContracts).values({
      id: tvId,
      playthroughId: ptId,
      season: 1,
      tier: 'LOCAL',
      durationSeasons: 1,
      seasonInContract: 1,
      weeklyRateEurK: '2.50',
      divisionAtSigning: 'fifth',
      status: 'ACTIVE',
    });

    // Seed a sponsor
    const sponsorId = randomUUID();
    await db.insert(sponsors).values({
      id: sponsorId,
      playthroughId: ptId,
      clubId,
      name: 'MarcaTest S.A.',
      slot: 'kit',
      tier: 1,
      weeklyEurK: 5,
      qualityContribution: 10,
      status: 'active',
      startedWeek: 1,
      endsWeek: 38,
    });

    // Seed a career milestone
    const milestoneId = randomUUID();
    await db.insert(careerMilestones).values({
      id: milestoneId,
      playthroughId: ptId,
      kind: 'first_win',
      label: 'Primera victoria',
      description: 'Ganaste tu primer partido',
      icon: 'trophy',
      week: 3,
    });

    // Seed a manager profile
    const profileId = randomUUID();
    await db.insert(managerProfiles).values({
      id: profileId,
      playthroughId: ptId,
      name: 'El Míster',
      skills: { tactics: 10, motivation: 10, scouting: 10, fitness: 10, finance: 10 },
      fanLoyalty: 5,
    });

    // Seed a skill XP event
    const xpId = randomUUID();
    await db.insert(skillXpEvents).values({
      id: xpId,
      playthroughId: ptId,
      week: 3,
      season: 1,
      skillId: 'tactics',
      xpGranted: 25,
      reason: 'win',
    });

    // Act
    const bundle = await exportUserData(userId);

    // Assert — clubs
    expect(bundle.clubs).toHaveLength(1);
    expect((bundle.clubs[0] as { id: string }).id).toBe(clubId);

    // Assert — players
    expect(bundle.players).toHaveLength(1);
    expect((bundle.players[0] as { id: string }).id).toBe(playerId);

    // Assert — staff
    expect(bundle.staff).toHaveLength(1);
    expect((bundle.staff[0] as { id: string }).id).toBe(staffId);

    // Assert — stadiumUpgradeItems
    expect(bundle.stadiumUpgradeItems).toHaveLength(1);
    expect((bundle.stadiumUpgradeItems[0] as { id: string }).id).toBe(upgradeId);

    // Assert — tvContracts
    expect(bundle.tvContracts).toHaveLength(1);
    expect((bundle.tvContracts[0] as { id: string }).id).toBe(tvId);

    // Assert — sponsors
    expect(bundle.sponsors).toHaveLength(1);
    expect((bundle.sponsors[0] as { id: string }).id).toBe(sponsorId);

    // Assert — milestones
    expect(bundle.milestones).toHaveLength(1);
    expect((bundle.milestones[0] as { id: string }).id).toBe(milestoneId);

    // Assert — managerProfiles
    expect(bundle.managerProfiles).toHaveLength(1);
    expect((bundle.managerProfiles[0] as { id: string }).id).toBe(profileId);

    // Assert — skillXpEvents
    expect(bundle.skillXpEvents).toHaveLength(1);
    expect((bundle.skillXpEvents[0] as { id: string }).id).toBe(xpId);

    // Regression: non-empty clubs/players arrays confirm cross-table joins work
    expect(bundle.clubs.length).toBeGreaterThan(0);
    expect(bundle.players.length).toBeGreaterThan(0);

    // Cleanup — cascade from user delete clears pt+player+staff+tvContract+sponsor+milestone+profile+xp
    // Club and upgradeItems reference club directly — delete club after user
    await executeUserDeletion(userId, { force: true });
    await db.delete(clubs).where(eq(clubs.id, clubId));
    // Remove from `created` since we already deleted
    const idx = created.indexOf(userId);
    if (idx !== -1) created.splice(idx, 1);
  });
});

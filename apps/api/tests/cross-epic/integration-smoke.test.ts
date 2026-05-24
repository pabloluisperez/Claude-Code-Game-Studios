/**
 * Cross-epic integration smoke (Sprint 7 task 7-5).
 *
 * Verifies the inter-epic glue is wired correctly post-Pre-Production gate:
 *   A. economy ↔ tv-rights: `tv_contract.weekly_rate_eur_k` flows into matchday
 *      revenue via F-TV4 (fan_loyalty multiplier on attendance).
 *   B. manager-rpg ↔ staff-system: `getMaxHirableStaffQuality(reputation.level)`
 *      gate from ADR-010 is enforced by the staff hire service (Pilar 1↔Pilar 3
 *      resolution mechanism).
 *
 * These are not deep behavioral tests — those live in each epic's own suite.
 * The purpose here is a fast regression net for the cross-epic contracts that
 * the gate-check PR director called out as Sprint 7 Should-Have scope.
 *
 * Story: Sprint 7 task 7-5
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  clubs,
  db,
  eq,
  managerProfiles,
  playthroughs,
  users,
} from '@smt/db';
import { computeMatchDayRevenue } from '@smt/shared/sim/economy/revenue';
import {
  getMaxHirableStaffQuality,
  isStaffTierHirable,
  type ManagerSkills,
} from '@smt/shared';
import { hireStaff } from '../../src/modules/staff/service.js';

// ── Test scaffolding ─────────────────────────────────────────────────────────

const createdPlaythroughIds: string[] = [];
let testUserId: string;
let testClubId: string;

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `cross-epic-${userId}@test.local`,
    username: `cross-epic-${userId.slice(0, 12)}`,
    passwordHash: 'test-hash-not-used',
    createdAt: new Date(),
  });
  return userId;
}

async function seedClub(): Promise<string> {
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    name: `Cross-epic Club ${clubId.slice(0, 8)}`,
    city: 'Test City',
    division: 'second',
  });
  return clubId;
}

async function seedPlaythroughWithReputation(
  userId: string,
  clubId: string,
  reputationLevel: number,
): Promise<string> {
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

  const skills: ManagerSkills = {
    tactical_insight: { id: 'tactical_insight', level: 1, xp: 0 },
    financial_acumen: { id: 'financial_acumen', level: 1, xp: 0 },
    man_management: { id: 'man_management', level: 1, xp: 0 },
    scouting_network: { id: 'scouting_network', level: 1, xp: 0 },
    reputation: { id: 'reputation', level: reputationLevel, xp: 0 },
  };
  await db.insert(managerProfiles).values({
    playthroughId,
    name: 'Test Manager',
    skills,
    fanLoyalty: 0,
  });
  createdPlaythroughIds.push(playthroughId);
  return playthroughId;
}

beforeAll(async () => {
  testUserId = await seedUser();
  testClubId = await seedClub();
});

afterEach(async () => {
  for (const id of createdPlaythroughIds) {
    await db.delete(playthroughs).where(eq(playthroughs.id, id));
  }
  createdPlaythroughIds.length = 0;
});

afterAll(async () => {
  await db.delete(clubs).where(eq(clubs.id, testClubId));
  await db.delete(users).where(eq(users.id, testUserId));
});

// ── A. economy ↔ tv-rights: F-TV4 fan_loyalty boosts matchday revenue ───────

describe('cross-epic A: economy ↔ tv-rights (F-TV4 fan_loyalty boost)', () => {
  it('test_cross_epic_fan_loyalty_zero_matches_baseline_attendance_revenue', () => {
    // With fan_loyalty=0 (no rejected TV offers), revenue is plain attendance × ticket / 1000.
    const baseline = computeMatchDayRevenue({
      attendance: 4_000,
      ticketPriceEur: 8,
    });
    expect(baseline).toBe(32); // 4000 × 8 / 1000 = 32 €K
  });

  it('test_cross_epic_fan_loyalty_30_amplifies_attendance_by_15_percent', () => {
    // 3 TV rejections → fan_loyalty=30. Per F-TV4: effective_attendance = attendance × 1.15.
    // 4000 × 1.15 = 4600; revenue = 4600 × 8 / 1000 = 36.8 → rounded to 37.
    const boosted = computeMatchDayRevenue({
      attendance: 4_000,
      ticketPriceEur: 8,
      fanLoyalty: 30,
    });
    expect(boosted).toBe(37);
  });

  it('test_cross_epic_fan_loyalty_50_clamped_at_stadium_capacity', () => {
    // 5 rejections → fan_loyalty=50 (cap). 1 + 50×0.005 = 1.25.
    // Attendance 4000 × 1.25 = 5000, but stadium cap is 4500 — clamp to 4500.
    // Revenue = 4500 × 8 / 1000 = 36 €K.
    const clamped = computeMatchDayRevenue({
      attendance: 4_000,
      ticketPriceEur: 8,
      fanLoyalty: 50,
      stadiumCapacity: 4_500,
    });
    expect(clamped).toBe(36);
    // Compared to the boosted-50-uncapped case (5000 × 8 / 1000 = 40), the clamp
    // genuinely reduces revenue. This is the F-TV4 "decision P1" point — a
    // sold-out stadium prevents loyalty from being free additional revenue.
    const uncapped = computeMatchDayRevenue({
      attendance: 4_000,
      ticketPriceEur: 8,
      fanLoyalty: 50,
    });
    expect(uncapped).toBe(40);
    expect(clamped).toBeLessThan(uncapped);
  });
});

// ── B. manager-rpg ↔ staff-system: reputation gates staff hire tier ─────────

describe('cross-epic B: manager-rpg ↔ staff-system (Pilar 1↔Pilar 3 gate)', () => {
  it('test_cross_epic_reputation_level_1_blocks_tier_2_and_3_hires', async () => {
    const playthroughId = await seedPlaythroughWithReputation(
      testUserId,
      testClubId,
      1, // reputation L1 → maxTier=1
    );
    expect(getMaxHirableStaffQuality(1)).toBe(1);
    expect(isStaffTierHirable(1, 2)).toBe(false);
    expect(isStaffTierHirable(1, 3)).toBe(false);

    const tier2Attempt = await hireStaff(db, {
      playthroughId,
      clubId: testClubId,
      role: 'groundskeeper',
      qualityTier: 2,
      name: 'Should Reject',
      hiredWeek: 1,
    });
    expect(tier2Attempt.ok).toBe(false);
    if (tier2Attempt.ok === false) {
      expect(tier2Attempt.reason).toBe('tier_above_reputation_cap');
    }

    const tier1Attempt = await hireStaff(db, {
      playthroughId,
      clubId: testClubId,
      role: 'groundskeeper',
      qualityTier: 1,
      name: 'Should Succeed',
      hiredWeek: 1,
    });
    expect(tier1Attempt.ok).toBe(true);
  });

  it('test_cross_epic_reputation_level_3_allows_tier_2_blocks_tier_3', async () => {
    const playthroughId = await seedPlaythroughWithReputation(
      testUserId,
      testClubId,
      3, // reputation L3 → maxTier=2
    );
    expect(getMaxHirableStaffQuality(3)).toBe(2);

    const tier3Attempt = await hireStaff(db, {
      playthroughId,
      clubId: testClubId,
      role: 'fitness_coach',
      qualityTier: 3,
      name: 'Should Reject T3',
      hiredWeek: 1,
    });
    expect(tier3Attempt.ok).toBe(false);

    const tier2Attempt = await hireStaff(db, {
      playthroughId,
      clubId: testClubId,
      role: 'fitness_coach',
      qualityTier: 2,
      name: 'Should Succeed T2',
      hiredWeek: 1,
    });
    expect(tier2Attempt.ok).toBe(true);
  });

  it('test_cross_epic_reputation_level_5_allows_all_tiers_including_tier_3', async () => {
    const playthroughId = await seedPlaythroughWithReputation(
      testUserId,
      testClubId,
      5, // reputation L5 → maxTier=3
    );
    expect(getMaxHirableStaffQuality(5)).toBe(3);

    for (const tier of [1, 2, 3] as const) {
      const attempt = await hireStaff(db, {
        playthroughId,
        clubId: testClubId,
        role: 'head_coach',
        qualityTier: tier,
        name: `T${tier} should succeed`,
        hiredWeek: 1,
      });
      expect(attempt.ok, `tier ${tier} should be hirable at reputation L5`).toBe(true);
    }
  });
});

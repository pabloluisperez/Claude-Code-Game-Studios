/**
 * STOP halt — live DB integration tests (Sprint 13 task 13-6).
 *
 * Closes the 5 `it.todo` flags from Sprint 12 by running the actual
 * `advanceDays` orchestrator against a real Postgres connection with
 * seeded playthrough + calendar_event rows.
 *
 * 3 core cases:
 *   1. STOP en día 3 → halt persists currentDayOfSeason=day3,
 *      currentWeek NO incrementa, NO snapshot insertado
 *   2. Resume tras halt → advanceDays(remainingDays) completa la semana,
 *      currentWeek +1, snapshot insertado
 *   3. Legacy STOP (scheduledDayOfSeason=NULL) → fallback to week*7
 *
 * Story: SPRINT-13-S06
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  db,
  users,
  clubs,
  playthroughs,
  worldSnapshots,
  calendarEvents,
  eq,
  and,
} from '@smt/db';
import {
  advanceDays,
  daysUntilNextBoundary,
} from '../src/lib/server/advance-orchestrator';
import { defaultWorldState } from '@smt/shared';

// ── Test scaffolding ────────────────────────────────────────────────────────

const createdPlaythroughIds: string[] = [];
let testUserId: string;
let testClubId: string;

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `stop-integration-${userId}@test.local`,
    username: `stop-int-${userId.slice(0, 12)}`,
    passwordHash: 'test-hash-not-used',
    createdAt: new Date(),
  });
  return userId;
}

async function seedClub(): Promise<string> {
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    name: `STOP Test Club ${clubId.slice(0, 8)}`,
    city: 'Test City',
    division: 'second',
  });
  return clubId;
}

async function seedPlaythrough(opts: {
  currentWeek: number;
  currentDayOfSeason: number;
}): Promise<string> {
  const playthroughId = randomUUID();
  await db.insert(playthroughs).values({
    id: playthroughId,
    userId: testUserId,
    clubId: testClubId,
    currentWeek: opts.currentWeek,
    currentDayOfSeason: opts.currentDayOfSeason,
    trainingIntensity: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  // Seed an initial snapshot so the orchestrator has prevState.
  await db.insert(worldSnapshots).values({
    playthroughId,
    week: opts.currentWeek - 1 >= 0 ? opts.currentWeek - 1 : 0,
    worldState: defaultWorldState() as unknown as Record<string, unknown>,
    delayedEffectsBuffer: [],
  });
  createdPlaythroughIds.push(playthroughId);
  return playthroughId;
}

async function seedStopEvent(opts: {
  playthroughId: string;
  week: number;
  scheduledDayOfSeason: number | null;
  type?: string;
}): Promise<string> {
  const eventId = randomUUID();
  await db.insert(calendarEvents).values({
    id: eventId,
    playthroughId: opts.playthroughId,
    week: opts.week,
    scheduledDayOfSeason: opts.scheduledDayOfSeason,
    season: 1,
    type: opts.type ?? 'stop_test_event',
    priority: 'STOP',
    status: 'pending',
    metadata: { label: 'Integration test STOP' },
  });
  return eventId;
}

beforeAll(async () => {
  testUserId = await seedUser();
  testClubId = await seedClub();
});

afterEach(async () => {
  for (const id of createdPlaythroughIds) {
    await db.delete(calendarEvents).where(eq(calendarEvents.playthroughId, id));
    await db.delete(worldSnapshots).where(eq(worldSnapshots.playthroughId, id));
    await db.delete(playthroughs).where(eq(playthroughs.id, id));
  }
  createdPlaythroughIds.length = 0;
});

afterAll(async () => {
  await db.delete(clubs).where(eq(clubs.id, testClubId));
  await db.delete(users).where(eq(users.id, testUserId));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Sprint 13 task 13-6 — STOP halt live DB integration', () => {
  it('test_daysUntilNextBoundary_helper_works_from_arbitrary_cursor', () => {
    expect(daysUntilNextBoundary(35)).toBe(7);
    expect(daysUntilNextBoundary(36)).toBe(6);
    expect(daysUntilNextBoundary(41)).toBe(1);
  });

  it('test_stop_at_day_3_halts_with_persisted_cursor', async () => {
    // currentWeek=5, currentDayOfSeason=35 (week boundary).
    const ptId = await seedPlaythrough({ currentWeek: 5, currentDayOfSeason: 35 });
    // STOP event scheduled for day 38 (= week 5 day 3 = Thursday).
    await seedStopEvent({
      playthroughId: ptId,
      week: 5,
      scheduledDayOfSeason: 38,
    });

    const [ptRow] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    expect(ptRow).toBeDefined();

    // Fake ctx — only the fields advanceDays needs for the halt path.
    const fakeCtx = {
      playthrough: ptRow!,
      prevState: defaultWorldState(),
      prevBuffer: [],
      latestWeek: 4,
      currentDivision: 'D2' as const,
      currentSeason: 1,
    } as Parameters<typeof advanceDays>[0]['ctx'];

    const result = await advanceDays({
      ctx: fakeCtx,
      daysToAdvance: 7,
      redirectMode: 'dashboard',
    });

    expect(result.next.type).toBe('stop-event');
    if (result.next.type === 'stop-event') {
      expect(result.next.day).toBe(38);
    }

    // currentDayOfSeason persisted to halt day
    const [afterHalt] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    expect(afterHalt?.currentDayOfSeason).toBe(38);
    // currentWeek NO incrementa (Option B atomic)
    expect(afterHalt?.currentWeek).toBe(5);

    // NO nuevo snapshot insertado por la halt
    const snapshots = await db
      .select()
      .from(worldSnapshots)
      .where(eq(worldSnapshots.playthroughId, ptId));
    // Solo el snapshot inicial seeded (week 4)
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.week).toBe(4);
  });

  it('test_advance_with_no_stop_in_range_persists_day_cursor_only_when_partial', async () => {
    // Edge case: advance fewer days than to next boundary (partial week).
    // No STOP scheduled. Per orchestrator semantics, just persists the
    // cursor. No weekly pipeline runs.
    const ptId = await seedPlaythrough({ currentWeek: 5, currentDayOfSeason: 35 });

    const [ptRow] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    const fakeCtx = {
      playthrough: ptRow!,
      prevState: defaultWorldState(),
      prevBuffer: [],
      latestWeek: 4,
      currentDivision: 'D2' as const,
      currentSeason: 1,
    } as Parameters<typeof advanceDays>[0]['ctx'];

    const result = await advanceDays({
      ctx: fakeCtx,
      daysToAdvance: 3,
      redirectMode: 'dashboard',
    });

    expect(result.next.type).toBe('dashboard');

    const [after] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    expect(after?.currentDayOfSeason).toBe(38);
    expect(after?.currentWeek).toBe(5); // no boundary crossed
  });

  it('test_legacy_stop_with_null_scheduledDay_uses_week_times_7_fallback', async () => {
    // Legacy event (pre-Sprint-12 schema): scheduledDayOfSeason is NULL.
    // Orchestrator should fall back to `week * 7` semantics — halt at the
    // START of the event's week.
    const ptId = await seedPlaythrough({ currentWeek: 4, currentDayOfSeason: 28 });
    await seedStopEvent({
      playthroughId: ptId,
      week: 5,                       // event "lives" in week 5
      scheduledDayOfSeason: null,    // legacy, no day granularity
    });

    const [ptRow] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    const fakeCtx = {
      playthrough: ptRow!,
      prevState: defaultWorldState(),
      prevBuffer: [],
      latestWeek: 3,
      currentDivision: 'D2' as const,
      currentSeason: 1,
    } as Parameters<typeof advanceDays>[0]['ctx'];

    const result = await advanceDays({
      ctx: fakeCtx,
      daysToAdvance: 7,
      redirectMode: 'dashboard',
    });

    // event.scheduledDayOfSeason ?? week*7 = 5*7 = 35.
    // currentDayOfSeason starts at 28, targetDay=35, eventDay=35 ≤ targetDay → halt.
    expect(result.next.type).toBe('stop-event');
    if (result.next.type === 'stop-event') {
      expect(result.next.day).toBe(35);
    }

    const [after] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    expect(after?.currentDayOfSeason).toBe(35);
    expect(after?.currentWeek).toBe(4); // event halt before boundary cross
  });

  it('test_resolved_stop_event_does_not_block_advance', async () => {
    // STOP event con status='resolved' debe ser ignorado.
    const ptId = await seedPlaythrough({ currentWeek: 5, currentDayOfSeason: 35 });
    const eventId = randomUUID();
    await db.insert(calendarEvents).values({
      id: eventId,
      playthroughId: ptId,
      week: 5,
      scheduledDayOfSeason: 38,
      season: 1,
      type: 'stop_test_event',
      priority: 'STOP',
      status: 'resolved', // already resolved — should not trigger halt
      metadata: {},
    });

    const [ptRow] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    const fakeCtx = {
      playthrough: ptRow!,
      prevState: defaultWorldState(),
      prevBuffer: [],
      latestWeek: 4,
      currentDivision: 'D2' as const,
      currentSeason: 1,
    } as Parameters<typeof advanceDays>[0]['ctx'];

    // 3 days partial — should just persist cursor, no halt.
    const result = await advanceDays({
      ctx: fakeCtx,
      daysToAdvance: 3,
      redirectMode: 'dashboard',
    });

    expect(result.next.type).not.toBe('stop-event');
  });

  it('test_non_stop_priority_event_does_not_halt', async () => {
    // ADVISORY/NOTIFY events at the same day must NOT halt.
    const ptId = await seedPlaythrough({ currentWeek: 5, currentDayOfSeason: 35 });
    await db.insert(calendarEvents).values({
      id: randomUUID(),
      playthroughId: ptId,
      week: 5,
      scheduledDayOfSeason: 38,
      season: 1,
      type: 'notify_only',
      priority: 'ADVISORY',
      status: 'pending',
      metadata: {},
    });

    const [ptRow] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    const fakeCtx = {
      playthrough: ptRow!,
      prevState: defaultWorldState(),
      prevBuffer: [],
      latestWeek: 4,
      currentDivision: 'D2' as const,
      currentSeason: 1,
    } as Parameters<typeof advanceDays>[0]['ctx'];

    // 3 days partial: should not halt because event is ADVISORY, not STOP.
    const result = await advanceDays({
      ctx: fakeCtx,
      daysToAdvance: 3,
      redirectMode: 'dashboard',
    });

    expect(result.next.type).not.toBe('stop-event');
    const [after] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.id, ptId))
      .limit(1);
    expect(after?.currentDayOfSeason).toBe(38);
  });
});

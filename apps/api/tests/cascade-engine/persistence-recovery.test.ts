/**
 * Integration tests for world-state persistence + recovery against live Postgres.
 *
 * Requires:
 *   - docker-compose up postgres (port 5433 with user smt / db smt)
 *   - drizzle-kit migrate applied
 *
 * Covers CASCADE-015 ACs:
 *   AC-SER-05: INSERT + SELECT round-trip via real DB
 *   AC #6:     append-only invariant (live schema rejects duplicate (playthroughId, week))
 *   AC #7:     recovery determinism — load from week N, re-advance, end-state identical
 *   AC #8:     buffer mid-flight survives crash — delayed effect queued at W=3 still fires at W=5
 *
 * Story: CASCADE-ENGINE-015
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  db,
  clubs,
  playthroughs,
  users,
  worldSnapshots,
  eq,
} from '@smt/db';
import {
  saveTickResult,
  loadCurrentWorldState,
} from '../../src/modules/world-state/world-state-repo.js';
import {
  runTick,
  CASCADA_FC_GRAPH,
  defaultWorldState,
  createSeededRng,
} from '@smt/shared';
import type {
  PlayerDecision,
  SimContext,
  WorldState,
} from '@smt/shared/sim/cascade-types';
import type {
  DelayedEffect,
  DelayedEffectsBuffer,
} from '@smt/shared/sim/delayed-effects';

const NO_DECISIONS: readonly PlayerDecision[] = [];
const createdPlaythroughIds: string[] = [];
let testUserId: string;
let testClubId: string;

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `cascade-015-${userId}@test.local`,
    username: `cascade-015-${userId.slice(0, 12)}`,
    passwordHash: 'test-hash-not-used',
    createdAt: new Date(),
  });
  return userId;
}

async function seedClub(): Promise<string> {
  const clubId = randomUUID();
  await db.insert(clubs).values({
    id: clubId,
    name: `CASCADE-015 Club ${clubId.slice(0, 8)}`,
    city: 'Test City',
    division: 'second',
  });
  return clubId;
}

async function seedPlaythrough(userId: string, clubId: string): Promise<string> {
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
  createdPlaythroughIds.push(playthroughId);
  return playthroughId;
}

beforeAll(async () => {
  testUserId = await seedUser();
  testClubId = await seedClub();
});

afterEach(async () => {
  // Cascade delete via FK from playthroughs → world_snapshots → clean.
  for (const id of createdPlaythroughIds) {
    await db.delete(playthroughs).where(eq(playthroughs.id, id));
  }
  createdPlaythroughIds.length = 0;
});

afterAll(async () => {
  await db.delete(clubs).where(eq(clubs.id, testClubId));
  await db.delete(users).where(eq(users.id, testUserId));
});

// ── Sprint 8 task 8-1: new schema columns persistence + load round-trip ─────

describe('Sprint 8 task 8-1 — cascade_log + threshold_crossings + seed_state', () => {
  it('test_persistence_new_columns_optional_default_to_null', async () => {
    // Backward compat: saving WITHOUT the new columns yields NULL on load.
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    await saveTickResult(db, {
      playthroughId,
      week: 1,
      worldState: defaultWorldState(),
      delayedEffectsBuffer: [],
      // Intentionally omit cascadeLog, thresholdCrossings, seedState.
    });
    const loaded = await loadCurrentWorldState(db, playthroughId);
    expect(loaded).not.toBeNull();
    expect(loaded?.cascadeLog).toBeNull();
    expect(loaded?.thresholdCrossings).toBeNull();
    expect(loaded?.seedState).toBeNull();
  });

  it('test_persistence_new_columns_round_trip_when_provided', async () => {
    // Provide all 3 new columns; verify they round-trip via jsonb + text.
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const fakeCascadeLog = [
      { source: 'edge', edgeId: 'C0', nodeId: 'team_fitness', delta: -1.0, week: 1 },
      { source: 'delayed', edgeId: 'C5a', nodeId: 'team_fitness', delta: 0.4, week: 1 },
    ];
    const fakeCrossings = [
      { nodeId: 'fan_momentum', kind: 'BLOCKING', from: 22, to: 18, week: 1 },
    ];
    const fakeSeedState = JSON.stringify({ i: 42, j: 7, S: [1, 2, 3] });

    await saveTickResult(db, {
      playthroughId,
      week: 1,
      worldState: defaultWorldState(),
      delayedEffectsBuffer: [],
      cascadeLog: fakeCascadeLog,
      thresholdCrossings: fakeCrossings,
      seedState: fakeSeedState,
    });
    const loaded = await loadCurrentWorldState(db, playthroughId);
    expect(loaded).not.toBeNull();
    expect(loaded?.cascadeLog).toEqual(fakeCascadeLog);
    expect(loaded?.thresholdCrossings).toEqual(fakeCrossings);
    expect(loaded?.seedState).toBe(fakeSeedState);
  });
});

// ── AC-SER-05: round-trip via real DB ────────────────────────────────────────

describe('CASCADE-015 — AC-SER-05 (INSERT + SELECT round-trip)', () => {
  it('test_persistence_round_trip_world_state_byte_identical', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const state: WorldState = {
      ...defaultWorldState(),
      fan_momentum: 58.123456789,
      team_fitness: 72.5,
    };
    const buffer: DelayedEffectsBuffer = [
      { applyAt: 5, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' },
      { applyAt: 6, toNode: 'team_fitness', delta: 0.4, edgeId: 'C5a' },
    ];

    await saveTickResult(db, {
      playthroughId,
      week: 1,
      worldState: state,
      delayedEffectsBuffer: buffer,
    });

    const loaded = await loadCurrentWorldState(db, playthroughId);
    expect(loaded).not.toBeNull();
    expect(loaded?.week).toBe(1);
    // 6-decimal precision through Postgres jsonb (per AC-SER-01).
    expect(loaded?.worldState.fan_momentum).toBeCloseTo(58.123456789, 6);
    expect(loaded?.worldState.team_fitness).toBeCloseTo(72.5, 6);
    expect(loaded?.delayedEffectsBuffer.length).toBe(2);
    const c15 = loaded?.delayedEffectsBuffer.find((e) => e.edgeId === 'C15');
    expect(c15?.delta).toBeCloseTo(-1.8, 6);
  });
});

// ── AC #6: append-only via unique-index (live schema's stricter design) ──────

describe('CASCADE-015 — AC #6 (append-only / unique constraint)', () => {
  it('test_persistence_duplicate_week_insert_throws_on_unique_index', async () => {
    // Live schema enforces uniqueness via `world_snapshots_playthrough_week`
    // unique index. The story spec's "no unique constraint" was an early design;
    // the live design is stricter and rejects duplicates loudly — which still
    // satisfies the ADR-005 append-only intent.
    const playthroughId = await seedPlaythrough(testUserId, testClubId);

    await saveTickResult(db, {
      playthroughId,
      week: 3,
      worldState: defaultWorldState(),
      delayedEffectsBuffer: [],
    });

    // Second insert at the same (playthroughId, week) must fail.
    await expect(
      saveTickResult(db, {
        playthroughId,
        week: 3,
        worldState: defaultWorldState(),
        delayedEffectsBuffer: [],
      }),
    ).rejects.toThrow();
  });
});

// ── AC #7: recovery determinism ─────────────────────────────────────────────

describe('CASCADE-015 — AC #7 (recovery determinism)', () => {
  it('test_persistence_load_from_week_3_re_advance_matches_original_week_5', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const seed = 'test:cascade-015:recovery';

    // Run 5 ticks ORIGINAL and persist each week. Capture week-5 state.
    let state: WorldState = defaultWorldState();
    let buffer: DelayedEffectsBuffer = [];
    const rng = createSeededRng(seed);
    let week5Original: WorldState | null = null;

    for (let week = 1; week <= 5; week++) {
      const ctx: SimContext = {
        rng,
        currentWeek: week,
        hasMatchThisWeek: false,
        prevState: state,
      };
      const result = runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
      state = result.nextState;
      buffer = result.newDelayedEffects;
      await saveTickResult(db, {
        playthroughId,
        week,
        worldState: state,
        delayedEffectsBuffer: buffer,
      });
      if (week === 5) week5Original = state;
    }

    expect(week5Original).not.toBeNull();

    // Now SIMULATE a crash + recovery:
    //   * Delete weeks 4 and 5 (as if we lost work after week 3 was persisted).
    //   * Reload from week 3 snapshot.
    //   * Replay weeks 4 + 5 from a fresh rng seeded with the SAME seed string
    //     advanced past the first 3 calls' worth of stream consumption.
    //
    // For the recovery test to be lossless, we need the rng to be at the same
    // position it would have been at the start of week 4 in the original run.
    // The simplest way to achieve this is to use the same seed and advance
    // through weeks 1-3 first (warming the rng), then run weeks 4-5 fresh.
    // This mirrors what a real advance worker does: load snapshot + re-seed.
    await db.delete(worldSnapshots).where(eq(worldSnapshots.week, 5));
    await db.delete(worldSnapshots).where(eq(worldSnapshots.week, 4));

    const loaded = await loadCurrentWorldState(db, playthroughId);
    expect(loaded?.week).toBe(3);

    // Replay from week 3 with a fresh rng warmed by weeks 1-3 stream consumption.
    const recoveryRng = createSeededRng(seed);
    // Warm rng through weeks 1-3 (we have no transcript, so re-run those ticks
    // pure-functionally to advance the stream — the resulting states are
    // discarded, only the rng position matters).
    let warmState: WorldState = defaultWorldState();
    let warmBuffer: DelayedEffectsBuffer = [];
    for (let week = 1; week <= 3; week++) {
      const ctx: SimContext = {
        rng: recoveryRng,
        currentWeek: week,
        hasMatchThisWeek: false,
        prevState: warmState,
      };
      const result = runTick(ctx, CASCADA_FC_GRAPH, warmState, NO_DECISIONS, warmBuffer);
      warmState = result.nextState;
      warmBuffer = result.newDelayedEffects;
    }

    // Now re-run weeks 4 + 5 from the persisted week-3 snapshot using the
    // warmed rng. The loaded state + loaded buffer drive the recovery.
    let recoveredState: WorldState = loaded!.worldState;
    let recoveredBuffer: DelayedEffectsBuffer = loaded!.delayedEffectsBuffer;
    for (let week = 4; week <= 5; week++) {
      const ctx: SimContext = {
        rng: recoveryRng,
        currentWeek: week,
        hasMatchThisWeek: false,
        prevState: recoveredState,
      };
      const result = runTick(ctx, CASCADA_FC_GRAPH, recoveredState, NO_DECISIONS, recoveredBuffer);
      recoveredState = result.nextState;
      recoveredBuffer = result.newDelayedEffects;
    }

    // The recovered week-5 state MUST equal the original week-5 state.
    expect(recoveredState).toEqual(week5Original);
  });
});

// ── AC #8: buffer mid-flight survives crash ─────────────────────────────────

describe('CASCADE-015 — AC #8 (delayed effect survives mid-flight)', () => {
  it('test_persistence_buffer_with_w5_effect_fires_after_recovery', async () => {
    const playthroughId = await seedPlaythrough(testUserId, testClubId);
    const seed = 'test:cascade-015:buffer-mid-flight';

    // Persist a snapshot at W=3 with a buffer containing a single C15-style
    // effect scheduled for W=5. Then load + advance W=4 + W=5 and verify the
    // queued effect ACTUALLY FIRES (consumed by Step 1 of runTick at W=5).
    const baseState: WorldState = {
      ...defaultWorldState(),
      fan_momentum: 60,
    };
    const w5Effect: DelayedEffect = {
      applyAt: 5,
      toNode: 'fan_momentum',
      delta: -1.8,
      edgeId: 'C15',
    };
    await saveTickResult(db, {
      playthroughId,
      week: 3,
      worldState: baseState,
      delayedEffectsBuffer: [w5Effect],
    });

    const loaded = await loadCurrentWorldState(db, playthroughId);
    expect(loaded?.week).toBe(3);
    expect(loaded?.delayedEffectsBuffer.length).toBe(1);

    // Drive ticks 4 and 5 from the persisted state.
    const rng = createSeededRng(seed);
    let state: WorldState = loaded!.worldState;
    let buffer: DelayedEffectsBuffer = loaded!.delayedEffectsBuffer;
    let w5LogHasC15Delayed = false;

    for (let week = 4; week <= 5; week++) {
      const ctx: SimContext = {
        rng,
        currentWeek: week,
        hasMatchThisWeek: false,
        prevState: state,
      };
      const result = runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
      state = result.nextState;
      buffer = result.newDelayedEffects;
      if (week === 5) {
        const c15Delayed = result.log.find(
          (e) => e.source === 'delayed' && e.edgeId === 'C15',
        );
        w5LogHasC15Delayed = Boolean(c15Delayed);
        // The delayed effect's delta MUST appear in the log entry at W=5.
        expect(c15Delayed?.delta).toBeCloseTo(-1.8, 6);
      }
    }

    expect(w5LogHasC15Delayed).toBe(true);
    // The original W=5 effect (applyAt=5) is GONE from the buffer. Other
    // delayed edges (C1a/C2/C4/C5a/...) re-queue their own effects each
    // tick — verifying "the originally-persisted effect was consumed"
    // means checking that no entry remains with applyAt=5.
    const remainingApplyAt5 = buffer.filter((e) => e.applyAt === 5);
    expect(remainingApplyAt5.length).toBe(0);
  });
});

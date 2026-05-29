/**
 * Unit tests for the AI rotation worker (Story 25-5).
 *
 * All deps are mocked — NO live DB, NO live queue, NO live Redis.
 * The test verifies:
 *   1. Only AI clubs are processed (player's own club is never supplied
 *      in the loadAiClubs result — the loader is the gating layer).
 *   2. Deterministic offer set: same (playthroughId, week, world state)
 *      → identical makeOffer calls on every run.
 *   3. One club throwing does not abort the others.
 *   4. ALREADY_PENDING_OFFER outcome from makeOffer is skipped gracefully
 *      (no throw, no further processing).
 *
 * Design: processAiRotationJob is fully injectable, so we pass mock deps
 * directly without touching the BullMQ or Drizzle layers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiRotationWorkerDeps, AiClubWithRoster, AiPlayerCandidate } from '../../src/workers/ai-rotation-worker.js';
import { processAiRotationJob } from '../../src/workers/ai-rotation-worker.js';

/* ── Fixtures ────────────────────────────────────────────────────────── */

const PLAYTHROUGH_ID = '11111111-1111-1111-1111-111111111111';
const WEEK = 10;

const AI_CLUB_1: AiClubWithRoster = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  financialBalanceEurK: 2000,
  roster: [
    // Has 3 GK, 8 DEF — missing MID (needs 7) and FWD (needs 4)
    ...Array(3).fill({ position: 'GK' }),
    ...Array(8).fill({ position: 'DEF' }),
  ],
};

const AI_CLUB_2: AiClubWithRoster = {
  id: 'aaaaaaaa-0000-0000-0000-000000000002',
  financialBalanceEurK: 3000,
  roster: [
    ...Array(2).fill({ position: 'GK' }),
    ...Array(5).fill({ position: 'DEF' }),
    ...Array(5).fill({ position: 'MID' }),
  ],
};

const CANDIDATE_MID: AiPlayerCandidate = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  skill: 60,
  position: 'MID',
  wageExpectationEurKWeek: 8,
  transferValueEurK: 600,
  contractStatus: 'free_agent',
};

const CANDIDATE_FWD: AiPlayerCandidate = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  skill: 55,
  position: 'FWD',
  wageExpectationEurKWeek: 7,
  transferValueEurK: 550,
  contractStatus: 'free_agent',
};

/* ── Helper: build minimal deps ─────────────────────────────────────── */

function buildDeps(overrides: Partial<AiRotationWorkerDeps> = {}): AiRotationWorkerDeps {
  return {
    loadAiClubs: vi.fn(async () => [AI_CLUB_1, AI_CLUB_2]),
    loadCandidates: vi.fn(async ({ positions }) => {
      // Return candidates matching the requested positions
      return [CANDIDATE_MID, CANDIDATE_FWD].filter((c) => positions.includes(c.position));
    }),
    makeOffer: vi.fn(async () => ({
      ok: true as const,
      value: { kind: 'accepted' as const, offerId: 'offer-1', feeEurK: 0, finalWageEurKWeek: 9 },
    })),
    ...overrides,
  };
}

function makeJob(data?: Partial<{ playthroughId: string; week: number }>) {
  return {
    data: {
      playthroughId: data?.playthroughId ?? PLAYTHROUGH_ID,
      week: data?.week ?? WEEK,
    },
  };
}

/* ── Tests ───────────────────────────────────────────────────────────── */

describe('processAiRotationJob (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test_aiRotationWorker_calls_makeOffer_for_each_ai_club_with_candidates', async () => {
    // Arrange
    const deps = buildDeps();

    // Act
    await processAiRotationJob(makeJob(), deps);

    // Assert: makeOffer called at least once per AI club that has candidates
    expect(deps.makeOffer).toHaveBeenCalled();
    const calls = vi.mocked(deps.makeOffer).mock.calls;
    // Both clubs have gaps and candidates → expect 2 calls (one per club)
    expect(calls.length).toBe(2);
    // Each call targets the correct buyer club
    const buyerIds = calls.map((c) => c[0].clubId);
    expect(buyerIds).toContain(AI_CLUB_1.id);
    expect(buyerIds).toContain(AI_CLUB_2.id);
  });

  it('test_aiRotationWorker_deterministic_same_seed_produces_identical_calls', async () => {
    // Arrange — run the job twice with identical deps
    const deps1 = buildDeps();
    const deps2 = buildDeps();

    // Act
    await processAiRotationJob(makeJob(), deps1);
    await processAiRotationJob(makeJob(), deps2);

    // Assert: both runs produced the exact same makeOffer arguments
    const calls1 = vi.mocked(deps1.makeOffer).mock.calls;
    const calls2 = vi.mocked(deps2.makeOffer).mock.calls;
    expect(calls1.length).toBe(calls2.length);
    for (let i = 0; i < calls1.length; i++) {
      expect(calls1[i]).toEqual(calls2[i]);
    }
  });

  it('test_aiRotationWorker_different_week_produces_different_offer_amounts', async () => {
    // Arrange — same playthrough, different week → different PRNG seed → different bargainFactor
    const deps_w10 = buildDeps();
    const deps_w20 = buildDeps();

    // Act
    await processAiRotationJob(makeJob({ week: 10 }), deps_w10);
    await processAiRotationJob(makeJob({ week: 20 }), deps_w20);

    // Assert: at least one parameter differs between the two runs
    // (feeEurK and/or wageOfferEurKWeek will differ with different seeds)
    const calls_w10 = vi.mocked(deps_w10.makeOffer).mock.calls;
    const calls_w20 = vi.mocked(deps_w20.makeOffer).mock.calls;
    // Same number of calls (same club/candidate structure)
    expect(calls_w10.length).toBe(calls_w20.length);
    // At least one argument set must differ (different bargainFactor / wagePremium)
    const anyDiffers = calls_w10.some((c10, i) => {
      const c20 = calls_w20[i]!;
      return (
        c10[0].feeEurK !== c20[0].feeEurK ||
        c10[0].wageOfferEurKWeek !== c20[0].wageOfferEurKWeek
      );
    });
    expect(anyDiffers).toBe(true);
  });

  it('test_aiRotationWorker_one_club_throwing_does_not_abort_others', async () => {
    // Arrange — club 1 causes an error in loadCandidates; club 2 should still be processed
    const deps = buildDeps({
      loadCandidates: vi.fn(async ({ buyerClubId, positions }) => {
        if (buyerClubId === AI_CLUB_1.id) {
          throw new Error('DB exploded for club 1');
        }
        return [CANDIDATE_MID, CANDIDATE_FWD].filter((c) => positions.includes(c.position));
      }),
    });

    // Act — should not throw
    await expect(processAiRotationJob(makeJob(), deps)).resolves.toBeUndefined();

    // Assert: club 2 still got an offer attempt despite club 1 failing
    const calls = vi.mocked(deps.makeOffer).mock.calls;
    expect(calls.some((c) => c[0].clubId === AI_CLUB_2.id)).toBe(true);
    expect(calls.some((c) => c[0].clubId === AI_CLUB_1.id)).toBe(false);
  });

  it('test_aiRotationWorker_already_pending_offer_is_skipped_gracefully', async () => {
    // Arrange — makeOffer returns ALREADY_PENDING_OFFER for the first club,
    // accepted for the second.
    let callCount = 0;
    const deps = buildDeps({
      makeOffer: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false as const, error: 'ALREADY_PENDING_OFFER' as const };
        }
        return {
          ok: true as const,
          value: { kind: 'accepted' as const, offerId: 'offer-2', feeEurK: 0, finalWageEurKWeek: 9 },
        };
      }),
    });

    // Act — should not throw on ALREADY_PENDING_OFFER
    await expect(processAiRotationJob(makeJob(), deps)).resolves.toBeUndefined();

    // Assert: both clubs were attempted (2 makeOffer calls total)
    expect(vi.mocked(deps.makeOffer).mock.calls.length).toBe(2);
  });

  it('test_aiRotationWorker_no_ai_clubs_is_a_noop', async () => {
    // Arrange
    const deps = buildDeps({
      loadAiClubs: vi.fn(async () => []),
    });

    // Act
    await processAiRotationJob(makeJob(), deps);

    // Assert: no makeOffer calls
    expect(deps.makeOffer).not.toHaveBeenCalled();
  });

  it('test_aiRotationWorker_no_candidates_skips_makeOffer', async () => {
    // Arrange
    const deps = buildDeps({
      loadCandidates: vi.fn(async () => []),
    });

    // Act
    await processAiRotationJob(makeJob(), deps);

    // Assert: no makeOffer calls when there are no candidates
    expect(deps.makeOffer).not.toHaveBeenCalled();
  });

  it('test_aiRotationWorker_zero_budget_skips_makeOffer', async () => {
    // Arrange — both clubs have 0 balance → budget = 0
    const deps = buildDeps({
      loadAiClubs: vi.fn(async () => [
        { ...AI_CLUB_1, financialBalanceEurK: 0 },
        { ...AI_CLUB_2, financialBalanceEurK: 0 },
      ]),
    });

    // Act
    await processAiRotationJob(makeJob(), deps);

    // Assert
    expect(deps.makeOffer).not.toHaveBeenCalled();
  });

  it('test_aiRotationWorker_onComplete_called_with_correct_count', async () => {
    // Arrange
    const onComplete = vi.fn();
    const deps = buildDeps({ onComplete });

    // Act
    await processAiRotationJob(makeJob(), deps);

    // Assert: onComplete invoked with the correct playthrough/week
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(PLAYTHROUGH_ID, WEEK, expect.any(Number));
  });
});

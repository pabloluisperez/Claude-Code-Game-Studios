---
Story: SCOUTING-MARKET-006
Status: Deferred to v1.2
Last Updated: 2026-05-25
Type: Integration
GDD Requirement: AC-SCM-15/16/17/18/22
Governing ADR: ADR-031 §D5, ADR-008
Control Manifest: 2026-05-19
Test Evidence: F6 logic at packages/shared/tests/scouting/ai-rotation.test.ts (11/11 passing). BullMQ worker bootstrap deferred.
ImplementedAt: not yet (v1.2)
Note: BullMQ AI rotation worker requires the transfer_window_open event lifecycle from event-system (out-of-scope v1.1) + free-agent contractStatus. F6 pure-function logic (ai-rotation-logic.ts) is ready with full deterministic coverage.
---

# Story: AI club rotation worker + BullMQ trigger on transfer_window_open

## Goal

Implement the deterministic AI club rotation that runs once per `transfer_window_open` event. Listens to the event, dispatches a BullMQ job, runs the mini-loop per AI club (sell/buy/youth-promote), and marks completion in `scouting_market_window_status` so the UI can unblock.

## Scope

In `apps/api/src/modules/scouting-market/ai-club-rotation.ts`:

```typescript
import seedrandom from 'seedrandom';
import { generateBargainFactor, shouldMarkForSale, aiTransferBudget, computeSquadGaps } from '@smt/shared/sim/scouting/ai-rotation-logic';

export async function runAiClubRotation(windowId: string) {
  return db.transaction(async (tx) => {
    // Mark started
    await repo.markRotationStarted(tx, windowId);

    const worldSeed = await getWorldSeed(tx);
    const aiClubs = await clubRepo.getAllAiClubs(tx);

    for (const club of aiClubs) {
      const rngSeed = `${worldSeed}-${windowId}-${club.id}`;
      const rng = seedrandom(rngSeed);

      // Bargain factor for this window
      const bargainFactor = generateBargainFactor(rng);
      await repo.upsertAiClubWindowState(tx, club.id, windowId, bargainFactor);

      // Phase 1: Sell decisions
      const roster = await playerRepo.getRosterByClub(tx, club.id);
      for (const player of roster) {
        const decision = shouldMarkForSale(
          { age: player.age, morale: player.morale },
          { rosterSize: roster.length },
          rng
        );
        if (decision.mark) {
          await playerRepo.markForSale(tx, player.id, decision.reason!);
        }
      }

      // Phase 2: Buy decisions
      let remainingBudget = aiTransferBudget({ financialBalanceEurK: club.financialBalanceEurK });
      const positionsNeeded = computeSquadGaps({ roster });

      for (const pos of positionsNeeded) {
        if (remainingBudget <= 0) break;
        const candidate = await pickRandomInBand(tx, rng, club.division, pos, club.targetOvrBand);
        if (candidate && candidate.transferValueEurK <= remainingBudget) {
          await executeAiToAiTransfer(tx, club.id, candidate, candidate.transferValueEurK);
          remainingBudget -= candidate.transferValueEurK;
        }
      }

      // Phase 3: Youth promotion
      const newRosterCount = await playerRepo.countRoster(tx, club.id);
      while (await playerRepo.countRoster(tx, club.id) < TARGET_ROSTER_SIZE) {
        await promoteYouthFromWorldGen(tx, club.id, rng);
      }
    }

    await repo.markRotationCompleted(tx, windowId);

    // Broadcast all clubs UI can unblock
    await realtime.broadcastGlobal('scouting:window_rotation_complete', { windowId });
  });
}

async function pickRandomInBand(tx, rng, division, position, ovrBand) {
  const candidates = await playerRepo.findInBand(tx, { division, position, ovrBand, available: true });
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}

async function executeAiToAiTransfer(tx, buyerClubId, player, feeEurK) {
  await economy.debit(tx, buyerClubId, feeEurK, 'transfer_market_ai_to_ai');
  await economy.credit(tx, player.currentClubId, feeEurK, 'transfer_market_ai_to_ai');
  await playerRepo.updateClub(tx, player.id, buyerClubId, player.wageEurKWeek, 156); // 3-year contract default
  await cascadeEngine.emitEvent(tx, 'player.transferred', { playerId: player.id, fromClubId: player.currentClubId, toClubId: buyerClubId, feeEurK });
}

async function promoteYouthFromWorldGen(tx, clubId, rng) {
  const youth = await worldGenerator.pickYouthForDivision(tx, rng);
  await playerRepo.assignToClub(tx, youth.id, clubId);
}
```

In `apps/api/src/modules/scouting-market/worker.ts`:

```typescript
import { Queue, Worker, QueueScheduler } from 'bullmq';

const queue = new Queue('scouting-market', { connection: redisConnection });

export function setupWorker() {
  new Worker('scouting-market', async (job) => {
    if (job.name === 'window-rotation') {
      await runAiClubRotation(job.data.windowId);
    }
  }, { connection: redisConnection });
}

// Called by event-system when transfer_window_open fires
export async function enqueueWindowRotation(windowId: string) {
  await queue.add('window-rotation', { windowId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}
```

In `apps/api/src/modules/event-system/handlers.ts` (extend existing event handler):

```typescript
// Add to existing transfer_window_open handler:
async function onTransferWindowOpen(event) {
  await markPlayersInPool(event.windowId);
  await scoutingMarket.enqueueWindowRotation(event.windowId); // NEW
}
```

In SvelteKit middleware (`apps/web/src/hooks.server.ts` or similar):

Check if `/api/scouting/*` requests should be blocked until rotation completes:

```typescript
// On /api/scouting/* routes:
const status = await scoutingMarket.getWindowStatus(currentWindowId);
if (!status.rotationCompletedAt) {
  return new Response(JSON.stringify({ error: 'ROTATION_IN_PROGRESS' }), {
    status: 503,
    headers: { 'Retry-After': '5' },
  });
}
```

## Out of Scope

- UI integration (story 007)
- Counter-offer expiration (handled in story 004 tick)

## Acceptance Criteria

1. `runAiClubRotation` marks `rotation_started_at` then `rotation_completed_at` in `scouting_market_window_status`
2. Each AI club has a row in `ai_club_window_state` with deterministic `bargainFactor` (same seed → same value)
3. AI clubs with players age > 30 mark 50% of them for sale (binomial test over many runs)
4. AI clubs at `MIN_ROSTER_SIZE` don't sell more (preserves minimum)
5. AI clubs spend up to `AI_TRANSFER_BUDGET_PCT * balance` on transfers
6. AI clubs end above `MIN_ROSTER_SIZE` after rotation (youth promotion fills gaps)
7. AI-to-AI transfers debit buyer + credit seller (zero-sum)
8. Cascade events emitted for each transfer
9. BullMQ job retries on failure (verify with intentional failure injection)
10. SvelteKit middleware returns 503 if rotation not completed (with Retry-After header)
11. Realtime broadcast 'scouting:window_rotation_complete' fires once per window
12. Determinism: 2 fresh runs with same worldSeed + windowId → identical results (byte-for-byte same DB state)
13. AI club rotation idempotent: re-running the same windowId is a no-op if already completed

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/scouting-ai-rotation.test.ts`:

- Setup: 5 AI clubs with controlled state, 1 fresh transfer window
- Run rotation, verify:
  - All 5 clubs have window state rows (AC 2)
  - For-sale decisions match `shouldMarkForSale` outputs (AC 3)
  - Min roster preserved (AC 4, 6)
  - Budget spent (AC 5)
- Determinism: clone DB, run rotation twice with same seed, compare states (AC 12)
- Idempotency: run rotation, then call again with same windowId — verify no duplicate transfers (AC 13)

## Dependencies

- **Upstream**: 001 (schema), 003 (F6 logic), 005 (offer service for AI-to-AI transfer)
- **Downstream**: 007 (UI knows when window is "ready")

## Estimate

**1.5 days.** Worker setup + deterministic logic + middleware integration + integration tests.

## Notes / Gotchas

- `seedrandom` is already in use elsewhere in the project (per ADR-013) — reuse same library.
- The middleware-level 503 block is intentional: UI shows a "Generando mercado de fichajes..." spinner. Don't make it a 200 with stale data — the user must know the market is fresh.
- AI-to-AI transfers cascade: if club A sells to club B, then club B might re-sell to club C in the same rotation. This is acceptable but document the behavior.
- Performance: ~40 AI clubs * 22 players * 2 phases ≈ 1760 ops per window. With proper indexes, should complete in <10s. Verify in test.
- Failure mode: if BullMQ job dies mid-rotation, second run finds partial state. Idempotency (AC 13) requires checking `rotation_completed_at` IS NULL before proceeding.

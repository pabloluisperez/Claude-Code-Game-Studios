---
Story: SCOUTING-MARKET-005
Status: Deferred to v1.2
Last Updated: 2026-05-25
Type: Logic
GDD Requirement: AC-SCM-08/09/10/11/12/19/30
Governing ADR: ADR-031 §D3
Control Manifest: 2026-05-19
Test Evidence: F2 / F3 formulas at packages/shared/tests/scouting/{free-agent,auction}.test.ts (11/11 passing). Service+routes wire-up deferred.
ImplementedAt: not yet (v1.2)
Note: Offer/auction flow requires (a) a free_agent contractStatus on players (absent in v1.1 schema) and (b) F3 counter-offer state machine wired through routes. F2/F3 formulas exist in @smt/shared with deterministic test coverage; v1.2 plugs them into the offer-service contract.
---

# Story: Transfer offer service (free agent + AI club auction)

## Goal

Implement the transfer offer service. Free agent flow = single-step (offer wage → player decides). AI club flow = two-step auction (offer fee → AI decides accept/counter/reject; manager accepts counter or re-bids up to MAX_BIDS).

## Scope

In `apps/api/src/modules/scouting-market/offer-service.ts`:

```typescript
export async function makeOffer(p: {
  clubId: string;
  playerId: string;
  windowId: string;
  feeEurK: number;          // 0 for free agent
  wageOfferEurKWeek: number;
  contractWeeks: number;
}) {
  return db.transaction(async (tx) => {
    // 1. Verify window
    if (!await isWindowOpen(tx, p.windowId)) return err('WINDOW_CLOSED');

    // 2. Load player + verify still in pool (§5.2)
    const player = await playerRepo.getById(tx, p.playerId);
    if (!player) return err('PLAYER_NOT_FOUND');

    // 3. Verify max bids not exceeded
    const existingBids = await repo.countBidsByBuyerPlayerWindow(tx, p.clubId, p.playerId, p.windowId);
    if (existingBids >= MAX_BIDS_PER_PLAYER) return err('MAX_BIDS_REACHED');

    // 4. Verify player not in rejection list
    const rejected = await repo.checkRejection(tx, p.playerId, p.clubId, p.windowId);
    if (rejected) return err('PLAYER_REJECTED_THIS_WINDOW');

    // 5. Verify balance for fee + first wage
    const balance = await economy.getBalance(tx, p.clubId);
    if (balance < p.feeEurK) return err('INSUFFICIENT_BALANCE');

    // 6. Determine flow: free agent vs AI club
    if (player.currentClubId === null) {
      // Free agent flow
      const accepted = freeAgentAcceptance(p.wageOfferEurKWeek, {
        wageExpectationEurKWeek: player.wageExpectationEurKWeek,
        weeksUnsigned: player.weeksUnsigned,
      });

      if (accepted) {
        return await executeFreeAgentTransfer(tx, p, player);
      } else {
        await recordRejection(tx, p.playerId, p.clubId, p.windowId, 'wage_too_low');
        return ok({ status: 'rejected', reason: 'wage_too_low' });
      }
    } else {
      // AI club auction flow
      const aiClubState = await repo.getAiClubWindowState(tx, player.currentClubId, p.windowId);
      const needFactor = await computeAiNeedFactor(tx, player.currentClubId, player.position);
      const result = aiClubAcceptance(p.feeEurK, { transferValueEurK: player.transferValueEurK }, {
        bargainFactor: aiClubState.bargainFactor,
        needFactor,
      });

      const bidNumber = existingBids + 1;

      if ('accepted' in result && result.accepted) {
        return await executeAiClubTransfer(tx, p, player, p.feeEurK);
      }

      if ('counterOfferEurK' in result) {
        const offerId = await repo.insertOffer(tx, {
          buyerClubId: p.clubId, sellerClubId: player.currentClubId, playerId: p.playerId,
          windowId: p.windowId, feeEurK: p.feeEurK, wageOfferEurKWeek: p.wageOfferEurKWeek,
          contractWeeks: p.contractWeeks, status: 'countered',
          counterOfferEurK: result.counterOfferEurK, bidNumber,
        });
        return ok({ status: 'countered', offerId, counterOfferEurK: result.counterOfferEurK });
      }

      // Hard reject
      await recordRejection(tx, p.playerId, p.clubId, p.windowId, 'price_too_low');
      return ok({ status: 'rejected', reason: 'price_too_low' });
    }
  });
}

export async function acceptCounterOffer(p: { clubId: string; offerId: string }) {
  return db.transaction(async (tx) => {
    const offer = await repo.getOfferById(tx, p.offerId);
    if (!offer || offer.buyerClubId !== p.clubId) return err('NOT_FOUND');
    if (offer.status !== 'countered') return err('NOT_COUNTERED');

    // Verify balance for counter
    const balance = await economy.getBalance(tx, p.clubId);
    if (balance < offer.counterOfferEurK!) return err('INSUFFICIENT_BALANCE');

    const player = await playerRepo.getById(tx, offer.playerId);
    return await executeAiClubTransfer(tx, {
      clubId: p.clubId, playerId: offer.playerId, windowId: offer.windowId,
      feeEurK: offer.counterOfferEurK!, wageOfferEurKWeek: offer.wageOfferEurKWeek,
      contractWeeks: offer.contractWeeks,
    }, player, offer.counterOfferEurK!);
  });
}

async function executeFreeAgentTransfer(tx, p, player) {
  // 1. Update player: assign to buyer club
  await playerRepo.updateClub(tx, player.id, p.clubId, p.wageOfferEurKWeek, p.contractWeeks);

  // 2. No fee paid (free agent)
  // 3. Emit cascade event (squad changes affect team_skill via player-management)
  await cascadeEngine.emitEvent(tx, 'player.joined_club', { clubId: p.clubId, playerId: player.id });

  // 4. Realtime broadcast
  await realtime.broadcast(p.clubId, 'scouting:offer_resolved', { status: 'accepted', playerId: player.id });

  return ok({ status: 'accepted', kind: 'free_agent' });
}

async function executeAiClubTransfer(tx, p, player, finalFeeEurK) {
  // 1. Debit fee
  await economy.debit(tx, p.clubId, finalFeeEurK, 'transfer_market_operational');
  // 2. Credit seller club
  await economy.credit(tx, player.currentClubId, finalFeeEurK, 'transfer_market_operational');
  // 3. Update player
  await playerRepo.updateClub(tx, player.id, p.clubId, p.wageOfferEurKWeek, p.contractWeeks);
  // 4. Cascade event
  await cascadeEngine.emitEvent(tx, 'player.transferred', {
    playerId: player.id, fromClubId: player.currentClubId, toClubId: p.clubId, feeEurK: finalFeeEurK,
  });
  // 5. Realtime broadcast
  await realtime.broadcast(p.clubId, 'scouting:offer_resolved', { status: 'accepted', playerId: player.id });
  return ok({ status: 'accepted', kind: 'ai_club' });
}

async function recordRejection(tx, playerId, buyerClubId, windowId, reason) {
  await repo.insertRejection(tx, { playerId, buyerClubId, windowId, reason });
}

async function computeAiNeedFactor(tx, clubId: string, position: string): Promise<number> {
  // Simple model: 1.0 if club has < 2 players at this position, 0.0 if has >= 3
  const count = await playerRepo.countAtPosition(tx, clubId, position);
  if (count < 2) return 1.0;
  if (count < 3) return 0.5;
  return 0.0;
}
```

## Out of Scope

- AI club rotation worker (story 006)
- UI (story 007)
- Counter-offer timeout/auto-expire (handled in story 004 tick)

## Acceptance Criteria

1. `makeOffer` for free agent with acceptable wage → transfer executes, player.currentClub updated
2. `makeOffer` for free agent with too-low wage → rejection recorded, return `status: 'rejected'`
3. `makeOffer` for AI club with high fee → accepted, fee debited from buyer + credited to seller
4. `makeOffer` for AI club with mid fee (between hard reject and accept threshold) → returns `status: 'countered'`, counter saved in DB
5. `makeOffer` for AI club with low fee → hard reject, rejection recorded
6. `acceptCounterOffer` → executes transfer at counter price
7. `acceptCounterOffer` with insufficient balance → returns `err('INSUFFICIENT_BALANCE')`
8. `makeOffer` after MAX_BIDS_PER_PLAYER bids → returns `err('MAX_BIDS_REACHED')`
9. `makeOffer` when window closed → returns `err('WINDOW_CLOSED')`
10. `makeOffer` after player rejected this window → returns `err('PLAYER_REJECTED_THIS_WINDOW')`
11. Free agent transfer: fee NOT debited (free)
12. AI transfer: both buyer debited AND seller credited (matching amounts)
13. Cascade event emitted on every successful transfer
14. Realtime broadcast emitted to buyer's club
15. Bid number incremented per bid (1, 2, 3...)
16. Race: 2 buyers offer for same player → DB lock ensures one wins; second fails with `PLAYER_GONE` (after first executes)

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/scouting-offer-service.test.ts` (real DB):

- Setup: 2 clubs (buyer + AI seller), open window, player with known transferValue
- Cover ACs 1-16
- Mock cascadeEngine.emitEvent, realtime.broadcast, possibly economy if not yet wired
- Race condition test (AC 16): use `Promise.all` with 2 simultaneous makeOffer calls

## Dependencies

- **Upstream**: 001 (schema), 002 (types), 003 (F2 + F3), 004 (scout state for visibility prereq)
- **Downstream**: 006 (AI rotation creates AI club bargain factors that offer flow consumes), 007 (UI calls service)

## Estimate

**1.5 days.** Two flows + counter-offer state + race handling.

## Notes / Gotchas

- The counter-offer expiration is handled by `tickResolvePendingScouts`-style logic in story 004's tick — extend it to also expire `countered` offers older than `COUNTER_OFFER_TIMEOUT_WEEKS`.
- Race condition (AC 16): use Postgres `SELECT FOR UPDATE` on `players.id` row during offer resolution. If 2 transactions race, second waits for first's commit, then sees `currentClubId` already changed and rolls back with PLAYER_GONE.
- `computeAiNeedFactor` is a simple stub. v1.2+ may consider formation, age curve, injury status. For v1.1, position count is sufficient.
- "free agent" means `currentClubId === null`. Verify this matches player-management.md's representation; if free agents are stored with a sentinel club ID, adjust.
- Future v1.2+: agent intermediary fees (5-10% commission on transfers). Not in scope.

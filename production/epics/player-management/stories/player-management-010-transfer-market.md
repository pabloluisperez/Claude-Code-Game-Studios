---
Story: PLAYER-MANAGEMENT-010
Status: Complete
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-PM-010 (AC-PM-18, AC-PM-19 — transfer market buy/sell within windows)
Governing ADR: ADR-016 (Player Lifecycle), ADR-015 (event system — transfer_window_open/close)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/player-management/transfer-market.test.ts
---

# Story 010: Transfer Market Integration (Buy/Sell within Transfer Windows)

> **Epic**: player-management
> **Layer**: Core
> **Type**: Integration
> **Estimate**: 1.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-010` — manager can buy/sell players within transfer windows. Offer ≥ transfer_value × 0.9 → accepted. Transfer windows are CalendarEvents from event-system.

**ADR Governing Implementation**: ADR-016 + ADR-015 (EventDecisionPayload for TransferOffer)
**ADR Decision Summary**: The market operates only inside `transfer_window_open`/`transfer_window_close` calendar events. No multi-round negotiation in MVP. Buy: manager offers, if ≥ threshold → club_id changes + balance debited. Sell: AI clubs make offers as STOP events → manager accepts/declines.

**Control Manifest Rules (Core layer)**:
- Required: Cross-module DB access forbidden — only economy module writes to `balance_eur_k`; player-management writes to `players.clubId`
- Forbidden: transfer operations outside event window (enforce in route validation)

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-18**: With transfer_window open and AI player transfer_value=10 €K: manager offers 9.0 €K (≥ 10×0.9=9.0) → accepted. `player.clubId` updated to manager's clubId. `balance_eur_k -= 9.0`. Contract activates.
- [ ] **AC-PM-18** (rejection case): offer 8.9 €K (< threshold) → rejected with reason `'offer_below_threshold'`.
- [ ] **AC-PM-19**: Attempt buy outside transfer window → rejected with error `'market_closed'`.
- [ ] Sell: when AI makes offer ≥ player.transfer_value × 0.9 and manager accepts → `player.clubId` = AI club id, `balance_eur_k += offer_amount`.
- [ ] Manager can set `sellingPrice` on own player; AI clubs generate offers at a random multiple of transfer_value (in range [0.8, 1.1] × transfer_value).
- [ ] `transferPlayer(tx, args)` is wrapped in a Drizzle transaction — if balance debit fails, player club assignment also rolls back.
- [ ] All operations run inside a Drizzle transaction passed from the caller.

## Implementation Notes

File: `apps/api/src/modules/players/transfer-service.ts`

```typescript
export async function buyPlayer(tx, args: {
  playthroughId: string; buyingClubId: string;
  playerId: string; offerEurK: number;
  transferWindowOpen: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string }> { ... }
```

Calls PlayersRepo (from story 002) inside the transaction. Calls economy module for balance debit.

## Out of Scope

- Multi-round negotiation (v1.1+)
- Scout-driven player discovery (staff-system epic)
- Loan operations (v1.1+)

## QA Test Cases

- **AC-1**: Buy with offer=9.0, transfer_value=10 → accepted; player clubId updated (AC-PM-18)
- **AC-2**: Buy with offer=8.9, transfer_value=10 → rejected 'offer_below_threshold'
- **AC-3**: Buy outside window → rejected 'market_closed' (AC-PM-19)
- **AC-4**: Transaction rollback: simulate balance debit failure → player clubId unchanged
- **AC-5**: Sell: manager sets sellingPrice=10, AI offers 10.5 (≥ threshold) → manager accepts → balance += 10.5; player moves to AI club

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/player-management/transfer-market.test.ts` against real Postgres + economy module (port 5433)

## Dependencies

- Depends on: Story 002 (PlayersRepo), Story 009 (transfer_value formula), economy epic (balance_eur_k writes)
- Unlocks: None critical in MVP

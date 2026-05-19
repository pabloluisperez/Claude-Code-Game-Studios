---
Story: EVENT-SYSTEM-003
Status: Ready
Type: Integration
Governing ADR: ADR-015 (EventDecisionPayload union)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/event-system/handlers.test.ts
---

# Story 003: Per-Type Event Handlers

> **Epic**: event-system | **Layer**: Core | **Type**: Integration | **Estimate**: 2d

## Scope
Handlers per EventDecisionPayload variant (ADR-015):
- `SponsorOfferPayload` → economy.signSponsor
- `TransferOfferPayload` → players.transfer
- `ContractRenewalOfferPayload` → players.contract
- `ScandalEventPayload` → economy.cancelSponsors + cascade trigger
- `MatchCalendarEventPayload` → enqueue match worker
- `season_end` → league.processSeasonEnd
- `season_start` → league.generateRoundRobin
- `transfer_window_open/close` → players.transferMarketOpen flag

Each handler:
- Accepts the decision payload + applies the resolution
- Returns the side-effect summary (events emitted, state changed)
- Idempotent

## ACs
- [ ] Each variant has a handler
- [ ] Handlers route through Drizzle transactions
- [ ] Default decision applied on timeout

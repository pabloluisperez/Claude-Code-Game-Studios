# 25-4 — Offer service (free agent + AI auction wire-up)

**Sprint:** 25 | **Owner:** web-backend | **Est:** 1.5d | **Dependencies:** 25-2, 25-3 | **Status:** Complete (2026-05-29)

## Problem

`makeOffer` in `scouting-market/service.ts` is implemented with:
- F2 free-agent acceptance (wage-based)
- F3 AI club auction (fee-based with counter-offer)
- Scout gating (no scout = open market only)
- Expiring contract handling (≤8 weeks = Bosman)
- Balance check (fee + 4 weeks wages upfront)
- `transferListed` premium (1.4× for non-transfer-listed)
- Scout bargain factor discounts (T3 → 0.85×)

However, these are not tested and not wired to the frontend.

## Acceptance Criteria

- [ ] POST `/api/scouting/offer` route handler working (already exists in routes.ts)
- [ ] Unit tests for `makeOffer` covering:
  - Free agent acceptance (wage ≥ expectation → accepted)
  - Free agent rejection (wage < desperate threshold → rejected)
  - AI club acceptance (fee ≥ threshold)
  - AI club counter-offer (fee in middle range)
  - AI club hard reject (fee too low)
  - Expired contract → Bosman (no fee, wage only)
  - No scout director → NO_SCOUT error
  - Insufficient balance → INSUFFICIENT_BALANCE
  - Duplicate offer → ALREADY_PENDING_OFFER
- [ ] Frontend action calls POST `/api/scouting/offer`
- [ ] Counter-offer response UI shows counter fee + accept/reject options
- [ ] Offer outcome rendered in /scouting UI

## Implementation Notes

### Already implemented (service layer)
- `makeOffer` function with all logic
- `freeAgentAcceptance` in `@smt/shared/sim/scouting/free-agent.ts`
- `aiClubAcceptance` in `@smt/shared/sim/scouting/auction.ts`
- Route handler `POST /api/scouting/offer` with zod validation
- `errorStatus` mapping for HTTP codes

### What's missing
1. **Unit tests** — zero tests for `makeOffer`
2. **Frontend wire-up** — the /scouting UI needs to call the offer endpoint
3. **Counter-offer UI** — when AI responds with `kind: 'counter'`, show the
   counter fee with accept/reject buttons
4. **Incoming offers** — the `respondToIncomingOffer` + `toggleTransferListed`
   need frontend exposure

### Key files
- `apps/api/src/modules/scouting-market/service.ts` — makeOffer (done)
- `apps/api/src/modules/scouting-market/routes.ts` — route handler (done)
- `apps/web/src/routes/scouting/+page.server.ts` — frontend action (needs wire-up)
- `packages/shared/src/sim/scouting/auction.ts` — AI acceptance (done)
- `packages/shared/src/sim/scouting/free-agent.ts` — FA acceptance (done)

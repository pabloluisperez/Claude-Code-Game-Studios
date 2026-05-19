---
Story: ECONOMY-002
Status: Complete
Type: Logic
GDD Requirement: TR-ECO-002 (weekly revenue: ticket × attendance + sponsors + TV rights tier)
Governing ADR: ADR-014
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/economy/revenue.test.ts
---

# Story 002: Weekly Revenue Calculator

> **Epic**: economy | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5d

## Scope
File `packages/shared/src/sim/economy/revenue.ts`:
- `computeMatchDayRevenue({ ticketPrice, attendance, stadiumCapacity })` → euros
- `computeSponsorIncome(activeSponsors[])` → sum of weekly_eur_k
- `computeTVRights(divisionTier)` → fixed by tier (D1=8 €K/w, D2=3 €K/w MVP)
- `computeWeeklyRevenue(args)` returns totals + per-category breakdown

## ACs
- [ ] AC-ECO-13: match_day_revenue = round(attendance × ticketPrice) with ticketPrice bounded by `MAX_TICKET_EUR`
- [ ] Sponsor sum aggregates only 'active' sponsors
- [ ] TV rights deterministic per division tier
- [ ] Pure function (no DB, no rng)

## Dependencies
- Pure, no upstream

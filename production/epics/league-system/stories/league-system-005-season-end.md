---
Story: LEAGUE-SYSTEM-005
Status: Ready
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-LGS-005 (processSeasonEnd — 3 up / 3 down + new season)
Governing ADR: ADR-011
Control Manifest: 2026-05-19
Test Evidence: tests/integration/league-system/season-end.test.ts
---

# Story 005: processSeasonEnd — Promotion/Relegation + New Season

> **Epic**: league-system | **Layer**: Core | **Type**: Integration | **Estimate**: 1.5 days

## Context

At season_end (week 38), atomically:
1. Mark current season `status='completed'`.
2. Top 3 clubs of D2 promote to D1; bottom 3 of D1 relegate to D2.
3. Create new season row in each division.
4. Generate new fixtures via `generateRoundRobin` (Story 002).
5. Reset standings for new season.

## Acceptance Criteria

*From GDD AC-LGS-23..24:*

- [ ] **AC-LGS-23**: After season_end, top 3 D2 clubs have `divisionId` updated to D1; bottom 3 D1 clubs to D2.
- [ ] **AC-LGS-24**: Player contracts on relegated club are flagged for renegotiation (per player-management contract pipeline — emit ContractRenewalOffer events).
- [ ] New seasons created with `year_start = previous + 1`.
- [ ] New fixtures generated (380 per division).
- [ ] Old season's `fixtures` and `standings` rows are preserved (historical record).
- [ ] All operations in a single Drizzle transaction — partial failure rolls back.

## Implementation Notes

File: `apps/api/src/modules/season/season-end-service.ts`

```typescript
export async function processSeasonEnd(
  tx, playthroughId: string, seasonId: string
): Promise<{
  promoted: string[]; // club ids D2 → D1
  relegated: string[]; // D1 → D2
  newSeasonIds: { d1: string; d2: string };
}>;
```

## QA Test Cases (Integration)

- Promotion/relegation: 3 clubs swap divisions
- Contract renewal events emitted for relegated clubs' players
- New season rows + 380 fixtures per division created
- Old season preserved as historical record
- Transaction rollback on failure

## Dependencies

- Upstream: Story 002 (generateRoundRobin), Story 003 (standings sort), Story 004 (final standings), PM-011 (contract renewal events)
- Downstream: Sprint advance() flow (calls processSeasonEnd at season boundary)

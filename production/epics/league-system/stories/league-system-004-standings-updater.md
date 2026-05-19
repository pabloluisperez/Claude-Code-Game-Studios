---
Story: LEAGUE-SYSTEM-004
Status: Complete (code-complete; integration tests deferred to env with DB seeded fixtures)
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-LGS-004 (applyMatchToStandings post-match transactional update)
Governing ADR: ADR-011
Control Manifest: 2026-05-19
Test Evidence: tests/integration/league-system/standings-updater.test.ts
---

# Story 004: applyMatchToStandings — Post-Match Transactional Update

> **Epic**: league-system | **Layer**: Core | **Type**: Integration | **Estimate**: 1 day

## Context

After each MatchOutcome (from match-sim), update both clubs' `standings` rows atomically: points (3 for win, 1 for draw, 0 for loss), played +1, won/drawn/lost +1, goals_for += own score, goals_against += rival score.

## Acceptance Criteria

*From GDD AC-LGS-11..14:*

- [ ] **AC-LGS-11**: Home win 2-1 → home +3 points, played+1, won+1, goalsFor+2, goalsAgainst+1. Away: played+1, lost+1, goalsFor+1, goalsAgainst+2.
- [ ] **AC-LGS-12**: 1-1 draw → both +1 point, drawn+1.
- [ ] **AC-LGS-13**: Forfeit 0-3 (AC-PM-11) → applied identically.
- [ ] **AC-LGS-14**: F4 ceiling — degenerate scores don't break atomicity (clamp at sane values).
- [ ] Idempotency: applying twice with same fixture_id → no double-update (skip if `fixture.status === 'played'`).
- [ ] Transactional: all updates in a single Drizzle tx; failure rolls back both rows.

## Implementation Notes

File: `apps/api/src/modules/league/standings-service.ts`

```typescript
export async function applyMatchToStandings(
  tx, fixtureId: string, outcome: MatchOutcome
): Promise<void>;
```

## QA Test Cases (Integration)

- Win: both rows updated correctly
- Draw: both +1 point
- Loss: rival side check
- Idempotency: second call no-op
- Transaction rollback on simulated failure

## Dependencies

- Upstream: Story 001 (standings table), Story 003 (sort logic for re-sort after update)
- Downstream: Story 005 (processSeasonEnd reads final standings)

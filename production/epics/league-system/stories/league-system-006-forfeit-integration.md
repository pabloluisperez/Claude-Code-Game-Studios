---
Story: LEAGUE-SYSTEM-006
Status: Ready
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-LGS-006 (Forfeit handler at fixture-load time; canonical 63% threshold)
Governing ADR: ADR-011, ADR-016 (canonical FORFEIT_SQUAD_PCT_THRESHOLD)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/league-system/forfeit-integration.test.ts
---

# Story 006: Forfeit Handler Integration with Match-Sim

> **Epic**: league-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5 days

## Context

At fixture load (before passing to match-sim), check `squad_available_pct` for each side. If ≤63%: synthesize forfeit MatchOutcome (0-3) and apply to standings (no simulation runs).

The forfeit guard is implemented in match-sim (already done in MATCH-SIM-011). This story wires the league flow to use the canonical rule.

## Acceptance Criteria

*From GDD AC-LGS-15..18:*

- [ ] **AC-LGS-15**: `loadFixtureForMatch(fixtureId)` checks both clubs via `getSquadAvailabilityCount`.
- [ ] **AC-LGS-16**: If home pct ≤63 → home forfeits (0-3 away win); if away pct ≤63 → away forfeits (3-0 home win). If both ≤63: home forfeits (precedence: away-favor).
- [ ] **AC-LGS-17**: Forfeit applies `mpi_delta=-30` to the forfeiting club's playthrough WorldState (via cascade-engine PlayerDecision).
- [ ] **AC-LGS-18**: Forfeit emits `forfeit_recorded` calendar_event (event-system).
- [ ] Canonical denominator: `SQUAD_REGISTERED_SIZE=25` per league-system Rule 8.

## Implementation Notes

File: `apps/api/src/modules/league/fixture-loader.ts`

```typescript
export async function loadFixtureForMatch(
  tx, fixtureId: string
): Promise<{
  matchInput: MatchInput;       // standard match-sim input
  forfeit?: MatchOutcome;        // populated if forfeit detected; match-sim is bypassed
}>;
```

## QA Test Cases (Integration)

- Home squad=10 (40% pct) → forfeit, away wins 0-3
- Away squad=15 (60% pct) → forfeit, home wins 3-0
- Both squads ≤63% → home forfeits (deterministic precedence)
- Both squads ≥64% → normal match-sim called, no forfeit

## Dependencies

- Upstream: Story 001 (fixtures table), PM-006 (squad_available_pct), MATCH-SIM-011 (forfeit synthesis already done)
- Downstream: advance() match-day flow

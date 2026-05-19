---
Story: LEAGUE-SYSTEM-002
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-LGS-002 (generateRoundRobin — 20 clubs × 38 matchdays × 10 matches)
Governing ADR: ADR-011, ADR-002 (determinism)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/league-system/round-robin.test.ts
---

# Story 002: generateRoundRobin — Deterministic Fixture Generation

> **Epic**: league-system | **Layer**: Core | **Type**: Logic | **Estimate**: 1 day

## Context

Pure function in `packages/shared/src/sim/league-fixtures.ts`. Per ADR-011 + ADR-002:
20 clubs → 38 matchdays × 10 matches each → 380 fixtures (double round-robin).
Same `clubIds` order → identical fixture list (deterministic).

## Acceptance Criteria

*From GDD `design/gdd/league-system.md` AC-LGS-01..06:*

- [ ] **AC-LGS-01**: `generateRoundRobin(['c1', ..., 'c20'], startWeek=1)` returns 380 fixtures.
- [ ] **AC-LGS-02**: Each pair of clubs plays exactly twice — once at home, once away. Verify via pairs map.
- [ ] **AC-LGS-03**: No fixture has the same club as home and away (self-match impossible).
- [ ] **AC-LGS-04**: Matches distributed across exactly 38 matchdays, with exactly 10 matches per matchday.
- [ ] **AC-LGS-05**: Determinism — calling twice with same inputs → identical output.
- [ ] **AC-LGS-06**: With 16 clubs (alt size), returns 240 fixtures (30 matchdays × 8 matches).

## Implementation Notes

Standard round-robin scheduling (circle method). One club fixed at index 0; rest rotated. Each round (matchday) has N/2 matches. Second leg = first leg with home/away flipped.

```typescript
export function generateRoundRobin(args: {
  clubIds: readonly string[];
  startWeek: number;
}): readonly FixtureDraft[];

interface FixtureDraft {
  homeClubId: string;
  awayClubId: string;
  week: number;
  matchday: number; // 1..38
}
```

## QA Test Cases

- 380-fixture count with 20 clubs (AC-LGS-01)
- Each pair × 2, home/away flip (AC-LGS-02)
- No self-match (AC-LGS-03)
- 10 matches per matchday (AC-LGS-04)
- Determinism: 2 calls → identical (AC-LGS-05)
- 16-club variant → 240 fixtures (AC-LGS-06)

## Dependencies

- Upstream: None (pure)
- Downstream: Story 003 (applyMatchToStandings consumes fixtures), Story 005 (processSeasonEnd inserts new round-robin)

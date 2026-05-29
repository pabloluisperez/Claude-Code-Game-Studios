# 25-7 — `tickAllClubsWithActiveUpgrades` wire-up al advance pipeline

**Sprint:** 25 | **Owner:** web-backend | **Est:** 0.5d | **Dependencies:** — | **Status:** Complete (2026-05-29)

## Problem

`tickAllClubsWithActiveUpgrades` in `apps/api/src/modules/stadium-upgrades/tier-evaluator.ts`
is fully implemented: queries clubs with `in_progress` stadium items,
calls `tickClub` on each. However, this function is never called by
any scheduling mechanism.

The advance pipeline lives in `apps/web/src/lib/server/advance-orchestrator.ts`
(`runAdvanceTickFull`). The stadium upgrade tick needs to be integrated
into this pipeline.

## Acceptance Criteria

- [ ] `tickAllClubsWithActiveUpgrades` called within the advance tick pipeline
- [ ] Stadium installments are charged per week during active obras
- [ ] obra completion triggers tier-up evaluation + worldState counter increment
- [ ] Socket.IO emit on obra completion (if socket system active)
- [ | No regression in existing advance tick behavior
- [ | Test: stadium obra progresses week-by-week through advance tick

## Implementation Notes

### Integration point
In `runAdvanceTickFull` (advance-orchestrator.ts), after the core economy
tick and before season rollover, call:

```ts
const { tickAllClubsWithActiveUpgrades } =
  await import('@smt/api/modules/stadium-upgrades/tier-evaluator.js');
const { ticked } = await tickAllClubsWithActiveUpgrades();
```

### Cross-app boundary
The README in `apps/api/src/modules/advance/` documents this as deferred
cross-app architectural debt. For v1.2 Sprint 25, a direct import is
acceptable — the full extraction to a shared package is planned for Sprint 26+.

### Alternative: server-side schedule
If `registerScheduledJobs` in `apps/api/src/jobs/queues.ts` has a daily
cron trigger, the stadium tick could be registered there instead of
tied to the advance pipeline. This would make it work even when the
player doesn't trigger a tick manually.

### Key files
- `apps/web/src/lib/server/advance-orchestrator.ts` — main advance pipeline
- `apps/api/src/modules/stadium-upgrades/tier-evaluator.ts` — tickAllClubsWithActiveUpgrades
- `apps/api/src/modules/stadium-upgrades/service.ts` — tickClub
- `apps/api/src/jobs/queues.ts` — scheduled jobs (alternative integration)

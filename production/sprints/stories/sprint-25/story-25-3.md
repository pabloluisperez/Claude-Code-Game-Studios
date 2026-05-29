# 25-3 — Market windows lifecycle (transfer_window_open event)

**Sprint:** 25 | **Owner:** web-backend | **Est:** 1.0d | **Dependencies:** 25-2 | **Status:** Pending

## Problem

`scheduleSeasonEvents` in `event-system/service.ts` already creates
`transfer_window_open` and `transfer_window_close` events at the correct
weeks. However, these events are never acted upon — there is no handler
that sets a `transferWindowOpen` flag in the advance pipeline, so the
scouting market is effectively always open or always closed depending
on hardcoded defaults.

## Acceptance Criteria

- [ ] Event-system resolves `transfer_window_open` → sets `worldState.transferWindowOpen = true`
- [ ] Event-system resolves `transfer_window_close` → sets `worldState.transferWindowOpen = false`
- [ ] Advance pipeline processes pending events before market operations
- [ ] `worldSnapshots.worldState` includes `transferWindowOpen` field
- [ ] Unit tests for event resolution → state transition
- [ ] Transfer window opens/closes correctly in a simulated season

## Implementation Notes

### Event resolution
The `resolveEvent` function in `@smt/shared` dispatches event types to
pure resolver functions. Need to add:

```ts
// In @smt/shared sim/event-system
export function resolveTransferWindow(payload, choice, ctx): ResolutionResult {
  return {
    deltas: { transferWindowOpen: choice === 'open' },
    // or use worldState key
    worldStateDeltas: { transferWindowOpen: true },
  };
}
```

### World state integration
The advance pipeline needs to:
1. Read pending events for the current week
2. Resolve them (autoResolveDefault for NOTIFY priority)
3. Apply the `transferWindowOpen` state to the latest world snapshot

### Where to wire in
The `runAdvanceTickCore` / `runAdvanceTickFull` in
`apps/web/src/lib/server/advance-orchestrator.ts` calls
`resolvePendingEvents` (if it exists) or needs to be extended.

### Key files
- `packages/shared/src/sim/event-system/` — resolver functions
- `apps/api/src/modules/event-system/service.ts` — resolveEventById
- `apps/web/src/lib/server/advance-orchestrator.ts` — advance pipeline
- `apps/api/src/modules/scouting-market/service.ts` — buyPlayer checks transferWindowOpen

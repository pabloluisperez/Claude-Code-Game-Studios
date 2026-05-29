# 25-5 — AI club rotation BullMQ worker

**Sprint:** 25 | **Owner:** web-backend | **Est:** 1.5d | **Dependencies:** 25-3, 25-4 | **Status:** Complete (2026-05-29)

## Problem

AI clubs need to make offers during transfer windows. Currently, the
`makeOffer` service exists but is only called from the player-facing
`POST /api/scouting/offer` route. AI clubs never make offers
autonomously.

A BullMQ worker is needed that:
1. Runs on a schedule (once per transfer window, or per week)
2. Iterates all AI clubs
3. For each AI club, evaluates free agents and market players
4. Makes offers via `makeOffer` (deterministic, seeded)
5. Is idempotent (same input → same output)

## Acceptance Criteria

- [ ] BullMQ worker `ai-rotation` exists at `apps/api/src/workers/ai-rotation-worker.ts`
- [ ] Worker processes each AI club's rotation (uses F2/F3 logic via `makeOffer`)
- [ ] Deterministic: same seed + same world state → same offers every run
- [ ] Idempotent: re-running during the same window doesn't duplicate offers
- [ ] Worker registered in `apps/api/src/jobs/queues.ts` or dedicated queue file
- [ ] Worker handles errors gracefully (one club failure doesn't stop others)
- [ ] Unit tests for worker behavior (mocked offers)
- [ ] Only processes clubs that are AI-controlled (not the player's club)

## Implementation Notes

### Worker design
```ts
// apps/api/src/workers/ai-rotation-worker.ts
import { Worker } from 'bullmq';
import { makeOffer } from '../modules/scouting-market/service.js';

async function processAIClub(clubId: string, week: number) {
  // 1. Get AI club's needs (what positions to fill)
  // 2. Query available players (free agents + listed)
  // 3. Call makeOffer for top candidates
  // 4. Track which players were offered to this club this window
}
```

### Integration
- Use existing `seasonTickQueue` or create `aiRotationQueue`
- Trigger during advance tick or on transfer window open event
- Seed PRNG with `(playthroughId, week, clubId)` for determinism

### Key files
- `apps/api/src/jobs/queues.ts` — BullMQ queue setup (has seasonTickQueue, matchQueue)
- `apps/api/src/workers/match-worker.ts` — existing worker pattern to follow
- `apps/api/src/modules/scouting-market/service.ts` — makeOffer
- `apps/api/src/modules/advance/` — advance pipeline integration point

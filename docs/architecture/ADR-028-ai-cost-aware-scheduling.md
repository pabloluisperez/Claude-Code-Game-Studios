# ADR-028: AI Cost-Aware Scheduling

## Status

Proposed (v1.2 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | AI / Operations |
| **Knowledge Risk** | LOW |
| **References Consulted** | narrative-ai.md §3.1, §4.1, §5.6, §7; ADR-025 (deployment); ADR-027 (safety pipeline) |

## Context

llama.cpp self-hosted has near-zero marginal cost per inference, but:

1. Inference is serialized — a queue of 10 requests blocks the system
2. Hardware capacity is finite — sustained high QPS degrades latency
3. Power/CPU usage in production = real cost (especially if cloud-hosted)
4. Some event types deserve AI; others are wasteful

We need a scheduler that prioritizes the events worth AI, caches
aggressively, and degrades gracefully when capacity is exhausted.

## Decision

### D1. Event-type whitelist (per narrative-ai.md §3.1)

AI is dispatched ONLY for:

- Staff messages tier 3 (the narrative tier)
- Press articles tied to specific events (derby, ascenso, descenso,
  copa final, hito histórico)
- Mayor calls (career milestones from manager-rpg)

Everything else (T1, T2, ambient flavor, headline labels, etc.) stays
template-based.

### D2. Daily budget cap

```typescript
AI_DAILY_BUDGET_CALLS: number = 10000   // soft cap, per day in UTC
```

Counter persisted in Redis (`narrative_ai:budget:YYYY-MM-DD` integer).
INCR on every dispatch.

When `counter > budget`:

- Subsequent calls fallback to template
- Sentry alert with `severity: warning`
- Continue until counter resets next UTC day at 00:00

### D3. Cache-first dispatch

Before calling llama.cpp, check Redis cache (per ADR-026 + narrative-ai.md
§3.6). Cache key:

```
hash(prompt + contextJsonSorted + temperature) → output
```

Cache hits don't consume budget.

### D4. Per-event-type concurrency cap

Even with cache, parallel cache misses can saturate the model.

```typescript
const CONCURRENCY_CAPS = {
  'staff-T3': 4,      // common, parallelize moderately
  'press': 2,         // rare, longer outputs
  'mayor-call': 1,    // very rare, longest outputs
}
```

Implemented as a per-key BullMQ queue or in-memory semaphore. If cap is
reached, requests queue (max queue depth 20 per type, after which:
fallback to template + Sentry warn).

### D5. Time-of-day modulation

Optional optimization: during low-traffic hours (e.g., 03:00-06:00 UTC),
allow:

- 50% higher temperature (more variety)
- 1.5x normal token budget (richer outputs)

This is anti-flat-feeling — early adopters who play late get slightly
richer experience without affecting peak hours.

Off by default in v1.2 launch. Toggle: `AI_TIME_MODULATION_ENABLED`.

### D6. Backpressure feedback

If the llama.cpp queue depth grows beyond a threshold (e.g., > 10):

- New requests fallback to template immediately (no queueing)
- Sentry alert
- Auto-resolve when queue drops below threshold

### D7. Cost telemetry

Per request, log:

```
narrative_ai.request {
  event_type, prompt_id, tokens_in, tokens_out, latency_ms,
  cache_hit: boolean, dispatched: 'ai' | 'template-fallback',
  reject_reason?: string
}
```

Aggregated dashboards:

- AI calls / day (vs budget)
- Cache hit rate
- p50/p95 latency per event type
- Fallback rate (template usage when AI was eligible)

### D8. Per-playthrough fairness

Optional: rate-limit per-user. A single user can't exhaust the global
budget by spamming advance.

```typescript
const PER_USER_AI_CALLS_PER_HOUR = 100
```

Tracked in Redis (`narrative_ai:user:{userId}:hour:YYYY-MM-DD-HH`). When
exceeded, that user's AI calls fallback to template for the remainder of
the hour. Other users unaffected.

### D9. Off-by-default for new accounts

For the first 5 sessions, AI is off (templates only). Rationale: new
users still figuring out the game; flavor text variety isn't the priority,
and we save AI capacity for established players.

This is a knob, can be turned off if data shows it's anti-engaging.

## Alternatives Considered

### A1. Always-on AI (no budget)

REJECTED — risks runaway cost + latency degradation under load. Budget
cap is cheap insurance.

### A2. AI for everything

REJECTED — flavor text and T1 staff messages are fine as templates; no
narrative gain, just cost.

### A3. Token-based budget (sum of tokens, not call count)

CONSIDERED — more accurate per-cost, but harder to predict for users.
Call count is a useful proxy. Revisit in v1.3 if cost varies wildly.

## Consequences

### Positive

- Predictable cost ceiling
- Cache hit rate captured + optimizable
- Backpressure prevents cascading failures under spike
- Fair allocation across users

### Negative

- Some "eligible" events fall back to templates when over budget — UX inconsistency
- Per-user rate limits could feel arbitrary

### Mitigations

- Budget set generously (10k calls/day for v1.2 expected DAU)
- Cache reduces real ops by ~30-50% based on similar systems
- Cost telemetry catches misalignment early; tune budget upward if needed

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.2 #31 | Redis counter scaffolding + budget check |
| v1.2 #33 | Per-event-type concurrency caps |
| v1.2 #36 | Backpressure feedback + Sentry alerts |
| v1.2 #37 | Cost telemetry dashboards |

## References

- narrative-ai.md §3.1, §4.1, §5.6, §7
- ADR-025 (deployment)
- ADR-026 (context serialization)
- ADR-027 (safety pipeline)

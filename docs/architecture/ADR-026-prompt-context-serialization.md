# ADR-026: Prompt Context Serialization

## Status

Superseded by ADR-032 (2026-05-29)

> **Superseded.** Prompt-context serialization is moot without a runtime LLM.
> Pillar D is now a deterministic template generator (ADR-032); narrative
> "context" is plain `variables` passed to `render()`, not a serialized prompt.
> Never built past Proposed. Retained for historical context.

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | AI / Privacy |
| **Knowledge Risk** | LOW |
| **References Consulted** | narrative-ai.md §3.2-3.4, Privacy Policy §4, ADR-025 |

## Context

The narrative AI prompt requires a JSON context blob serialized from
WorldState + event metadata + manager profile. Three concerns drive this
ADR:

1. **Privacy**: NEVER leak PII (email, session token, password)
2. **Token budget**: keep context under 2k tokens to leave room for
   instruction + few-shot + completion
3. **Determinism**: same context → same prompt → (with cache) same output

## Decision

### D1. Single pure function `serializeContext`

```
function serializeContext(
  world: WorldState,
  event: EventMetadata,
  options: { maxTokens?: number }
): ContextJSON
```

Pure, deterministic, no I/O. Lives in `apps/api/src/modules/narrative-ai/context.ts`.

### D2. Whitelist, not blacklist

Only the fields explicitly listed pass through. Anything new added later
must be reviewed for privacy before joining the whitelist.

Whitelist v1.2:

```typescript
ContextJSON = {
  // Manager (in-game ficticio)
  manager: {
    name: string,           // jugador-provided, sanitized (D3)
    prestige_tier: number,  // 1..4 from manager-rpg
    seasons_in_club: number,
  },

  // Club (in-game)
  club: {
    name: string,
    city: string,
    division: 'first' | 'second' | 'third' | 'fourth' | 'fifth',
    league_position: number | null,
    season_form_last_5: ('W'|'D'|'L')[],  // últimos 5 resultados
  },

  // World state (derivado)
  state: {
    week: number,
    season: number,
    finance_status: 'healthy' | 'at_risk' | 'crisis' | 'bankrupt',
    fan_momentum_bucket: 'low' | 'medium' | 'high',
    // NUNCA: raw numeric values for finance — sólo buckets
  },

  // Event-specific
  event: {
    type: string,  // 'staff-T3-injury', 'press-derby-win', etc.
    details: object,  // event-type-specific, validated per type
  },

  // Recent history (last 5 events)
  recent_events: Array<{ type: string; summary: string }>,
}
```

### D3. Sanitize jugador-provided strings

`manager.name` and `club.name` come from the user. They could contain
prompt injection attempts. Sanitization:

```typescript
function sanitize(s: string): string {
  return s
    .replace(/[\n\r\t]/g, ' ')           // collapse whitespace
    .replace(/\[INST\]|\[\/INST\]/gi, '') // strip instruction markers
    .replace(/<\|.*?\|>/g, '')            // strip special tokens
    .slice(0, 60)                          // truncate
    .trim()
}
```

Applied at serialization boundary, not at write boundary, so the original
field in DB stays intact (user can keep their name "weird" in-game).

### D4. NEVER include

Explicit deny list (these MUST NOT appear in any context):

- email
- passwordHash
- sessionToken
- session
- cookie
- authorization
- IP address
- user.id (UUID — internal only)
- raw stack traces
- raw monetary values (use buckets)
- exact birthdate (use age bracket if needed)

If a developer adds these by accident, the safety pipeline (ADR-027)
catches and rejects the prompt.

### D5. Token budget enforcement

After serialization, count tokens (use tiktoken or similar lightweight
counter). If > 2000 tokens:

1. Drop `recent_events[-1]` (oldest first), recount
2. Repeat until <= 2000 tokens
3. If still too big with `recent_events = []`, drop `event.details` fields
   beyond `type`
4. If still too big, raise error → fallback to template

### D6. Deterministic ordering

JSON object keys are sorted alphabetically before serialization. This
makes the cache key (hash of context) stable across runs.

```typescript
JSON.stringify(context, Object.keys(context).sort())
```

Recursive for nested objects.

## Alternatives Considered

### A1. Pass raw WorldState to AI

REJECTED — leaks too much, exceeds token budget, no privacy boundary.

### A2. Let prompt template decide what to include

REJECTED — error-prone, each template would reimplement field selection.
Single function ensures consistency.

### A3. Use embeddings instead of JSON

REJECTED for v1.2 — JSON is human-debuggable. Embeddings for v1.3+ if
context grows beyond practical token budgets.

## Consequences

### Positive

- One auditable function for privacy review
- Token budget enforced deterministically
- Cache stable
- Easy to extend (whitelist new fields with review)

### Negative

- Adding new context fields requires code change + privacy review
- AI loses some richness compared to "give it everything"

### Mitigations

- Privacy review is one-line PR diff per new field
- Few-shot examples + prompt design compensate for context limits

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.2 #32 | `serializeContext` + tests (whitelist + sanitize + token budget) |
| v1.2 #32 | Privacy review of v1.2 launch whitelist |
| v1.2 #33 | Integration with staff T3 dispatcher |

## References

- narrative-ai.md §3.2-3.4
- Privacy Policy §4 (what we promise not to share)
- ADR-025 (deployment)
- ADR-027 (safety pipeline downstream)

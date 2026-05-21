# ADR-027: AI Output Safety Pipeline

## Status

Proposed (v1.2 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | AI / Trust & Safety |
| **Knowledge Risk** | LOW (heuristics-based, no external services) |
| **References Consulted** | narrative-ai.md §3.5, §5.3, §5.4 |

## Context

LLM outputs can be: toxic (racist/violent/sexual), wrong language, gibberish,
or attempts to break out of role. Shipping any of these to players is a
trust-killer.

We need a deterministic pipeline that catches problematic outputs BEFORE
they reach the player AND learns from caught cases.

## Decision

### D1. Multi-stage validation pipeline

Each AI output passes through stages in order. First failure → reject +
fallback to template.

```
[1] LANGUAGE     — output must be in Spanish (ES)
[2] LENGTH       — output ≤ max_tokens × 1.1 (10% tolerance)
[3] FORMAT       — if prompt expected JSON, must parse; if markdown,
                   no forbidden tags (e.g., script)
[4] TOXICITY     — local blocklist of terms + heuristics
[5] ROLE-BREAK   — output doesn't reference the prompt, AI, mechanics,
                   or "as an AI language model"
[6] SAMPLE       — 1% of outputs persisted for manual audit
```

Stages 1-5 are blocking (reject). Stage 6 is observational.

### D2. Language check (Stage 1)

Use a lightweight language detector (e.g., `franc` or `cld3-asm`):

```
detectLanguage(output): ISO 639-3
```

Required: `spa`. If anything else → reject.

Edge: very short outputs (< 10 chars) auto-pass language check (detection
unreliable). Stage 4 still applies.

### D3. Length check (Stage 2)

Token-based, not character-based (so prompts with different token caps are
handled correctly).

```
tokens = countTokens(output)
if tokens > maxTokens * 1.1: reject
```

### D4. Format check (Stage 3)

Some prompts expect structured output. Per prompt:

- `output_format: 'plain'` — no validation
- `output_format: 'markdown'` — sanitize HTML, reject if contains `<script>`,
  iframe, link with `javascript:` scheme, or `<style>`
- `output_format: 'json'` — must `JSON.parse` successfully

### D5. Toxicity check (Stage 4)

Local blocklist approach (no external API for v1.2 — privacy + latency).

```typescript
const FORBIDDEN_PATTERNS = [
  // Racism (ES + EN)
  /\bnegrat[ao]s?\b/i, /\bmoros?\b/i, /\bsudac[ao]s?\b/i,
  // Slurs (additional list maintained in code review by writer agent)
  // Explicit violence
  /\b(viol(ar|aci[oó]n)|matar(la|lo))\b/i,
  // Sexual content (none expected in football management)
  /\b(porno|sexo expl[íi]cito)\b/i,
  // Suicide / self-harm
  /\b(suicid|matarme|auto-?l[ée]si)\w*/i,
]

function hasToxicContent(output: string): boolean {
  return FORBIDDEN_PATTERNS.some(re => re.test(output))
}
```

The list is maintained in `apps/api/src/modules/narrative-ai/safety/toxic-patterns.ts`.
Each addition requires writer + game-designer sign-off.

### D6. Role-break check (Stage 5)

Detect the model "breaking character":

```typescript
const ROLE_BREAK_PATTERNS = [
  /as an ai (language )?model/i,
  /como (un|una)? (ia|ai|asistente|modelo)/i,
  /\bdisclaim/i,
  /\b\[INST\]|\[\/INST\]/i,
  /\bmy training/i,
  /\bmis instrucciones/i,
]
```

These indicate the model is responding to the prompt as if it were a chat
assistant rather than staying in role.

### D7. Sample audit (Stage 6)

```typescript
if (sha256(outputId).hex.slice(0, 2) === '00') {
  // ~1/256 ≈ 0.4% (close enough to 1% target)
  await db.insert(ai_outputs).values({
    id: outputId,
    promptId,
    contextHash,
    output,
    createdAt: new Date(),
  })
}
```

Audit dashboard at `/admin/ai-outputs` (admin-only) lets the team review
recent samples. Bad outputs found here inform the next FORBIDDEN_PATTERNS
update.

### D8. Metrics + alerts

For every output:

- Emit metric `narrative_ai.output.{stage}.{verdict}` where verdict is
  `pass` or `reject`.
- Sentry alert if `reject_total / output_total > 1%` over rolling 24h.

### D9. Fallback graceful

When pipeline rejects:

1. Log to Sentry with the reject reason + stage
2. Substitute the template v1.1 output for the same `eventType`
3. Player NEVER sees an empty message

### D10. Audit table schema

```sql
CREATE TABLE ai_outputs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id   text NOT NULL,
  context_hash text NOT NULL,
  output      text NOT NULL,
  reject_reason text,             -- NULL if passed
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamp with time zone,
  review_verdict text             -- 'ok' | 'bad' | 'borderline'
);

CREATE INDEX idx_ai_outputs_unreviewed
  ON ai_outputs(reject_reason, reviewed_at)
  WHERE reviewed_at IS NULL;
```

Retention: 90 days (auto-purge older rows via cron).

Privacy: no user.id stored. Output text + abstract context only.

## Alternatives Considered

### A1. External API for toxicity (Perspective API, etc.)

REJECTED for v1.2 — latency + cost + privacy (sending text to 3rd party).
Reconsider in v1.3 if local blocklist proves insufficient.

### A2. Fine-tuned classifier model (small BERT)

REJECTED for v1.2 — adds inference complexity. Local patterns are
sufficient for the narrow domain (Spanish football management).

### A3. Block AI entirely for risky events (don't filter, just template)

REJECTED — defeats the purpose of v1.2. Filter + fallback is better.

### A4. User-reported "this looks wrong" button

DEFERRED to v1.3 — good idea but requires UX work. Track as backlog.

## Consequences

### Positive

- Deterministic, debuggable safety pipeline
- All decisions auditable in DB
- Alert thresholds catch drift before users notice
- Fallback ensures graceful degradation

### Negative

- Local blocklist requires maintenance
- 1% audit samples accumulate (manageable via 90-day retention)
- False positives reject some good outputs (acceptable trade-off)

### Mitigations

- Writer agent reviews audit samples monthly to refine patterns
- Threshold tuning per `narrative-ai.md` §7
- Patterns are append-only (rarely remove) to avoid regression

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.2 #36 | Pipeline implementation + tests with synthetic toxic samples |
| v1.2 #36 | ai_outputs table migration |
| v1.2 #36 | /admin/ai-outputs review dashboard |
| v1.2 #36 | Sentry alerts wired |
| v1.2 #36 | Toxic-pattern initial list approved by writer + game-designer |

## References

- narrative-ai.md §3.5
- ADR-025 (deployment)
- ADR-026 (context serialization)
- Privacy Policy §4

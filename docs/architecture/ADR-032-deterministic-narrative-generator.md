# ADR-032: Deterministic Narrative Generator (Pillar D without LLM)

## Status

Accepted

## Date

2026-05-29

## Last Verified

2026-05-29

## Decision Makers

Pablo (solo dev / creative + technical director), autopilot Sprint 26.

## Summary

Pillar D ("la voz del mundo" — press, mayor calls, finance commentary, rumours,
board reactions) is implemented as a **deterministic, seeded, pure-function
template generator** in `packages/shared/src/sim/narrative/`, not a local LLM.
This supersedes the deferred llama.cpp design (ADR-025..028) and re-scopes
ADR-004: we trade open-ended generative variety for determinism, zero runtime
cost, instant latency, guaranteed safety, and 100%-testable output. The LLM
approach is **discarded for this project**, not postponed.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web (TypeScript full-stack monorepo) |
| **Domain** | Core / Scripting (simulation text generation) |
| **Knowledge Risk** | LOW — pure TypeScript, no external runtime, no engine API surface |
| **References Consulted** | `design/gdd/narrative-generator.md`, ADR-004, ADR-025..028, `packages/shared/src/sim/narrative/*` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | None at runtime; correctness guarded by `packages/shared/tests/narrative/` (determinism, slot-coverage, denylist, variety enumeration) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | Future locale swap (replace library + vocab, keep the engine) |
| **Blocks** | None |
| **Ordering Note** | Supersedes ADR-004 (narrative AI architecture — llama.cpp), ADR-025, ADR-026, ADR-027, ADR-028. The local-LLM approach to Pillar D is discarded for this project, not postponed. |

## Context

### Problem Statement

v1.2 promised narrative variety as a headline feature ("una IA local genera la
voz del mundo — texto vivo, no scripts"). The original plan (ADR-004 +
ADR-025..028) shipped a local llama.cpp sidecar. That plan carries a permanent
operational tax disproportionate to an indie/free MVP: 6-8 GB RAM on the API
host, p95 latency of 1.5-3s per generation, single-instance serialization,
model version pinning, output-safety pipelines, and cost-aware scheduling — all
to produce a few sentences of Spanish prose per simulated week. The decision
must be made now because Sprint 26 is the integration sprint for Pillar D and
the codebase already contains a working template-engine skeleton.

### Current State

A deterministic template engine already exists and is **live** in three call
sites of `apps/web/src/lib/server/advance-orchestrator.ts`:
- Phase 6c — match-outcome press article (`matchOutcomeTemplates`)
- Phase 8b — mayor call on career milestone (`mayorCallTemplates`)
- Phase 8c — weekly finance commentary (`financial{Positive,Warning}Templates`)

The engine (`render()` + `pickFromVocab()`), types, a 5-group library, and a
~150-word Spanish vocab table are all in `packages/shared/src/sim/narrative/`
and re-exported from `@smt/shared`. Several player-facing strings remain
hardcoded inline in the orchestrator (abono signup/reminder, low-merch warning,
contract expiry) and in `ambient-staff.ts`. No llama.cpp infrastructure was ever
built (ADR-025..028 never advanced past Proposed).

### Constraints

- Free MVP: no per-user inference cost is acceptable.
- API host memory ceiling: < 256 MB/process (technical-preferences.md). An 8B-Q4
  model needs ~5 GB — incompatible by two orders of magnitude.
- Determinism is a project-wide invariant: the simulation core forbids
  `Math.random()` and wall-clock reads; all randomness is seeded. An LLM is
  fundamentally non-deterministic across versions/hardware, breaking the
  "same seed → same world" guarantee and golden-snapshot testing.
- Output safety must be guaranteed, not probabilistic (no offensive output).
- Solo dev: no capacity to run model-pinning ops, staging regression of model
  upgrades, or latency monitoring.

### Requirements

- Produce varied es-ES prose for the Sprint 26 target surfaces (match outcome,
  derby press, finance, mayor, transfer rumour, transfer-window blurb, sponsor
  renewal, contract renewal, promotion/relegation, board confidence).
- Determinism: identical `(seed, variables)` → identical output, always.
- Variety: ≥ 200 distinct renderings per tonal bucket per surface across a
  season (so text reads written, not stamped).
- Safety: zero possibility of profane/offensive output; zero broken `{slot}`
  visible to players for in-contract callers.
- Zero runtime external dependency; sub-millisecond latency.

## Decision

Implement Pillar D as a **deterministic template generator**: curated template
groups + a multi-axis Spanish vocabulary, assembled by a seeded pure function.
No LLM at runtime.

### Architecture

```
 advance-orchestrator (per-week phases)         packages/shared/src/sim/narrative/
 ┌───────────────────────────────────┐          ┌──────────────────────────────┐
 │ derive seed = week*PRIME [+hash]   │          │ types.ts   (NarrativeTemplate │
 │ build variables {clubName,...}     │          │             + requiredVars)   │
 │ renderNarrative(group, ctx)────────┼────────► │ engine.ts  render()           │
 │ if '' → emit no message            │ ◄────────┤   1. filter by when(ctx)      │
 │ else → staff_message inbox row     │  string  │   2. seeded group pick        │
 └───────────────────────────────────┘  or ''   │   3. seeded variant pick      │
                                                 │   4. resolve slots:           │
                                                 │      {var} {vocab:cat} {?c?…?} │
                                                 │ library.ts (template groups)  │
                                                 │ vocab.ts   (es-ES word axes)  │
                                                 └──────────────────────────────┘
                          guarded by packages/shared/tests/narrative/
                  (determinism · slot-coverage · denylist · variety enumeration)
```

### Key Interfaces

```ts
type NarrativeTemplate = {
  variants: readonly string[];
  when?: (ctx: NarrativeContext) => boolean;
  requiredVars?: readonly string[];   // NEW (26-3): slot-coverage contract
};

// render() never throws; returns '' when no group is eligible (caller emits nothing).
function render(
  templates: NarrativeTemplate | readonly NarrativeTemplate[],
  ctx: { seed: number; variables?: Record<string, string | number> },
  vocab?: VocabTable,
): string;
```

### Implementation Guidelines

- Each template group declares `requiredVars`; a build test renders every group
  with a full synthetic var-set and asserts zero residual `{...}`.
- Each group's `when` predicate binds it to a single tonal bucket so a variant
  can never be picked for the wrong situation (no celebratory line after a
  thrashing).
- Seeds derive from stable game state only (`week * <distinct prime> [+ entity
  hash]`); follow the existing convention in `advance-orchestrator.ts`.
- Callers pass pre-formatted es-ES numbers; the engine does not format locale.
- New surfaces are additive: add a group to `library.ts`, words to `vocab.ts`,
  a render test — no engine change.

## Alternatives Considered

### Alternative 1: Local llama.cpp sidecar (the superseded ADR-025..028 plan)

- **Description**: 8B-Q4 model on the API host, HTTP localhost, output-safety
  pipeline, cost-aware scheduling, template fallback on failure.
- **Pros**: open-ended variety; genuinely novel phrasings; can reason over rich
  context.
- **Cons**: ~5 GB RAM (vs 256 MB budget); p95 1.5-3s latency; non-deterministic
  (breaks seeded-world invariant + golden tests); manual model pinning + staging
  regression; probabilistic safety needing a guard pipeline; single-instance
  bottleneck; meaningful infra/ops burden for a solo dev on a free MVP.
- **Estimated Effort**: 4+ sprints (spike, systemd, pinning, service wiring,
  monitoring) per ADR-025 milestones.
- **Rejection Reason**: cost/latency/determinism/ops all violate hard project
  constraints; the template approach already shipped and meets the variety bar
  by construction.

### Alternative 2: Cloud LLM API (OpenAI / Anthropic / Mistral)

- **Description**: call a hosted model per narrative event.
- **Pros**: best quality; no local RAM; no model ops.
- **Cons**: per-user inference cost incompatible with a free MVP; external
  dependency (privacy, reliability, rate limits); still non-deterministic.
- **Estimated Effort**: low to integrate, unbounded to operate (cost scales with
  DAU).
- **Rejection Reason**: cost model and determinism — same as ADR-025 §A1.

### Alternative 3: Static hand-written strings (no engine)

- **Description**: one fixed string (or a tiny inline pool) per event.
- **Pros**: trivial; zero infra.
- **Cons**: repetitive within a single season; no tonal/scoreline awareness;
  scattered hardcoded prose across the orchestrator (the current debt).
- **Estimated Effort**: lowest.
- **Rejection Reason**: fails the variety requirement and the "no hardcoded
  narrative strings" goal; the template generator gives orders-of-magnitude more
  variety at comparable authoring cost.

### Alternative 4: Hybrid — templates now, optional LLM augmentation later

- **Description**: keep the deterministic generator as the contract but plan a
  future opt-in LLM pass behind the same `render()` boundary.
- **Pros**: preserves determinism by default; leaves a door open.
- **Cons**: speculative; no demand signal; re-imports every cost/latency/
  determinism/ops problem of Alternatives 1-2 the moment it is switched on;
  keeping it "planned" invites scope creep back into a settled decision.
- **Rejection Reason**: **Rejected.** Per Pablo's 2026-05-25 decision, LLM
  integration is discarded for this project — not deferred or kept as a roadmap
  item. The deterministic generator is the final design for Pillar D, not a
  stepping stone. Reopening the LLM path would require a new ADR superseding this
  one with fresh justification, not a pre-blessed extension point.

## Consequences

### Positive

- Zero runtime cost, sub-ms latency, no external dependency, no model ops.
- Determinism preserved → golden-snapshot tests and "same seed → same world".
- Safety guaranteed by construction (curated vocab + denylist guard test).
- Variety is high (≥ 200 renderings/bucket/surface) and grows additively.
- Fits the API memory budget trivially.

### Negative

- Variety is bounded by authored content, not open-ended — the same phrasings
  recur over very long horizons (mitigated by vocab size + variant count).
- Authoring burden moves to humans (writing templates + vocab) rather than a
  model.
- Cannot reason over arbitrary novel context the way an LLM could.

### Neutral

- Pillar D is now a `packages/shared` concern (pure sim), not infrastructure.
- ADR-004's "narrative AI" framing becomes "narrative generation"; the local-LLM
  ambition is **discarded for this project**, not postponed. Re-opening it would
  need a new ADR superseding this one.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Insufficient variety → repetitive text (the core critique of the no-LLM path) | Medium | High | Vocab ≥ 8/category + variety-enumeration test asserting ≥ 200 distinct renders/bucket; raise variants/vocab if below |
| Broken `{slot}` visible in production | Medium | Medium | `requiredVars` manifest + slot-coverage guard test (26-3) blocks in CI |
| Tonal mismatch (happy line after a heavy loss) | Low | High | Strict per-bucket `when` predicates + golden snapshots (26-8) |
| Derby flag needs rivalry data that doesn't exist | Medium | Low | Heuristic: same `city` (or same division) until a rivalry table exists |

## Performance Implications

| Metric | Before (llama.cpp plan) | Expected After (templates) | Budget |
|--------|--------|---------------|--------|
| Generation latency (p95) | 1500-3000ms | < 1ms | < 200ms API action |
| Memory (API host) | +5000MB | +~0MB (static tables) | < 256MB/process |
| Load Time | model load ~seconds | 0 | n/a |
| Network | localhost HTTP/gen | none | n/a |

## Migration Plan

1. Mark ADR-004, ADR-025, ADR-026, ADR-027, ADR-028 as `Superseded by ADR-032`
   (done in Sprint 26-1).
2. Harden the engine: add `requiredVars`, slot-coverage guard, documented
   `''` fallback (Sprint 26-3).
3. Expand vocab (26-4) and library (26-5); wire derby press + rumours (26-6).
4. Audit + migrate remaining hardcoded narrative strings to the engine (26-7).
5. Lock behaviour with the narrative QA suite (26-8).

**Rollback plan**: the generator is pure and self-contained; reverting is
deleting `sim/narrative/` and restoring inline strings. No data migration, no
infra teardown.

## Validation Criteria

- [x] ADR-004 + ADR-025..028 marked Superseded by ADR-032.
- [ ] Every template group declares `requiredVars`; slot-coverage test asserts
      zero residual `{...}` across the whole library.
- [ ] Determinism test: identical output for identical `(seed, vars)`.
- [ ] Denylist test: no vocab entry / variant matches profanity; no empty vocab
      category.
- [ ] Variety enumeration test: ≥ 200 distinct renders/bucket/surface.
- [ ] No hardcoded player-facing narrative string remains where a group covers
      it (audit 26-7).
- [ ] `pnpm typecheck` clean; shared/api/web suites green (no regression).

## GDD Requirements Addressed

| GDD Document | System | Requirement | How This ADR Satisfies It |
|-------------|--------|-------------|--------------------------|
| `design/gdd/narrative-generator.md` | Narrative Generator (Pillar D) | "Deterministic, seeded, pure-function text … zero runtime LLM dependency" (§1, §3.1) | Pure `render()` seeded by stable game state; no external runtime |
| `design/gdd/narrative-generator.md` | Narrative Generator | "Slot-coverage guarantee … never contain an unresolved `{...}`" (§3.5) | `requiredVars` manifest + guard test (26-3) |
| `design/gdd/narrative-generator.md` | Narrative Generator | "≥ 200 distinct renderings per tonal bucket per surface" (§4) | Vocab ≥ 8/category × variants; enumeration test (26-4, 26-8) |
| `design/gdd/narrative-generator.md` | Narrative Generator | "Profanity/offensive output impossible by construction" (§5) | Curated vocab + denylist guard test (26-4, 26-8) |
| game-concept.md | Unique Hook | "Una IA local genera la voz del mundo — texto vivo, no scripts" | Re-scoped: the deterministic generator delivers the varied "voice of the world". The local-LLM means is discarded; the player-facing outcome (living, varied world voice) is preserved by the template engine |

## Related

- **Supersedes**: ADR-004 (Narrative AI architecture — llama.cpp), ADR-025
  (llama.cpp deployment), ADR-026 (prompt context serialization), ADR-027 (AI
  output safety pipeline), ADR-028 (AI cost-aware scheduling). The local-LLM
  approach to Pillar D is discarded for this project, not postponed.
- **Implements**: `design/gdd/narrative-generator.md`.
- **Code**: `packages/shared/src/sim/narrative/{engine,types,library,vocab}.ts`;
  consumers in `apps/web/src/lib/server/advance-orchestrator.ts`.

# GDD — Deterministic Narrative Generator (Pillar D)

**Status**: Approved (2026-05-29, Sprint 26 sign-off)
**Owner**: Pablo (solo dev)
**Supersedes**: the discarded Pillar D LLM design (ADR-004 + ADR-025..028,
llama.cpp). The local-LLM approach is discarded for this project, not postponed —
see ADR-032 (Accepted).
**Module**: `packages/shared/src/sim/narrative/`

---

## 1. Overview

The Narrative Generator produces the "voice of the world" — press articles,
mayor calls, financial commentary, transfer rumours, board reactions — as
**deterministic, seeded, pure-function text** assembled from curated template
groups and a multi-axis vocabulary, with zero runtime LLM dependency. It
replaces the originally-planned local-LLM approach (Pillar D / llama.cpp),
trading open-ended variety for determinism, zero cost, instant latency,
guaranteed safety, and 100%-testable output.

The engine already exists in skeleton form (`render()`, slot resolution,
`vocab`, a 5-group library). Sprint 26 turns that skeleton into a complete
system: broader event coverage, much richer vocabulary, a hardening pass
(slot-coverage guarantees + safety), and full integration so that no
player-facing narrative string is hardcoded anymore.

## 2. Player Fantasy

> *"Una IA local genera la voz del mundo (prensa, rumores, llamadas) — texto
> vivo, no scripts"* — game-concept.md §Unique Hook.

The player should feel the world reacting to them with a distinct, varied voice:
match crónicas that capture the scoreline's drama, a mayor who calls when they
matter, press that stokes rivalries, a finance director whose tone shifts with
the balance. Across a full season the same event type should rarely read
identically twice — variety must be high enough that the text feels written,
not stamped. The player must never see a broken `{slot}` or a tonal mismatch
(a celebratory line after a thrashing).

## 3. Detailed Rules

1. **Determinism**: `render(templates, { seed, variables }, vocab)` returns the
   same string for the same inputs, every time. Seeds are derived from stable
   game state (e.g. `week * 1000 + matchday`), never from wall-clock or
   `Math.random()`.
2. **Template groups** are gated by an optional `when(ctx)` predicate and carry
   N `variants`. The engine picks one eligible group (seeded), then one variant
   (seeded with a distinct salt).
3. **Slots**:
   - `{var}` → substituted from `ctx.variables`.
   - `{vocab:category}` → seeded pick from the vocab table; multiple `{vocab:X}`
     in one variant resolve independently (salt increments).
   - `{?cond?segment?}` → segment included only if `ctx.variables.cond` is truthy.
4. **Tone safety**: each template group's `when` predicate must bind it to a
   single tonal bucket (win/draw/loss, positive/negative finance, etc.), so a
   variant can never be selected for the wrong situation.
5. **Slot-coverage guarantee** (NEW): every variant's `{var}`/`{?cond?...}`
   references must be declared in a per-group `requiredVars` manifest. A build
   test fails if a variant references a variable the caller is not contractually
   required to provide. Rendered output must never contain an unresolved
   `{...}` for in-contract callers.
6. **Fallback**: if no group is eligible (`when` all false) `render()` returns
   `''`; callers treat empty as "emit no message" (never a broken string).
7. **Coverage scope** (Sprint 26 target surfaces): match outcome (✓ exists),
   derby press, financial positive/warning (✓ exists), mayor call (✓ exists),
   transfer rumour, transfer-window open/close blurb, sponsor renewal reaction,
   contract renewal reaction, promotion/relegation, board confidence.
8. **Localization**: all output is `es-ES` (project default). Vocabulary and
   templates are Spanish; structure allows a future locale swap by replacing
   the library + vocab, not the engine.

## 4. Formulas

- **Group selection**: `groupIndex = hash(seed, salt=100) mod |eligibleGroups|`.
- **Variant selection**: `variantIndex = hash(seed, salt=200) mod |variants|`.
- **Vocab pick (k-th `{vocab:X}` in a variant)**:
  `vocabIndex = hash(seed, salt=k) mod |vocab[X]|`, k starting at 1.
- **Hash**: existing Mulberry32-style integer mix in `engine.ts::pickIndex`
  (unchanged).
- **Variety estimate** per surface ≈ `|eligibleVariants| × Π(|vocab[cat]|)` over
  the vocab categories referenced. Target: ≥ 200 distinct renderings per tonal
  bucket per surface (achieved via 3 variants × 2-3 vocab slots × 8-15 words).

## 5. Edge Cases

- **Missing variable**: in-contract callers always provide `requiredVars`; the
  26-8 QA test renders every group with a synthetic full var-set and asserts no
  residual `{...}`. Out-of-contract misuse renders the literal slot (acceptable
  dev-only failure mode, caught by the test).
- **Empty vocab category**: `pickFromVocab` returns `{?category?}` sentinel;
  the QA test asserts every referenced category is non-empty.
- **All groups gated out**: returns `''` → caller emits nothing.
- **Numeric formatting**: callers pass pre-formatted `es-ES` numbers (the engine
  does not format); template authors must not embed raw locale-sensitive numbers.
- **Score orientation**: match templates must render from the player's
  perspective (the orchestrator already computes `goalDiff` from the player's
  side); away thrashings flip `homeScore`/`awayScore` correctly (existing bug-free
  behaviour preserved by tests).
- **Profanity / offensive output**: impossible by construction (curated vocab);
  a guard test scans vocab + templates against a denylist to prevent regressions.

## 6. Dependencies

- `packages/shared/src/sim/narrative/{engine,types,library,vocab}.ts` (this module).
- Consumers: `apps/web/src/lib/server/advance-orchestrator.ts` (press, mayor,
  finance), event-system STOP/NOTIFY copy, staff-message generation.
- `fixtures` schema — needs a `derby`/rivalry flag for derby press (story 26-6).
- No external services. No DB schema changes except the optional fixture flag.
- Supersedes ADR-004 (narrative AI arch), ADR-025 (llama.cpp deploy), ADR-026
  (prompt context), ADR-027 (AI output safety), ADR-028 (AI cost scheduling) →
  all marked "Superseded by ADR-032" (done in 26-1).

## 7. Tuning Knobs

- **Vocab list sizes** per category (variety vs curation effort).
- **Number of variants** per template group (variety vs authoring time).
- **`when` thresholds** (e.g. goalDiff buckets ≥3 / 1-2 / 0 / -1..-2 / ≤-3).
- **Surface coverage list** (which event types get narrative vs plain copy).
- **Rumour/derby emission probability** in the advance pipeline (seeded gate).
- **Seed derivation** per surface (controls how often text repeats across weeks).

## 8. Acceptance Criteria

- [ ] An ADR exists marking ADR-025..028 Superseded and recording the
      deterministic-template decision, trade-offs, and rejected alternatives.
- [ ] Every template group declares `requiredVars`; a test renders each group
      with a full synthetic var-set and asserts **zero** residual `{...}`.
- [ ] A determinism test asserts identical output for identical (seed, vars)
      across the whole library.
- [ ] A safety test asserts no vocab entry / template variant matches a profanity
      denylist and no vocab category is empty.
- [ ] Vocab categories expanded to ≥ 8 entries each; ≥ 200 distinct renderings
      per tonal bucket per covered surface (measured by an enumeration test).
- [ ] New template groups exist for: transfer rumour, transfer-window open/close,
      sponsor renewal, contract renewal, promotion/relegation, board confidence.
- [ ] Derby press wired into the advance pipeline (gated on a fixture rivalry flag).
- [ ] No hardcoded player-facing narrative string remains in advance-orchestrator
      or event copy where a template group now covers it (audit story 26-7).
- [ ] `pnpm typecheck` clean; shared determinism + QA tests green; no regressions.
```

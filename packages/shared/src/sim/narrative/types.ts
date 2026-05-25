/**
 * Narrative template generator types. v1.2 Sprint 26.
 *
 * Replaces the deferred Pillar D LLM design (ADRs 025-028 → Superseded by
 * this approach per Pablo decision 2026-05-25). Pure-function, deterministic,
 * cheap, safe, infinite test coverage. Trade variety vs. LLM is acceptable
 * given the multi-axis vocabulary + cascading template approach.
 */

export type NarrativeContext = {
  /** Deterministic seed — same seed + template = same output, 100 times. */
  seed: number;
  /** Variables substituted into `{name}` slots. */
  variables?: Record<string, string | number>;
};

/**
 * A template group. One variant is picked per render call (seeded).
 * Variants are strings with {placeholder} slots. Slots can be:
 *   - {variableName}: substituted from ctx.variables
 *   - {vocab:category}: pulled from the vocab table (seeded)
 *   - {?cond?segment?}: conditional segment (variable presence test)
 */
export type NarrativeTemplate = {
  variants: readonly string[];
  /** Optional gate: only consider this template-group when predicate is true. */
  when?: (ctx: NarrativeContext) => boolean;
};

/** Vocab table: maps category names to ordered lists of words. */
export type VocabTable = Readonly<Record<string, readonly string[]>>;

/**
 * Narrative engine — deterministic template renderer.
 * v1.2 Sprint 26.
 *
 * Render flow:
 *   1. Filter templates by `when` predicate.
 *   2. Pick one variant deterministically from seed.
 *   3. Resolve {placeholder} slots:
 *      - {var}              → ctx.variables[var]
 *      - {vocab:category}   → pickFromVocab(category, seed)
 *      - {?var?text?}       → conditional include (only if var truthy)
 *
 * Slot replacements use distinct seed-mixing so two {vocab:X} in the same
 * template can resolve to different items.
 */

import type { NarrativeContext, NarrativeTemplate, VocabTable } from './types.js';
import { DEFAULT_VOCAB } from './vocab.js';

/** Simple PRNG hash — seed → 0..(n-1) integer. Used for index picking. */
function pickIndex(seed: number, salt: number, n: number): number {
  if (n <= 0) return 0;
  // 32-bit hash mixing — Mulberry32-ish
  let h = ((Math.floor(seed) ^ Math.floor(salt)) * 0x9e3779b1) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return Math.abs(h) % n;
}

export function pickFromVocab(
  category: string,
  seed: number,
  vocab: VocabTable = DEFAULT_VOCAB,
  salt: number = 0,
): string {
  const list = vocab[category];
  if (!list || list.length === 0) return `{?${category}?}`;
  const idx = pickIndex(seed, salt, list.length);
  return list[idx] ?? '';
}

/** Resolve {var} / {vocab:cat} / {?var?text?} slots in a template string. */
function resolveSlots(
  template: string,
  ctx: NarrativeContext,
  vocab: VocabTable,
): string {
  // Conditional segment first — only include if variable truthy.
  // Pattern: {?varName?text?} where text can contain {var} nested
  // (we match up to the closing `?}` greedy-but-safe).
  let out = template.replace(/\{\?([a-zA-Z0-9_]+)\?([\s\S]*?)\?\}/g, (_, name: string, segment: string) => {
    const v = ctx.variables?.[name];
    return v !== undefined && v !== null && v !== '' ? segment : '';
  });

  let vocabSalt = 1;
  out = out.replace(/\{vocab:([a-zA-Z0-9_]+)\}/g, (_, category: string) => {
    const result = pickFromVocab(category, ctx.seed, vocab, vocabSalt);
    vocabSalt += 1;
    return result;
  });

  out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const v = ctx.variables?.[name];
    if (v === undefined || v === null) return `{${name}}`;
    return String(v);
  });

  return out;
}

// --- Slot inspection (Sprint 26-3) -----------------------------------------
// These helpers parse the same slot grammar that `resolveSlots` resolves. They
// power the slot-coverage guard + QA tests (they are pure, never used at render
// time). Keep the regexes in lock-step with `resolveSlots`.

const CONDITIONAL_RE = /\{\?([a-zA-Z0-9_]+)\?([\s\S]*?)\?\}/g;
const VOCAB_RE = /\{vocab:([a-zA-Z0-9_]+)\}/g;
const VAR_RE = /\{([a-zA-Z0-9_]+)\}/g;

export type TemplateSlots = {
  /** `{name}` slots NOT inside a conditional — these MUST always resolve. */
  topLevelVars: readonly string[];
  /** `{?cond?...?}` gate variable names — optional by nature. */
  condVars: readonly string[];
  /** `{name}` slots that live inside a conditional segment. */
  condInnerVars: readonly string[];
  /** `{vocab:cat}` categories referenced anywhere in the variant. */
  vocabCats: readonly string[];
};

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Parse every slot reference out of a single template variant string. */
export function extractSlots(variant: string): TemplateSlots {
  const condVars: string[] = [];
  const condInnerVars: string[] = [];
  const vocabCats: string[] = [];
  const topLevelVars: string[] = [];

  for (const m of variant.matchAll(VOCAB_RE)) vocabCats.push(m[1]!);

  // Strip conditional segments, capturing their gate var + inner plain vars.
  const stripped = variant.replace(CONDITIONAL_RE, (_, name: string, seg: string) => {
    condVars.push(name);
    const inner = seg.replace(VOCAB_RE, '');
    for (const im of inner.matchAll(VAR_RE)) condInnerVars.push(im[1]!);
    return '';
  });

  // Remaining top-level plain vars (after removing vocab slots).
  const noVocab = stripped.replace(VOCAB_RE, '');
  for (const m of noVocab.matchAll(VAR_RE)) topLevelVars.push(m[1]!);

  return {
    topLevelVars: uniq(topLevelVars),
    condVars: uniq(condVars),
    condInnerVars: uniq(condInnerVars),
    vocabCats: uniq(vocabCats),
  };
}

/**
 * Slot-coverage contract check. Returns the top-level `{var}` names referenced
 * by any of the group's variants that are NOT declared in `requiredVars`.
 * An empty array means the group's manifest fully covers its mandatory slots.
 * The guard test asserts this is empty for every library group.
 */
export function coverageGaps(group: NarrativeTemplate): string[] {
  const required = new Set(group.requiredVars ?? []);
  const gaps = new Set<string>();
  for (const variant of group.variants) {
    for (const name of extractSlots(variant).topLevelVars) {
      if (!required.has(name)) gaps.add(name);
    }
  }
  return [...gaps];
}

/**
 * Every variable name referenced across a group's variants (top-level + gate +
 * conditional-inner). Used by the QA test to build a full synthetic var-set and
 * assert zero residual `{...}` after rendering.
 */
export function allReferencedVariables(group: NarrativeTemplate): string[] {
  const all = new Set<string>();
  for (const variant of group.variants) {
    const s = extractSlots(variant);
    s.topLevelVars.forEach((x) => all.add(x));
    s.condVars.forEach((x) => all.add(x));
    s.condInnerVars.forEach((x) => all.add(x));
  }
  return [...all];
}

/** Every `{vocab:cat}` category referenced across a group's variants. */
export function referencedVocabCategories(group: NarrativeTemplate): string[] {
  const all = new Set<string>();
  for (const variant of group.variants) {
    for (const cat of extractSlots(variant).vocabCats) all.add(cat);
  }
  return [...all];
}

/**
 * Render: pick one variant deterministically + resolve all slots.
 *
 * @param templates One or more template groups. Pass an array if you want
 *                  to combine multiple groups (e.g. base + variant).
 * @param ctx       Context with seed + variables.
 * @param vocab     Custom vocab (defaults to DEFAULT_VOCAB).
 */
export function render(
  templates: NarrativeTemplate | readonly NarrativeTemplate[],
  ctx: NarrativeContext,
  vocab: VocabTable = DEFAULT_VOCAB,
): string {
  const groups = Array.isArray(templates) ? templates : [templates];
  const allowed = groups.filter((g) => !g.when || g.when(ctx));
  if (allowed.length === 0) return '';

  // Pick a group, then a variant. Salts are distinct so the same seed
  // doesn't always pick the same indices across multiple groups.
  const group = allowed[pickIndex(ctx.seed, 100, allowed.length)]!;
  const variant = group.variants[pickIndex(ctx.seed, 200, group.variants.length)]!;
  return resolveSlots(variant, ctx, vocab);
}

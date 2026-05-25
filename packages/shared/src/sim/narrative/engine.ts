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

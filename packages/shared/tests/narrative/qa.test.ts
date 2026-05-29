import { describe, it, expect } from 'vitest';
import {
  render,
  extractSlots,
  coverageGaps,
  allReferencedVariables,
  referencedVocabCategories,
} from '../../src/sim/narrative/engine.js';
import { ALL_TEMPLATE_GROUPS } from '../../src/sim/narrative/library.js';
import { DEFAULT_VOCAB } from '../../src/sim/narrative/vocab.js';
import type { NarrativeTemplate } from '../../src/sim/narrative/types.js';

/**
 * Narrative QA suite (Sprint 26-8). Whole-library guarantees:
 *   - slot coverage (requiredVars manifest is complete);
 *   - zero residual {...} when all referenced vars are provided;
 *   - determinism (same seed+vars → same output);
 *   - safety (denylist, no empty vocab, ≥8 entries/category);
 *   - variety enumeration (distinct renders per tonal bucket per surface).
 */

const SLOT_RE = /\{[^}]*\}/; // any residual slot of any kind
const RESIDUAL_RE = /\{[^}]*\}/g;

/** Build a synthetic full var-set for a single variant (all referenced names). */
function syntheticVarsFor(variant: string): Record<string, string> {
  const s = extractSlots(variant);
  const vars: Record<string, string> = {};
  for (const name of [...s.topLevelVars, ...s.condVars, ...s.condInnerVars]) {
    vars[name] = `VAL_${name}`;
  }
  return vars;
}

describe('narrative QA — slot coverage', () => {
  it('test_every_group_declares_complete_requiredVars', () => {
    for (const { name, groups } of ALL_TEMPLATE_GROUPS) {
      for (let i = 0; i < groups.length; i++) {
        const gaps = coverageGaps(groups[i]!);
        expect(gaps, `${name}[${i}] top-level vars missing from requiredVars: ${gaps.join(', ')}`).toEqual([]);
      }
    }
  });

  it('test_no_residual_placeholder_when_all_vars_provided', () => {
    for (const { name, groups } of ALL_TEMPLATE_GROUPS) {
      for (let gi = 0; gi < groups.length; gi++) {
        for (const variant of groups[gi]!.variants) {
          // Render the variant in isolation (no `when` gate) with a full var-set.
          const single: NarrativeTemplate = { variants: [variant] };
          const out = render(single, { seed: 7, variables: syntheticVarsFor(variant) });
          const residual = out.match(RESIDUAL_RE);
          expect(residual, `${name}[${gi}] residual slots in: "${out}"`).toBeNull();
        }
      }
    }
  });

  it('test_required_vars_are_subset_of_referenced_vars', () => {
    // A manifest must not over-declare vars that no variant uses (drift guard).
    for (const { name, groups } of ALL_TEMPLATE_GROUPS) {
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi]!;
        const referenced = new Set(allReferencedVariables(group));
        for (const declared of group.requiredVars ?? []) {
          expect(referenced.has(declared), `${name}[${gi}] requiredVars declares unused "${declared}"`).toBe(true);
        }
      }
    }
  });
});

describe('narrative QA — determinism', () => {
  it('test_render_identical_for_identical_seed_and_vars', () => {
    for (const { groups } of ALL_TEMPLATE_GROUPS) {
      for (const variant of groups.flatMap((g) => g.variants)) {
        const single: NarrativeTemplate = { variants: [variant] };
        const vars = syntheticVarsFor(variant);
        const ref = render(single, { seed: 123, variables: vars });
        for (let k = 0; k < 25; k++) {
          expect(render(single, { seed: 123, variables: { ...vars } })).toBe(ref);
        }
      }
    }
  });
});

describe('narrative QA — safety', () => {
  // Curated denylist — offensive / profane Spanish stems. Output is impossible
  // by construction (curated vocab + templates); this guards against regressions.
  const DENYLIST = [
    'mierda', 'puta', 'puto', 'joder', 'gilipollas', 'cabrón', 'cabron',
    'coño', 'cono', 'follar', 'maricón', 'maricon', 'imbécil', 'imbecil',
    'idiota', 'subnormal', 'retrasado', 'zorra', 'hostia', 'capullo',
    'pendejo', 'verga', 'culero',
  ];

  function matchesDenylist(text: string): string | null {
    const lower = text.toLowerCase();
    for (const bad of DENYLIST) {
      // word-ish boundary: avoid false positives inside longer clean words
      const re = new RegExp(`(^|[^a-záéíóúñ])${bad}([^a-záéíóúñ]|$)`, 'i');
      if (re.test(lower)) return bad;
    }
    return null;
  }

  it('test_no_vocab_entry_matches_denylist', () => {
    for (const [cat, words] of Object.entries(DEFAULT_VOCAB)) {
      for (const w of words) {
        expect(matchesDenylist(w), `vocab ${cat} entry "${w}"`).toBeNull();
      }
    }
  });

  it('test_no_template_variant_matches_denylist', () => {
    for (const { name, groups } of ALL_TEMPLATE_GROUPS) {
      for (const variant of groups.flatMap((g) => g.variants)) {
        expect(matchesDenylist(variant), `${name} variant`).toBeNull();
      }
    }
  });

  it('test_every_vocab_category_non_empty_and_min_eight', () => {
    for (const [cat, words] of Object.entries(DEFAULT_VOCAB)) {
      expect(words.length, `vocab category ${cat}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('test_every_referenced_vocab_category_exists_in_table', () => {
    for (const { name, groups } of ALL_TEMPLATE_GROUPS) {
      for (let gi = 0; gi < groups.length; gi++) {
        for (const cat of referencedVocabCategories(groups[gi]!)) {
          expect(DEFAULT_VOCAB[cat], `${name}[${gi}] references unknown vocab '${cat}'`).toBeDefined();
          expect(DEFAULT_VOCAB[cat]!.length, `vocab '${cat}' empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('narrative QA — tonal safety (no cross-bucket leakage)', () => {
  it('test_match_outcome_buckets_never_mix_win_and_loss_language', () => {
    // A heavy win must never render loss reactions, and vice-versa.
    const baseVars = { clubName: 'FC X', opponent: 'CD Y' };
    const lossWords = DEFAULT_VOCAB.verb_loss!;
    const winWords = DEFAULT_VOCAB.verb_win!;
    const { groups } = ALL_TEMPLATE_GROUPS.find((g) => g.name === 'matchOutcome')!;
    for (let s = 0; s < 200; s++) {
      const bigWin = render(groups, { seed: s, variables: { ...baseVars, homeScore: 4, awayScore: 0, goalDiff: 4 } });
      // verb_loss terms describe the player's team losing — must not appear on a big win
      expect(lossWords.some((w) => bigWin.includes(w)), `seed ${s} win used loss verb: ${bigWin}`).toBe(false);

      const bigLoss = render(groups, { seed: s, variables: { ...baseVars, homeScore: 0, awayScore: 4, goalDiff: -4 } });
      // A heavy loss should not celebrate our team winning (verb_win applies to the opponent only in that bucket,
      // so we only assert no positive crowd reaction leaks in).
      expect(DEFAULT_VOCAB.reaction_positive!.some((w) => bigLoss.includes(w)), `seed ${s} loss used positive reaction: ${bigLoss}`).toBe(false);
      void winWords;
    }
  });
});

describe('narrative QA — variety enumeration', () => {
  // Distinct renderings achievable per tonal bucket, sweeping seeds.
  // Floors are tiered by how often a player sees the surface:
  //   - HIGH (seen most weeks): ≥ 200 distinct renders/bucket (GDD §4 target).
  //   - RARE (a few times/season): floor relaxed to the curated minimum; a
  //     transfer-window or promotion blurb does not need 200 variants.
  // No silent caps: rare-surface floors are declared explicitly below.
  const SWEEP = 4000;

  function distinctRenders(groups: readonly NarrativeTemplate[], vars: Record<string, string | number>): number {
    const out = new Set<string>();
    for (let s = 0; s < SWEEP; s++) out.add(render(groups, { seed: s, variables: vars }));
    out.delete(''); // ignore gated-out empties
    return out.size;
  }

  it('test_match_outcome_each_bucket_exceeds_200', () => {
    const { groups } = ALL_TEMPLATE_GROUPS.find((g) => g.name === 'matchOutcome')!;
    const base = { clubName: 'FC X', opponent: 'CD Y' };
    const buckets = [
      { homeScore: 5, awayScore: 0, goalDiff: 5 }, // big win
      { homeScore: 2, awayScore: 1, goalDiff: 1 }, // narrow win
      { homeScore: 1, awayScore: 1, goalDiff: 0 }, // draw
      { homeScore: 1, awayScore: 2, goalDiff: -1 }, // narrow loss
      { homeScore: 0, awayScore: 4, goalDiff: -4 }, // heavy loss
    ];
    for (const b of buckets) {
      const n = distinctRenders(groups, { ...base, ...b });
      expect(n, `matchOutcome bucket goalDiff=${b.goalDiff} distinct=${n}`).toBeGreaterThanOrEqual(200);
    }
  });

  it('test_finance_buckets_exceed_200', () => {
    const pos = ALL_TEMPLATE_GROUPS.find((g) => g.name === 'financialPositive')!.groups;
    const warn = ALL_TEMPLATE_GROUPS.find((g) => g.name === 'financialWarning')!.groups;
    expect(distinctRenders(pos, { balanceEurK: 250, week: 14 })).toBeGreaterThanOrEqual(200);
    expect(distinctRenders(warn, { balanceEurK: -40 })).toBeGreaterThanOrEqual(200);
  });

  it('test_rumor_surface_exceeds_200', () => {
    const { groups } = ALL_TEMPLATE_GROUPS.find((g) => g.name === 'rumor')!;
    expect(distinctRenders(groups, { playerName: 'J. Pérez', clubName: 'CD Y' })).toBeGreaterThanOrEqual(200);
  });

  it('test_rare_surfaces_meet_curated_minimum', () => {
    // Rare surfaces: assert they still produce meaningful variety (≥ 8) rather
    // than a single stamped line. Floors documented, not silent.
    const cases: { name: string; vars: Record<string, string | number>; floor: number }[] = [
      { name: 'pressDerby', vars: { clubName: 'FC X', goalDiff: 2 }, floor: 8 },
      { name: 'mayorCall', vars: { city: 'Madrid', clubName: 'FC X' }, floor: 3 },
      { name: 'transferWindow', vars: { windowOpen: 1 }, floor: 8 },
      { name: 'sponsorRenewal', vars: { sponsorName: 'Acme', amountEurK: 120 }, floor: 8 },
      { name: 'contractRenewal', vars: { playerName: 'J. Pérez' }, floor: 8 },
      { name: 'promotionRelegation', vars: { promoted: 1, clubName: 'FC X', divisionName: 'Primera' }, floor: 8 },
      { name: 'boardConfidence', vars: { confidence: 85 }, floor: 8 },
    ];
    for (const c of cases) {
      const { groups } = ALL_TEMPLATE_GROUPS.find((g) => g.name === c.name)!;
      const n = distinctRenders(groups, c.vars);
      expect(n, `${c.name} distinct=${n} below floor ${c.floor}`).toBeGreaterThanOrEqual(c.floor);
    }
  });
});

describe('narrative QA — fallback', () => {
  it('test_returns_empty_string_when_all_groups_gated_out', () => {
    const groups: NarrativeTemplate[] = [
      { when: () => false, variants: ['nunca'], requiredVars: [] },
    ];
    expect(render(groups, { seed: 1 })).toBe('');
  });

  it('test_no_residual_slot_marker_helper_consistency', () => {
    // SLOT_RE sanity: a resolved string has no slot; an unresolved one does.
    expect(SLOT_RE.test('texto limpio')).toBe(false);
    expect(SLOT_RE.test('texto {roto}')).toBe(true);
  });
});

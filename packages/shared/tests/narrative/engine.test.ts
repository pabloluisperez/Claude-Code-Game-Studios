import { describe, it, expect } from 'vitest';
import { render, pickFromVocab } from '../../src/sim/narrative/engine.js';
import {
  matchOutcomeTemplates,
  financialPositiveTemplates,
  pressDerbyTemplates,
  mayorCallTemplates,
} from '../../src/sim/narrative/library.js';
import { DEFAULT_VOCAB } from '../../src/sim/narrative/vocab.js';
import type { NarrativeTemplate } from '../../src/sim/narrative/types.js';

describe('narrative engine', () => {
  describe('pickFromVocab', () => {
    it('test_returns_deterministic_pick_for_same_seed', () => {
      const a = pickFromVocab('adj_positive', 42);
      const b = pickFromVocab('adj_positive', 42);
      expect(a).toBe(b);
    });

    it('test_different_seeds_pick_different_items_eventually', () => {
      const picks = new Set<string>();
      for (let i = 0; i < 50; i++) picks.add(pickFromVocab('adj_positive', i));
      // With 15 distinct adjectives, 50 seeds should reach most of them
      expect(picks.size).toBeGreaterThan(5);
    });

    it('test_unknown_category_returns_marker_not_throws', () => {
      const out = pickFromVocab('does_not_exist', 1);
      expect(out).toContain('does_not_exist');
    });
  });

  describe('render', () => {
    it('test_variable_substitution', () => {
      const t: NarrativeTemplate = { variants: ['Hola {nombre}.'] };
      const out = render(t, { seed: 1, variables: { nombre: 'Pablo' } });
      expect(out).toBe('Hola Pablo.');
    });

    it('test_vocab_substitution_uses_seed', () => {
      const t: NarrativeTemplate = { variants: ['un partido {vocab:adj_positive}'] };
      const out = render(t, { seed: 42 });
      // Verify it picked some adjective from the table
      expect(DEFAULT_VOCAB.adj_positive!).toContain(out.replace('un partido ', ''));
    });

    it('test_conditional_segment_present', () => {
      const t: NarrativeTemplate = {
        variants: ['Resultado {homeScore}-{awayScore}{?note? · nota: {note}?}'],
      };
      const withNote = render(t, { seed: 1, variables: { homeScore: 3, awayScore: 1, note: 'derbi' } });
      expect(withNote).toContain('· nota: derbi');
      const withoutNote = render(t, { seed: 1, variables: { homeScore: 3, awayScore: 1 } });
      expect(withoutNote).not.toContain('nota:');
      expect(withoutNote).toBe('Resultado 3-1');
    });

    it('test_when_predicate_filters_groups', () => {
      const groups: NarrativeTemplate[] = [
        { when: (ctx) => Number(ctx.variables?.x ?? 0) > 0, variants: ['positive {x}'] },
        { when: (ctx) => Number(ctx.variables?.x ?? 0) < 0, variants: ['negative {x}'] },
      ];
      const pos = render(groups, { seed: 1, variables: { x: 5 } });
      expect(pos).toBe('positive 5');
      const neg = render(groups, { seed: 1, variables: { x: -3 } });
      expect(neg).toBe('negative -3');
    });

    it('test_render_deterministic_across_many_runs', () => {
      const ctx = { seed: 42, variables: { homeScore: 3, awayScore: 0, goalDiff: 3, clubName: 'FC X', opponent: 'CD Y' } };
      const ref = render(matchOutcomeTemplates, ctx);
      for (let i = 0; i < 100; i++) {
        expect(render(matchOutcomeTemplates, { ...ctx })).toBe(ref);
      }
    });

    it('test_match_outcome_emits_when_landslide', () => {
      const ctx = { seed: 1, variables: { homeScore: 5, awayScore: 0, goalDiff: 5, clubName: 'FC X', opponent: 'CD Y' } };
      const out = render(matchOutcomeTemplates, ctx);
      expect(out.length).toBeGreaterThan(20);
      // Should include both scores (any format)
      expect(out).toContain('5');
      expect(out).toContain('0');
    });

    it('test_no_unresolved_placeholders_in_match_outcome_output', () => {
      // Sweep 100 seeds; output must never contain literal {x} placeholders
      for (let s = 0; s < 100; s++) {
        const ctx = { seed: s, variables: { homeScore: 2, awayScore: 1, goalDiff: 1, clubName: 'FC X', opponent: 'CD Y' } };
        const out = render(matchOutcomeTemplates, ctx);
        expect(out).not.toMatch(/\{[a-zA-Z0-9_:]+\}/);
      }
    });

    it('test_press_derby_filters_correctly', () => {
      const win = render(pressDerbyTemplates, { seed: 1, variables: { goalDiff: 1, clubName: 'FC X' } });
      const lose = render(pressDerbyTemplates, { seed: 1, variables: { goalDiff: -1, clubName: 'FC X' } });
      const draw = render(pressDerbyTemplates, { seed: 1, variables: { goalDiff: 0, clubName: 'FC X' } });
      expect(win).not.toBe(lose);
      expect(win).not.toBe(draw);
    });

    it('test_mayor_call_uses_city_variable', () => {
      const out = render(mayorCallTemplates, { seed: 1, variables: { city: 'Madrid', clubName: 'FC X' } });
      expect(out).toContain('Madrid');
    });

    it('test_financial_positive_template_uses_balance', () => {
      const out = render(financialPositiveTemplates, { seed: 1, variables: { balanceEurK: 250, week: 14 } });
      expect(out).toContain('250');
    });

    it('test_variety_across_seeds_for_same_event', () => {
      const outputs = new Set<string>();
      for (let s = 0; s < 50; s++) {
        const out = render(matchOutcomeTemplates, {
          seed: s,
          variables: { homeScore: 2, awayScore: 1, goalDiff: 1, clubName: 'X', opponent: 'Y' },
        });
        outputs.add(out);
      }
      // 50 seeds should produce many distinct outputs (variety check)
      expect(outputs.size).toBeGreaterThan(15);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { getVocab, VOCAB_BY_LOCALE } from '../../src/sim/narrative/vocab.js';
import { getLibrary, LIBRARY_BY_LOCALE, ALL_TEMPLATE_GROUPS } from '../../src/sim/narrative/library.js';
import { DEFAULT_VOCAB } from '../../src/sim/narrative/vocab.js';
import { DEFAULT_LOCALE } from '../../src/sim/narrative/types.js';
import { coverageGaps } from '../../src/sim/narrative/engine.js';

/**
 * Locale scaffolding (Sprint 26-10). The engine is locale-agnostic: vocab and
 * library are selected by locale via getVocab/getLibrary. Only es-ES exists,
 * but the structure must hold so adding a locale never touches the engine.
 */

describe('narrative locale scaffolding', () => {
  it('test_default_locale_is_es_ES', () => {
    expect(DEFAULT_LOCALE).toBe('es-ES');
  });

  it('test_getVocab_defaults_to_es_ES_table', () => {
    expect(getVocab()).toBe(DEFAULT_VOCAB);
    expect(getVocab('es-ES')).toBe(DEFAULT_VOCAB);
  });

  it('test_getLibrary_defaults_to_es_ES_registry', () => {
    expect(getLibrary()).toBe(ALL_TEMPLATE_GROUPS);
    expect(getLibrary('es-ES')).toBe(ALL_TEMPLATE_GROUPS);
  });

  it('test_every_declared_locale_has_vocab_and_library', () => {
    const vocabLocales = Object.keys(VOCAB_BY_LOCALE);
    const libraryLocales = Object.keys(LIBRARY_BY_LOCALE);
    expect(vocabLocales).toEqual(libraryLocales);
    for (const loc of vocabLocales) {
      expect(Object.keys(VOCAB_BY_LOCALE[loc as 'es-ES']).length).toBeGreaterThan(0);
      expect(LIBRARY_BY_LOCALE[loc as 'es-ES'].length).toBeGreaterThan(0);
    }
  });

  it('test_resolved_locale_library_keeps_slot_coverage', () => {
    // Whatever locale a caller picks, its registry must satisfy the slot-coverage
    // contract (full render coverage is exercised per-group in qa.test.ts).
    for (const loc of Object.keys(LIBRARY_BY_LOCALE) as Array<'es-ES'>) {
      for (const { name, groups } of getLibrary(loc)) {
        for (let i = 0; i < groups.length; i++) {
          expect(coverageGaps(groups[i]!), `${loc} ${name}[${i}]`).toEqual([]);
        }
      }
    }
  });
});

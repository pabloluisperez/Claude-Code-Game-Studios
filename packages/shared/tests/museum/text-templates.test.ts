/**
 * Tests for museum text templates. Story TROPHIES-HISTORY-003.
 */

import { describe, it, expect } from 'vitest';
import {
  trophyTemplates,
  bannerTemplates,
  transferTemplates,
  milestoneTemplates,
  stadiumHistoryTemplate,
  pickAdjective,
  pickTrophyTemplate,
  SUMMARY_ADJECTIVES,
} from '../../src/i18n/museum-templates.js';

describe('museum text templates (ES, v1.1)', () => {
  it('test_trophy_template_0_renders_full_sentence', () => {
    const out = trophyTemplates[0]!({
      trophy_name: 'Copa Regional',
      season: 3,
      summary_adjective: 'gloria',
    });
    expect(out).toBe('Ganaste la Copa Regional en la temporada 3. Fue un año de gloria.');
  });

  it('test_banner_ascenso_template_includes_division_and_season', () => {
    const out = bannerTemplates.ascenso({ division: 'Primera', season: 5 });
    expect(out).toContain('Ascenso a Primera');
    expect(out).toContain('temporada 5');
  });

  it('test_banner_derby_template_substitutes_all_three_fields', () => {
    const out = bannerTemplates.derby({ opponent: 'Real Pueblo', season: 4, result_text: 'victoria 2-1' });
    expect(out).toBe('Derbi Real Pueblo, 4: victoria 2-1.');
  });

  it('test_banner_legendary_includes_match_description', () => {
    const out = bannerTemplates.legendary({ season: 2, match_description: '5-0 al líder' });
    expect(out).toContain('5-0 al líder');
    expect(out).toContain('legendario');
  });

  it('test_transfer_outgoing_includes_all_placeholders', () => {
    const out = transferTemplates.outgoing({
      player_name: 'Lucas Morán',
      season: 4,
      fee_eur_k: 800,
      year_in: 2026,
      year_out: 2029,
    });
    expect(out).toContain('Lucas Morán');
    expect(out).toContain('temporada 4');
    expect(out).toContain('800€K');
    expect(out).toContain('2026');
    expect(out).toContain('2029');
  });

  it('test_transfer_incoming_template', () => {
    const out = transferTemplates.incoming({ player_name: 'Sara Ruiz', season: 3, fee_eur_k: 1500 });
    expect(out).toContain('Sara Ruiz llegó');
    expect(out).toContain('1500€K');
  });

  it('test_transfer_cantera_template', () => {
    const out = transferTemplates.cantera({ player_name: 'Pablo Jr.', season: 5 });
    expect(out).toContain('Pablo Jr. salió de la cantera');
    expect(out).toContain('Hijo del club');
  });

  it('test_milestone_first_profit_includes_season', () => {
    const out = milestoneTemplates.first_profit({ season: 1 });
    expect(out).toContain('Temporada 1');
    expect(out).toContain('beneficios');
  });

  it('test_milestone_bankruptcy_recovery_includes_season', () => {
    const out = milestoneTemplates.bankruptcy_recovery({ season: 2 });
    expect(out).toContain('Temporada 2');
    expect(out).toContain('resurge');
  });

  it('test_stadium_history_template_includes_item_season_cost', () => {
    const out = stadiumHistoryTemplate({ item_name: 'Grada Norte', season: 1, cost_eur_k: 21 });
    expect(out).toBe('Grada Norte — temporada 1. Coste: 21€K.');
  });

  it('test_pickAdjective_deterministic_same_seed_same_output', () => {
    const ref = pickAdjective(0);
    for (let i = 0; i < 100; i++) {
      expect(pickAdjective(0)).toBe(ref);
    }
  });

  it('test_pickAdjective_cycles_through_full_pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < SUMMARY_ADJECTIVES.length; i++) {
      seen.add(pickAdjective(i));
    }
    expect(seen.size).toBe(SUMMARY_ADJECTIVES.length);
  });

  it('test_pickAdjective_handles_negative_seeds', () => {
    // Negative seed shouldn't throw or return undefined.
    const out = pickAdjective(-3);
    expect(SUMMARY_ADJECTIVES).toContain(out);
  });

  it('test_pickTrophyTemplate_cycles_three_templates', () => {
    expect(pickTrophyTemplate(0)).toBe(trophyTemplates[0]);
    expect(pickTrophyTemplate(1)).toBe(trophyTemplates[1]);
    expect(pickTrophyTemplate(2)).toBe(trophyTemplates[2]);
    expect(pickTrophyTemplate(3)).toBe(trophyTemplates[0]); // wraps
  });

  it('test_no_english_strings_in_any_template_output', () => {
    // Verify outputs contain Spanish accent characters or common Spanish words
    // and don't accidentally include English (e.g., "season" instead of "temporada").
    const outs = [
      trophyTemplates[0]!({ trophy_name: 'X', season: 1, summary_adjective: 'gloria' }),
      bannerTemplates.ascenso({ division: 'X', season: 1 }),
      bannerTemplates.legendary({ season: 1, match_description: 'X' }),
      milestoneTemplates.first_profit({ season: 1 }),
      stadiumHistoryTemplate({ item_name: 'X', season: 1, cost_eur_k: 1 }),
    ];
    for (const out of outs) {
      expect(out.toLowerCase()).not.toMatch(/\bseason\b/);
      expect(out.toLowerCase()).not.toMatch(/\bclub won\b/);
    }
  });
});

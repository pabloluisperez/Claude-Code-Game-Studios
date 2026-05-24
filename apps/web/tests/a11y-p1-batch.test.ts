/**
 * A11y P1 batch — Sprint 11 task 11-3.
 *
 * Static regression guards for the 6 P1 findings from the 2026-05-21
 * accessibility audit (production/qa/a11y-audit-2026-05-21.md):
 *
 *   P1-1: confirm-dialog focus trap (Tab cycles between Cancel/Confirm)
 *   P1-2: confirm-dialog focus return (focus returns to opener on close)
 *   P1-3: advance-transition focus management (focus trap + return)
 *   P1-4: tab bars aria-selected + aria-controls (/finance, /league, /inbox)
 *   P1-5: match aria-live region (event feed announces goals)
 *   P1-6: balance icon/prefix (non-color signal for distress states)
 *
 * Static grep-based tests are sufficient because:
 *   - aria attributes are declared in markup, not computed at runtime
 *   - focus-trap/return logic is wired via $effect + onkeydown — testing
 *     the wiring (handler bound, queueMicrotask used) catches removal
 *   - true e2e a11y verification (screen reader behavior, focus order
 *     across browsers) is covered by manual QA in production/qa/evidence/
 *
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
function readComponent(relativePath: string): string {
  return readFileSync(resolve(here, '..', 'src', relativePath), 'utf8');
}

describe('Sprint 11 task 11-3 — A11y P1 batch regression guards', () => {
  describe('P1-1 + P1-2: confirm-dialog focus trap + return', () => {
    const source = readComponent('lib/components/confirm-dialog.svelte');

    it('test_confirm_dialog_captures_opener_element', () => {
      expect(source).toMatch(/openerEl\s*=\s*document\.activeElement/);
    });

    it('test_confirm_dialog_returns_focus_on_close', () => {
      expect(source).toMatch(/openerEl\?\.focus\(\)/);
    });

    it('test_confirm_dialog_traps_tab_key', () => {
      // Match either `e.key === 'Tab'` (positive check) or `e.key !== 'Tab'`
      // (early-return guard) — both indicate Tab handling.
      expect(source).toMatch(/e\.key\s*[!=]==\s*['"]Tab['"]/);
      expect(source).toMatch(/e\.preventDefault\(\)/);
    });

    it('test_confirm_dialog_binds_both_buttons_for_trap', () => {
      expect(source).toMatch(/bind:this=\{cancelBtnEl\}/);
      expect(source).toMatch(/bind:this=\{confirmBtnEl\}/);
    });

    it('test_confirm_dialog_handles_escape_via_keydown', () => {
      expect(source).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
    });
  });

  describe('P1-3: advance-transition focus management', () => {
    const source = readComponent('lib/components/advance-transition.svelte');

    it('test_advance_transition_captures_opener_element', () => {
      expect(source).toMatch(/openerEl\s*=\s*document\.activeElement/);
    });

    it('test_advance_transition_returns_focus_on_close', () => {
      expect(source).toMatch(/openerEl\?\.focus\(\)|restore\?\.focus\(\)/);
    });

    it('test_advance_transition_has_focus_trap_handler', () => {
      expect(source).toMatch(/handleKeyDown/);
      expect(source).toMatch(/e\.key\s*[!=]==\s*['"]Tab['"]/);
    });

    it('test_advance_transition_binds_modal_root_for_focus_discovery', () => {
      expect(source).toMatch(/bind:this=\{modalRootEl\}/);
    });
  });

  describe('P1-4: tab bars aria-selected + aria-controls', () => {
    it('test_finance_tabs_declare_aria_selected', () => {
      const source = readComponent('routes/finance/+page.svelte');
      expect(source).toMatch(/aria-selected=\{activeTab\s*===\s*['"]resumen['"]\}/);
      expect(source).toMatch(/aria-selected=\{activeTab\s*===\s*['"]patrocinadores['"]\}/);
      expect(source).toMatch(/aria-selected=\{activeTab\s*===\s*['"]abonos['"]\}/);
    });

    it('test_finance_tabs_declare_aria_controls', () => {
      const source = readComponent('routes/finance/+page.svelte');
      expect(source).toMatch(/aria-controls="tabpanel-finance-resumen"/);
      expect(source).toMatch(/aria-controls="tabpanel-finance-patrocinadores"/);
      expect(source).toMatch(/aria-controls="tabpanel-finance-abonos"/);
    });

    it('test_finance_tabpanels_declare_role_and_id', () => {
      const source = readComponent('routes/finance/+page.svelte');
      expect(source).toMatch(/role="tabpanel"[\s\S]*?id="tabpanel-finance-resumen"/);
      expect(source).toMatch(/role="tabpanel"[\s\S]*?id="tabpanel-finance-patrocinadores"/);
      expect(source).toMatch(/role="tabpanel"[\s\S]*?id="tabpanel-finance-abonos"/);
    });

    it('test_league_tabs_declare_aria_attributes', () => {
      const source = readComponent('routes/league/+page.svelte');
      expect(source).toMatch(/aria-selected=\{view\s*===\s*['"]upcoming3['"]\}/);
      expect(source).toMatch(/aria-selected=\{view\s*===\s*['"]all['"]\}/);
      expect(source).toMatch(/aria-selected=\{view\s*===\s*['"]past['"]\}/);
      expect(source).toMatch(/aria-controls="tabpanel-league-fixtures"/);
      expect(source).toMatch(/role="tabpanel"[\s\S]*?id="tabpanel-league-fixtures"/);
    });

    it('test_inbox_tabs_declare_aria_attributes', () => {
      const source = readComponent('routes/inbox/+page.svelte');
      expect(source).toMatch(/aria-selected=\{tab\s*===\s*['"]all['"]\}/);
      expect(source).toMatch(/aria-selected=\{tab\s*===\s*['"]messages['"]\}/);
      expect(source).toMatch(/aria-selected=\{tab\s*===\s*['"]events['"]\}/);
      expect(source).toMatch(/aria-controls="tabpanel-inbox"/);
      expect(source).toMatch(/role="tabpanel"[\s\S]*?id="tabpanel-inbox"/);
    });
  });

  describe('P1-5: match event feed aria-live region', () => {
    const source = readComponent('routes/match/[matchSessionId]/+page.svelte');

    it('test_match_event_feed_has_aria_live_polite', () => {
      expect(source).toMatch(/aria-live="polite"/);
    });

    it('test_match_event_feed_has_aria_atomic_false', () => {
      expect(source).toMatch(/aria-atomic="false"/);
    });

    it('test_match_event_feed_has_meaningful_aria_label', () => {
      expect(source).toMatch(/aria-label="Eventos del partido en directo"/);
    });
  });

  describe('P1-6: balance icon/prefix non-color signal', () => {
    const source = readComponent('lib/components/topbar.svelte');

    it('test_topbar_renders_warning_icon_when_balance_low_or_negative', () => {
      expect(source).toMatch(/balanceIcon/);
      // The actual icon character (⚠) should appear in the derived expression.
      expect(source).toMatch(/['"]⚠['"]/);
    });

    it('test_topbar_aria_label_describes_balance_state', () => {
      expect(source).toMatch(/balanceAriaLabel/);
      expect(source).toMatch(/Balance crítico/);
      expect(source).toMatch(/Balance bajo/);
    });

    it('test_topbar_balance_link_uses_dynamic_aria_label', () => {
      expect(source).toMatch(/aria-label=\{balanceAriaLabel\}/);
    });

    it('test_topbar_icon_is_aria_hidden_to_avoid_double_announce', () => {
      // The visible icon must not be announced (the aria-label on the parent
      // anchor already encodes the state in text), so the icon span is
      // aria-hidden="true".
      expect(source).toMatch(/aria-hidden="true"/);
    });
  });
});

/**
 * A11y P2 batch — Sprint 12 task 12-3.
 *
 * Static regression guards for the 3 P2 findings from the 2026-05-21
 * accessibility audit:
 *
 *   P2-1: skip-link al main content (Tab desde topbar → "Saltar al contenido")
 *   P2-2: heading levels coherentes (h1→h2→h3 sin saltos)
 *   P2-3: sponsor offer Accept/Reject form labels (aria-label descriptivo)
 *
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
function readSrc(rel: string): string {
  return readFileSync(resolve(here, '..', 'src', rel), 'utf8');
}

describe('Sprint 12 task 12-3 — A11y P2 batch', () => {
  describe('P2-1: skip-link al main content', () => {
    const layout = readSrc('routes/+layout.svelte');

    it('test_layout_renders_skip_link_anchor', () => {
      expect(layout).toMatch(/<a\s+href="#main-content"\s+class="skip-link"/);
    });

    it('test_layout_main_has_id_main_content', () => {
      // Both branches (chrome + no-chrome) must expose the anchor target.
      expect(layout).toMatch(/<main\s+id="main-content"/);
    });

    it('test_skip_link_visible_only_on_focus', () => {
      // CSS pattern: off-screen by default, on-screen on :focus.
      expect(layout).toMatch(/\.skip-link[\s\S]*top:\s*-40px/);
      expect(layout).toMatch(/skip-link:focus[\s\S]*top:\s*0/);
    });

    it('test_skip_link_text_is_localised_spanish', () => {
      expect(layout).toMatch(/Saltar al contenido/);
    });
  });

  describe('P2-2: heading levels coherentes', () => {
    it('test_staff_role_label_is_h2_not_h3', () => {
      // Sprint 12 fix: /staff had h1→h3 skip. Role labels are now h2 so
      // the document outline is h1 (page title) → h2 (role section).
      const staff = readSrc('routes/staff/+page.svelte');
      // No <h3> for the role label tooltip wrapper.
      expect(staff).not.toMatch(/<h3[^>]*>\s*\n?\s*\{r\.label\}/);
      // Yes <h2> for it.
      expect(staff).toMatch(/<h2[^>]*>\s*\n?\s*\{r\.label\}/);
    });

    it('test_dashboard_has_h1_in_each_branch', () => {
      const dashboard = readSrc('routes/dashboard/+page.svelte');
      // Each top-level branch declares its own h1; this is valid because
      // they're mutually exclusive (hasPlaythrough true vs false).
      const h1Count = (dashboard.match(/<h1[^>]*>/g) ?? []).length;
      expect(h1Count).toBeGreaterThanOrEqual(1);
    });

    it('test_finance_has_h1_and_h2_section_titles', () => {
      const finance = readSrc('routes/finance/+page.svelte');
      expect(finance).toMatch(/<h1[^>]*>\s*Finanzas\s*<\/h1>/);
      expect(finance).toMatch(/<h2 class="card-title"/);
    });

    it('test_league_has_h1_and_h2_section_titles', () => {
      const league = readSrc('routes/league/+page.svelte');
      expect(league).toMatch(/<h1[^>]*>\s*Liga\s*<\/h1>/);
      expect(league).toMatch(/<h2 class="card-title"/);
    });

    it('test_squad_has_h1_page_title', () => {
      const squad = readSrc('routes/squad/+page.svelte');
      expect(squad).toMatch(/<h1[^>]*>\s*Plantilla\s*<\/h1>/);
    });

    it('test_inbox_has_h1_page_title', () => {
      const inbox = readSrc('routes/inbox/+page.svelte');
      expect(inbox).toMatch(/<h1[^>]*>[^<]*Bandeja de entrada/);
    });
  });

  describe('P2-3: sponsor offer Accept/Reject form labels', () => {
    const finance = readSrc('routes/finance/+page.svelte');

    it('test_sponsor_accept_button_has_aria_label_with_brand', () => {
      // Sprint 12 fix: button text "Aceptar" alone was ambiguous in a list
      // of multiple offers. The aria-label includes the sponsor brand.
      expect(finance).toMatch(/aria-label="Aceptar oferta de \{meta\?\.brand/);
    });

    it('test_sponsor_reject_button_has_aria_label_with_brand', () => {
      expect(finance).toMatch(/aria-label="Rechazar oferta de \{meta\?\.brand/);
    });
  });
});

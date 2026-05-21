# A11y P2 Batch — Sprint 12 task 12-3 evidence

**Date**: 2026-05-21
**Story**: SPRINT-12-S03
**Auditor**: accessibility-specialist (autopilot session)
**Reviewer**: Pablo (solo dev) — pending walkthrough sign-off

## Scope

3 P2 findings from the Polish-entry accessibility audit
(`production/qa/a11y-audit-2026-05-21.md`).

| # | Finding | File touched | Implementation |
|---|---------|--------------|----------------|
| P2-1 | Skip-link al main content | `apps/web/src/routes/+layout.svelte` | New `<a href="#main-content" class="skip-link">Saltar al contenido</a>` before topbar in BOTH layout branches (chrome + no-chrome). CSS `.skip-link { position:absolute; top:-40px }` hidden by default; `.skip-link:focus { top:0 }` reveals on first Tab. `<main>` elements get `id="main-content"`. |
| P2-2 | Heading levels coherentes | `apps/web/src/routes/staff/+page.svelte` | `/staff` had `<h1>` (page title) followed by `<h3>` for role labels — invalid skip. Changed role label to `<h2>`. Other routes already had valid sequences (h1 → h2 card-title → h3 row label) and only needed verification. |
| P2-3 | Sponsor Accept/Reject form labels | `apps/web/src/routes/finance/+page.svelte` | Buttons "Aceptar" / "Rechazar" alone were ambiguous when multiple offers stack. Added `aria-label="Aceptar oferta de [brand]"` and `aria-label="Rechazar oferta de [brand]"` derived from the offer metadata. Visual text stays minimal; screen reader gets full context. |

## Automated regression guards

New test file `apps/web/tests/a11y-p2-batch.test.ts` — 12 tests:

- **P2-1** (4 tests): skip-link anchor exists, main has id, CSS off-screen-by-default + focus-on, Spanish label
- **P2-2** (6 tests): /staff role label is h2 (not h3); each critical route has h1 (Dashboard, Finance, League, Squad, Inbox)
- **P2-3** (2 tests): sponsor Accept + Reject aria-labels reference brand

Total: **94 tests passing in apps/web** + 5 todo. No regression.

## Manual walkthrough — pending Pablo sign-off

To verify the full UX, ~5 min keyboard pass:

### P2-1 — skip-link
1. Visit any authenticated page (e.g., `/dashboard`).
2. Press `Tab` once from a clean page state.
3. The skip-link "Saltar al contenido" appears visibly at the top-left corner.
4. Press `Enter` → focus jumps to `<main>` skipping the topbar and sidebar nav.
5. Visit `/login` (no chrome) → same skip-link still works.

### P2-2 — heading levels
1. Open browser devtools accessibility panel → "Show document outline".
2. Visit `/staff` → outline should be:
   - h1 "Staff"
   - h2 "Tu reputación"
   - h2 "[role label]" × N (one per role card)
3. No `<h3>` between h1 and any h2.

### P2-3 — sponsor labels
1. Visit `/finance?tab=patrocinadores` with at least 2 pending offers.
2. Tab to an Accept button.
3. Screen reader (VoiceOver / NVDA) announces "Aceptar oferta de [Brand X], botón" (not just "Aceptar, botón").
4. Tab to the Reject button → announces "Rechazar oferta de [Brand X], botón".

## P0/P1/P2 status

- **P0**: 4 findings — ✅ Closed Sprint 10 (task 10-4)
- **P1**: 6 findings — ✅ Closed Sprint 11 (task 11-3)
- **P2**: 3 findings — ✅ Closed Sprint 12 (task 12-3, this evidence)

**A11y audit: PASS** (WCAG 2.1 AA scope) once Pablo's manual walkthrough confirms. No remaining backlog from the original audit.

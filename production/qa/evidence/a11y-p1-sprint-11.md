# A11y P1 Batch — Sprint 11 task 11-3 evidence

**Date**: 2026-05-21
**Story**: SPRINT-11-S03
**Auditor**: accessibility-specialist (autopilot session)
**Reviewer**: Pablo (solo dev) — pending walkthrough sign-off
**Source audit**: `production/qa/a11y-audit-2026-05-21.md`

---

## Scope

Address the 6 P1 findings from the Polish-entry accessibility audit. P0
fixes shipped in Sprint 10; this sprint closes the P1 tier.

| # | Finding | File touched | Implementation |
|---|---------|--------------|----------------|
| P1-1 | confirm-dialog focus trap | `apps/web/src/lib/components/confirm-dialog.svelte` | `handleKeyDown` cycles Tab between cancel/confirm buttons; Shift+Tab from cancel → confirm, Tab from confirm → cancel |
| P1-2 | confirm-dialog focus return | `apps/web/src/lib/components/confirm-dialog.svelte` | `openerEl` captured from `document.activeElement` on open; restored via `queueMicrotask(() => openerEl?.focus())` on both confirm and cancel paths |
| P1-3 | advance-transition focus | `apps/web/src/lib/components/advance-transition.svelte` | Same opener-capture + queueMicrotask restore pattern; focus trap discovers focusable set dynamically (modal has variable button count: pause/resume/skip/cancel/match choices) |
| P1-4 | tab bars aria attributes | `apps/web/src/routes/finance/+page.svelte`, `apps/web/src/routes/league/+page.svelte`, `apps/web/src/routes/inbox/+page.svelte` | Each tab now declares `id`, `aria-selected={activeTab === 'X'}`, `aria-controls="tabpanel-Y"`. Tabpanels have matching `role="tabpanel"`, `id`, `aria-labelledby`. Tablists have an `aria-label` describing the group. |
| P1-5 | match aria-live region | `apps/web/src/routes/match/[matchSessionId]/+page.svelte` | Event feed wrapped in `aria-live="polite"` + `aria-atomic="false"` + `aria-label="Eventos del partido en directo"`. Goals/cards announce as they appear during replay without re-reading the full list. |
| P1-6 | balance icon/prefix | `apps/web/src/lib/components/topbar.svelte` | Added `balanceIcon` derived (⚠ when ≤ 50 €K, empty when healthy) and `balanceAriaLabel` derived ("Balance crítico/bajo/Ver finanzas" based on tier). Icon span is `aria-hidden="true"` so screen reader only reads the descriptive label once. |

---

## Automated regression guards

New test file: `apps/web/tests/a11y-p1-batch.test.ts` — 21 tests covering:

- Confirm-dialog opener capture, focus return, Tab handling, Escape handling, button bindings (5 tests)
- Advance-transition opener capture, focus return, Tab handler, modal root binding (4 tests)
- Tab attributes on /finance, /league, /inbox (5 tests, one per route + cross-route assertions)
- Match aria-live polite + atomic + label (3 tests)
- Topbar balance icon, aria-label, dynamic binding, aria-hidden icon (4 tests)

All 21 tests pass. Total apps/web test count: 36 (up from 15 after the
orchestrator extraction test added in 11-2). No regression in @smt/shared
(953) or @smt/api (44). Grand total: **1033 tests passing**.

---

## Manual walkthrough — pending Pablo sign-off

The automated tests verify *structure* (attributes are declared, handlers
are wired). True a11y verification requires manual interaction with a
screen reader. Pablo to confirm during Polish playtest #1 (story 11-5)
or in a separate ~5 min keyboard pass:

### P1-1 + P1-2 — confirm-dialog

1. Open any confirm-dialog (e.g., "Despedir staff" from `/staff` page).
2. Press `Tab` repeatedly → focus should cycle between Cancelar and Confirmar buttons; should never escape to the page behind.
3. Press `Shift+Tab` from Cancelar → focus moves to Confirmar (wraps).
4. Press `Escape` → dialog closes, focus returns to the button that opened it (the staff "Despedir" trigger).
5. Repeat with click on Cancelar or Confirmar → same focus-return behavior.

### P1-3 — advance-transition

1. Open the dashboard, click "Avanzar semana" → AdvanceTransition modal opens.
2. Press `Tab` → focus should stay within the modal's controls (Pausar/Reanudar/Avanzar/Cancelar).
3. Click "Cancelar y actuar" → modal closes, focus returns to "Avanzar semana".

### P1-4 — tab bars

1. Navigate to `/finance` with `Tab` until reaching the tablist.
2. Use `Tab` between tabs (each tab is its own focusable button).
3. Activate a tab with `Enter` or `Space`.
4. Open browser devtools accessibility panel: verify each tab shows "selected: true/false" correctly and the active tab is announced as "tab, selected, 1 of 3".
5. Repeat for `/league` and `/inbox`.

### P1-5 — match aria-live

1. Navigate to a played match page (`/match/[id]`).
2. Open a screen reader (VoiceOver: ⌘+F5; NVDA on Windows).
3. Click "Reproducir en vivo" → as goals/cards appear, the screen reader should announce them as they happen (e.g., "37'. Gol. Juan Pérez"). It should NOT re-read the entire event list each tick.

### P1-6 — balance signal

1. Start a playthrough that has negative or low balance (≤ 50 €K).
2. Inspect topbar: balance shows ⚠ icon + the number, in red/warning color.
3. Hover the balance: tooltip / aria-label should read "Balance crítico: -X mil euros. Ver finanzas." (or "Balance bajo:" depending on tier).
4. Reduce color from OS settings (macOS: System Settings → Accessibility → Display → Reduce Transparency, or use Safari "Smart Invert") → the ⚠ icon should still be visible (color-independent signal).

---

## P2 findings — Polish backlog candidates (not addressed this sprint)

From the source audit:

- P2-1: skip-link to main content (currently no quick keyboard jump to skip nav)
- P2-2: heading level audit (some pages skip from h1 to h3)
- P2-3: form labels for sponsor offer Accept/Reject buttons (currently button text is meaningful but no explicit `<label>` on the form group)

These are tracked for a future Polish sprint. Not blocking Sprint 11 close.

---

## Verdict

**CONDITIONAL PASS** — automated structural guards in place (21 new tests).
Pablo manual walkthrough sign-off pending (~5 min keyboard pass). Once
that's done, the A11y audit moves from CONDITIONAL PASS WCAG 2.1 AA to
PASS for the P0+P1 scope.

The 3 P2 findings remain as Polish-phase backlog for a future sprint.

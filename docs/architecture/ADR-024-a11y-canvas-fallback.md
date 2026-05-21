# ADR-024: A11y Fallback for Canvas-Only Views

## Status

Proposed (v1.1 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | Accessibility |
| **Knowledge Risk** | LOW |
| **References Consulted** | WCAG 2.1 AA, ADR-021 (canvas pipeline), isometric-world.md §3.8, §5.7 |

## Context

The MVP commits to WCAG 2.1 AA. v1.1 introduces canvas — which is opaque
to assistive technologies by default (screen readers see "canvas, no
content").

Two failure modes if we don't address this:

1. Users with screen readers can't interact with /stadium, /match-live,
   /city views at all — regression from MVP
2. Users with motion sensitivity (reduce-motion preference) get jarring
   animations they can't opt out of

We need an explicit fallback strategy that doesn't compromise the
canvas experience for everyone else.

## Decision

### D1. DOM-equivalent view for every canvas route

For every canvas route (`/stadium`, `/match-live`, `/city`), there is a
corresponding DOM-only path that surfaces the same information textually:

- `/stadium` → canvas. `/stadium?view=text` → DOM-only list.
- Same data, same actions, no canvas required.

The DOM view is NOT a degraded UX — it's a first-class equivalent. It's
also useful for SEO, slow devices, and Lighthouse audits.

### D2. Default decision: prefers-reduced-motion + user choice

The renderer mode (per isometric-world.md §3.8) considers:

1. CSS `prefers-reduced-motion: reduce` → default to `text` view
2. localStorage user override → respect always
3. Else → canvas mode (with auto-downgrade per perf detection)

The DOM/canvas toggle is also exposed in the user settings panel.

### D3. ARIA live-region for events

Tier transitions ("Tu club ha alcanzado el Tier 3") fire a DOM toast
inside a `role="status" aria-live="polite"` region. Screen readers
announce regardless of canvas/DOM mode.

For match-live in canvas mode: each match event (goal, red card, sub)
also pushes a line to an `aria-live="polite"` region. Screen readers
narrate the match.

### D4. Keyboard parity

In canvas mode: every action available via mouse is also available via
keyboard (Tab + Enter + arrow keys). See ADR-023 §D3.

In DOM mode: standard form/list navigation.

### D5. Color + contrast

All visual cues (tier badge colors, weather tints, focus rings) meet
WCAG 2.1 AA contrast. The day-night tint MUST NOT push any text below
contrast threshold — text is rendered in DOM overlays (per ADR-023)
which are unaffected by canvas tint.

### D6. Audit cadence

Each v1.1 sprint that ships a canvas feature includes:

- axe-core run against the DOM-equivalent view
- Manual keyboard walkthrough recorded
- Screen reader test (VoiceOver / NVDA) — short pass

Failures block merge.

## DOM-equivalent view example

For `/stadium?view=text`:

```html
<main>
  <h1>Estadio del Cascada FC</h1>

  <section aria-labelledby="tier-h">
    <h2 id="tier-h">Nivel actual: Tier 3 — Club Establecido</h2>
    <ul>
      <li>Capacidad del estadio: 8 000 asientos</li>
      <li>Estado del campo: césped completo</li>
      <li>Iluminación nocturna: instalada</li>
      <li>Ciudad alrededor: barrio remodelado, iluminación funcional</li>
    </ul>
  </section>

  <section aria-labelledby="actions-h">
    <h2 id="actions-h">Acciones</h2>
    <ul>
      <li><a href="/manager-office">Despacho del manager</a></li>
      <li><a href="/match">Próximo partido</a></li>
    </ul>
  </section>

  <p>
    <button onclick={() => switchToCanvas()}>Cambiar a vista isométrica</button>
  </p>
</main>
```

## Alternatives Considered

### A1. Canvas with ARIA-injected meta

REJECTED — canvas is fundamentally a single opaque element to AT. Some
libraries inject DOM siblings to describe canvas content, but
maintaining sync is fragile. DOM-equivalent route is cleaner.

### A2. SVG instead of canvas (SVG IS accessible)

REJECTED — SVG performs poorly with 4096+ sprites; perf trade-off too
heavy. PixiJS for vis, DOM for a11y is the pragmatic combination.

### A3. Skip a11y for canvas routes (MVP regression)

REJECTED — explicit commitment to WCAG 2.1 AA in MVP. Can't regress.

## Consequences

### Positive

- WCAG 2.1 AA maintained
- DOM-equivalent is also a slow-connection / SEO benefit
- prefers-reduced-motion users get a fast, calm experience
- Screen reader users have first-class access

### Negative

- Each canvas feature has DUAL rendering paths (canvas + DOM-list)
- More test surface (both modes must work)

### Mitigations

- The DOM-equivalent is mostly auto-derivable from `worldState` data
- Shared component for "tier description list" used by both DOM-mode
  and canvas-mode tooltip
- Lighthouse + axe-core run on every PR via CI

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.1 #20 | Routing setup: `/stadium` + `/stadium?view=text` |
| v1.1 #21 | DOM-equivalent skeleton for /stadium |
| v1.1 #22 | aria-live region for tier transitions |
| v1.1 #27 | Match-live narration in DOM aria-live |
| v1.1 #28 | Final a11y audit + axe-core PASS |

## References

- WCAG 2.1 AA
- ADR-021 (canvas pipeline)
- ADR-023 (DOM↔Canvas event router)
- isometric-world.md §3.8, §5.7
- `production/qa/a11y-audit-2026-05-21.md` (baseline)

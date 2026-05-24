# ADR-023: DOM ↔ Canvas Event Router

## Status

Proposed (v1.1 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack |
| **Domain** | Frontend / Input handling / A11y |
| **Knowledge Risk** | LOW |
| **References Consulted** | ADR-012 (UI architecture), ADR-017 (UI input control taxonomy), isometric-world.md §3.7 |

## Context

The Svelte page hosting `<PixiCanvas>` has both:

- **DOM elements**: form controls, modals, tooltips, navigation buttons
- **Canvas content**: tiles, buildings, NPCs (PixiJS)

Native browser event model treats the `<canvas>` element as a single
opaque target. We need a clear protocol for:

1. Click on a tile → which Svelte handler runs?
2. Hover on a building → who renders the tooltip (DOM or canvas)?
3. Keyboard focus — does Tab cycle through canvas elements?
4. Click outside the canvas (in a DOM modal) — does canvas know to deselect?

Without an explicit protocol, behavior diverges per component and a11y
breaks.

## Decision

### D1. Single Svelte-owned event boundary

The `<PixiCanvas>` component owns ALL canvas-side input handling. It
exposes Svelte-friendly callbacks:

```svelte
<PixiCanvas
  onTileClick={(coord, building) => ...}
  onTileHover={(coord, building) => ...}     // throttled to ~16ms
  onTileFocus={(coord) => ...}                // keyboard arrow nav
  onCanvasBlur={() => ...}                    // mouse left or Tab out
/>
```

The component internally:

- Attaches PIXI `pointerdown`/`pointermove` to layers/sprites
- Translates screen coords to tile coords
- Identifies the building at that tile from a `buildingsAtTile` map
- Calls the appropriate callback

Svelte handlers MUST be pure user-event handlers — no canvas-specific
imperatives. They typically: dispatch a Svelte 5 `$state` change, call
`goto()`, or open a modal.

### D2. Tooltips render in DOM, NOT canvas

Tooltips are HTML elements positioned absolutely. Pattern:

```svelte
{#if hoveredBuilding}
  <div
    class="tooltip"
    style="left: {hoveredCanvasPos.x}px; top: {hoveredCanvasPos.y}px"
  >
    {hoveredBuilding.name}: {hoveredBuilding.description}
  </div>
{/if}
```

Why DOM:
- A11y: screen readers see tooltips
- Styling: reuses Tailwind + DaisyUI
- Easier to debug
- Cost: position has to be updated on canvas pan/zoom — manageable

### D3. Keyboard navigation: 2 modes

**Mode A — Canvas-active**: when canvas has focus (clicked on it or
tabbed in):

- Arrow keys move the cursor across tiles (visual selection ring)
- Enter "activates" the focused tile (same as click)
- Tab exits the canvas to the next DOM element
- Esc deselects + blurs canvas

**Mode B — DOM-active**: when canvas doesn't have focus, no canvas
keyboard handlers fire. Standard DOM tabbing.

Implementation: PixiCanvas root container has `tabindex="0"` and
listens for keydown when focused. Cursor ring is a PIXI sprite.

### D4. A11y mode skips canvas event routing entirely

When a11y mode is active (per ADR-024), the canvas isn't rendered. The
DOM-equivalent view (list of buildings with their states) takes over.
Its event handling is plain DOM.

### D5. Click outside canvas does NOT auto-deselect

If a DOM modal opens (e.g., "Hire staff" dialog), the canvas keeps its
current selection. Reason: modal is transient; user expects to return
to the same canvas state.

If a route navigation happens (e.g., `goto('/squad')`), the canvas unmounts
naturally — selection is lost. This is expected.

### D6. Touch gestures (v1.1 partial — v1.3 full)

v1.1 supports:

- Tap = click
- Drag = pan
- Two buttons for zoom (no pinch)

v1.3 adds:

- Pinch zoom
- Two-finger drag (mobile camera)
- Long-press (alternative to right-click for context menu)

## Alternatives Considered

### A1. Render tooltips inside PIXI

REJECTED — PIXI Text rendering is fine but tooltips need rich HTML
(emoji icons, formatted strings), CSS theming consistency, screen
reader access. Cost-of-rendering not worth it.

### A2. Use a 3rd-party event router (interact.js)

REJECTED — extra dependency for marginal gain. PixiJS native pointer
events + a thin Svelte wrapper are sufficient.

### A3. Canvas captures ALL events including keyboard globally

REJECTED — breaks DOM modal interaction (user can't type in form
inputs without canvas eating arrow keys).

## Consequences

### Positive

- One predictable surface for canvas interaction
- A11y compatible (canvas is just one tabstop; DOM tooltips legible)
- Tooltip styling matches the rest of the app

### Negative

- Tooltip position updates on pan/zoom — extra Svelte effect

### Mitigations

- Throttle pointermove + RAF the tooltip position update
- If perf becomes an issue, switch to PIXI tooltips (revisit ADR)

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.1 #21 | PixiCanvas root + tabindex + keyboard cursor |
| v1.1 #21 | onTileClick/onTileHover callbacks wired |
| v1.1 #21 | First DOM tooltip integration |
| v1.1 #28 | Touch gestures partial (tap + drag) |

## References

- ADR-012 (UI architecture)
- ADR-017 (UI input control taxonomy)
- ADR-021 (canvas rendering pipeline)
- ADR-024 (a11y fallback)
- isometric-world.md §3.7

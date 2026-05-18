# ADR-012: UI Architecture — DOM ↔ Canvas Frontier

## Status
Accepted

## Date
2026-05-16 (Proposed) → 2026-05-16 (Accepted, post-architecture-review run 2)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | UI (SvelteKit 2 + Svelte 5 runes ↔ PixiJS 8) |
| **Knowledge Risk** | HIGH — Svelte 5 runes API (`$state`, `$derived`, `$effect`, `$state.raw`) is post-LLM-cutoff. PixiJS 8 MEDIUM risk (renderer rewrite). All patterns cross-referenced against engine-reference library. |
| **References Consulted** | `docs/engine-reference/web/modules/frontend.md`, `docs/engine-reference/web/modules/web-game-patterns.md`, `docs/engine-reference/web/VERSION.md` |
| **Post-Cutoff APIs Used** | `$state.raw<T>()` (Svelte 5 runes — prevents deep proxy on PixiJS instances); `$effect()` (Svelte 5 — replaces `$:` reactive statements); `onMount` synchronous + `.then()` cleanup pattern (Svelte 5 lifecycle) |
| **Verification Required** | Verify `onMount` cleanup fires on page component destroy; verify PixiJS canvas renders behind DOM panels on all target browsers; verify `resizeTo: canvas.parentElement` handles window resize correctly on mobile (portrait → landscape); verify no stacking context bleed from layout parents |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (SvelteKit 2 + Svelte 5 — framework), ADR-006 (PixiJS 8 Application — established `$state.raw` pattern, v8 destroy API), ADR-008 (AdvanceResult — the primary game state payload that drives HUD updates), ADR-009 (Socket.IO `staff:messages-ready` — drives inbox panel updates) |
| **Enables** | `hud-ui.md` GDD (can now specify HUD panel components with correct z-layer), `isometric-world.md` GDD (can now specify PixiJS rendering in canvas layer) |
| **Blocks** | Epic hud-ui — cannot start without this ADR Accepted; Epic isometric-world |
| **Ordering Note** | ADR-012 Accepted → hud-ui.md GDD + isometric-world.md GDD (can be written in parallel). Both GDDs depend on the z-layer system and bridge pattern defined here. |

## Context

### Problem Statement

The game combines a PixiJS 8 isometric world (GPU-rendered, sprite-based) with a SvelteKit management UI (DOM-based, reactive, accessible). Without a defined frontier, implementers will independently make inconsistent decisions about what lives where, how Svelte 5 reactive state updates the PixiJS world, how DOM panels overlay the canvas, and what the z-index system looks like. These inconsistencies compound quickly across the HUD, decision panels, inbox, standings, and the world view.

The architecture review (2026-05-16) identified this as Priority 5 gap, blocking `hud-ui.md` and `isometric-world.md` GDDs.

### Constraints

- **Svelte 5 HIGH risk**: runes API (`$state`, `$state.raw`, `$effect`) replaced `let` reactivity and `$:` statements. All patterns cross-referenced against `engine-reference/web/modules/frontend.md`.
- **PixiJS 8 MEDIUM risk**: renderer rewrite; v8 patterns differ from v7. `$state.raw` prevents proxy corruption of PixiJS internals (established in ADR-006).
- **`onMount` cleanup pattern**: `onMount(async () => ...)` does NOT register the cleanup function in Svelte — the `Promise` return replaces the cleanup. Must use synchronous `onMount(() => { ...; a.init(...).then(() => app = a); return () => a.destroy(...); })`.
- **PixiJS bundle size**: must be code-split via dynamic import (`await import('pixi.js')`) — not in the initial SvelteKit bundle (500kb budget, technical-preferences.md).
- **Mobile PWA at 375px min-width**: panels must be functional at minimum width. Management UI is the primary interaction surface on mobile.
- **Pilar 2 "The World Is The Scoreboard"**: the isometric world must always be visible — even on mobile, the canvas should peek behind panels (bottom sheet, not full-screen modal).
- **Pilar 4 "Calm Is The Tempo"**: no animations faster than 200ms for panel transitions.

### Requirements

- Clear frontier rule: what goes in DOM vs canvas
- `$state<GameState>` (reactive) drives DOM panels; `$state.raw<Application>` holds PixiJS instance
- `$effect` bridges reactive state to imperative PixiJS world updates
- PixiJS canvas always behind DOM (z-index 0)
- Z-index layer system for DOM: HUD (10), panels (20), modals (30), toasts (40), loading (50)
- Mobile: panels as bottom sheets (max 60dvh), canvas visible above
- Desktop: panels as sidebars or floating windows (optional — layout is UX GDD territory)
- `pointer-events: none` on ambient HUD so canvas events pass through; interactive HUD elements override to `pointer-events: auto`
- No stacking context created by parent layout components (no `transform`, `filter`, `will-change`, `isolation: isolate` on layout wrappers)

## Decision

**Full-bleed PixiJS canvas at z-index 0 (fixed positioning). All management UI in Svelte 5 DOM at z-index 10+. State bridge: `$state<GameState>` → `$effect` → imperative PixiJS calls. Mobile panels as bottom sheets. PixiJS loaded via dynamic import for code-splitting.**

### Frontier Rules

| Content Type | Layer | Rendering System | Reason |
|---|---|---|---|
| Isometric world tiles, terrain | Canvas (PixiJS) | GPU-accelerated sprite batch | Frame-by-frame animation |
| City buildings, stadium sprites | Canvas (PixiJS) | Sprite layers, state variants | GPU, many draw objects |
| People/NPCs, animations | Canvas (PixiJS) | Animated sprites | 60fps smooth motion |
| Day/night overlay, weather | Canvas (PixiJS) | Color filter layer | Shader-level effect |
| Tile hover highlight | Canvas (PixiJS) | Graphics overlay | Tight to render loop |
| HUD: week, finances, next event | DOM z-10 | Svelte 5 component | Text, a11y, reactive |
| Decision panels (actions) | DOM z-20 | Svelte 5 component | Forms, lists, complex UI |
| Inbox: staff messages | DOM z-20 | Svelte 5 component | Scrollable list, text |
| League table, standings | DOM z-20 | TanStack Table in Svelte | Sortable table, reactive |
| Modals: confirmations, level-up | DOM z-30 | Svelte 5 dialog | Focus trap, a11y |
| Toast/notification banners | DOM z-40 | Svelte 5 component | Ephemeral, timed |
| Advance processing overlay | DOM z-50 | Svelte 5 component | Full-screen blocking |

**Exception**: PixiJS may render lightweight in-world notification sprites (e.g., a goal-scored "+1" bubble over the stadium sprite). These are purely visual decorations — not interactive UI. All interactive elements, text inputs, and accessible controls are DOM-only.

### Architecture Diagram

```
Browser viewport
┌─────────────────────────────────────────┐
│ z-50: Loading / Advance overlay          │ DOM fixed
│ z-40: Toast notifications                │ DOM fixed
│ z-30: Modals (confirm, level-up)         │ DOM fixed
│ z-20: Management panels (bottom sheet)   │ DOM fixed
│ z-10: HUD (week, finances, next event)   │ DOM fixed, pointer-events:none on container
│ z-0:  PixiJS canvas (full-bleed)         │ Canvas, always behind DOM
└─────────────────────────────────────────┘

Mobile bottom sheet: panel slides up from bottom
└── max-height: 60dvh (canvas visible above)

Desktop sidebar: panel fixed on right/left
└── canvas still occupies full viewport behind
```

### Key Interfaces

```typescript
// packages/shared/src/types/ui.ts

// Payload passed from Svelte $state to PixiJS world update function
export interface WorldUpdatePayload {
  worldState: Record<string, number>;  // WorldState snapshot (ADR-003) for sprite variants
  currentWeek: number;
  currentSeason: number;
  timeOfDay?: 'day' | 'night' | 'dusk';  // drives day/night cycle rendering
}

// PixiJS tile click events bubbled up to Svelte $state (via callback, not CustomEvent)
export interface TileInteractionEvent {
  type: 'tile:click' | 'tile:hover';
  tileId: string;
}

// Z-index layer constants — enforced by convention in every component
export const UI_LAYERS = {
  CANVAS: 0,
  HUD: 10,
  PANEL: 20,
  MODAL: 30,
  TOAST: 40,
  OVERLAY: 50,
} as const satisfies Record<string, number>;

export type UILayerKey = keyof typeof UI_LAYERS;
```

### Svelte Component Pattern (corrected — synchronous onMount)

```svelte
<!-- apps/web/src/routes/game/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Application } from 'pixi.js';

  // $state.raw: prevents Svelte deep proxy from wrapping PixiJS internals (ADR-006)
  let canvas: HTMLCanvasElement;
  let app = $state.raw<Application | null>(null);

  // Reactive game state — drives all DOM panels
  let gameState = $state<GameState | null>(null);
  let activePanelId = $state<string | null>(null);

  // DOM↔Canvas bridge.
  // Note: this $effect fires twice on initial mount:
  //   1st fire: app === null → early return (no-op)
  //   2nd fire: app assigned after init() resolves → updateWorld() called
  // This double-fire is intentional and safe. Do not add app to a skip list.
  $effect(() => {
    if (!app || !gameState) return;
    updateWorld(app, {
      worldState: gameState.worldState,
      currentWeek: gameState.currentWeek,
      currentSeason: gameState.currentSeason,
    } satisfies WorldUpdatePayload);
  });

  // CRITICAL: onMount must be SYNCHRONOUS to register the cleanup function.
  // An `async onMount` returns a Promise — Svelte treats it as a non-function
  // return value and silently skips cleanup. Use .then() instead of await.
  onMount(() => {
    // Dynamic import: PixiJS is NOT in the initial bundle (code-split per bundle budget)
    import('pixi.js').then(async ({ Application }) => {
      const a = new Application();
      await a.init({ canvas, resizeTo: canvas.parentElement! });
      // ... initialize world layers, sprites, event listeners ...
      app = a;
    });

    // Cleanup: registered synchronously — fires on component destroy even if init is in-flight
    return () => {
      if (app) {
        // ADR-006 destroy pattern — v8 single options object (NOT the v7 two-arg form)
        app.destroy({ removeView: true, children: true, texture: false, textureSource: false });
      }
    };
  });
</script>

<!-- Canvas layer: fixed, full-screen, behind all DOM (z-0) -->
<div class="fixed inset-0 z-0">
  <canvas bind:this={canvas} class="w-full h-full" />
</div>

<!-- HUD: always visible, pointer-events:none on container so canvas events pass through.
     Individual interactive elements MUST override with class="pointer-events-auto" -->
{#if gameState}
  <div class="fixed top-0 inset-x-0 z-10 pointer-events-none">
    <HUD
      week={gameState.currentWeek}
      nextEvent={gameState.nextEventPreview}
      finances={gameState.finances}
    />
  </div>
{/if}

<!-- Active management panel: bottom sheet (mobile) / sidebar (desktop) -->
{#if activePanelId}
  <div class="fixed bottom-0 inset-x-0 z-20 max-h-[60dvh]
              lg:inset-y-0 lg:left-auto lg:right-0 lg:w-96 lg:max-h-none">
    <DecisionPanel
      panelId={activePanelId}
      {gameState}
      onClose={() => (activePanelId = null)}
    />
  </div>
{/if}
```

### CSS / Layout Constraints (must not violate)

1. **No stacking context on layout parents**: `+layout.svelte` must not apply `transform`, `filter`, `will-change`, or `isolation: isolate` to its wrapper. These CSS properties create a new stacking context that clips all z-index values to that subtree — making it impossible for `z-50` children to appear above `z-0` siblings in another subtree.

2. **`pointer-events: none` cascades to children**: Any DOM element wrapped with `pointer-events-none` has all child elements also non-interactive. HUD interactive elements (buttons, pause, help) must explicitly add `pointer-events-auto` class or be siblings of the non-interactive wrapper, not children.

3. **`dvh` units for mobile**: Use `100dvh` (dynamic viewport height) not `100vh` for full-height mobile layouts. On iOS Safari, `100vh` includes the address bar height — `100dvh` responds to the actual visible viewport.

4. **Canvas resize**: `resizeTo: canvas.parentElement!` is non-null asserted because the canvas is always mounted inside the fixed div at init time. If the canvas is ever conditionally rendered (wrapped in `{#if}`), the assertion becomes unsafe — use optional chaining and a fallback to `window` instead.

## Alternatives Considered

### Alternative 1: Split layout — canvas left, panels right
- **Description**: Canvas occupies ~60-70% on the left; DOM panels permanently occupy ~30-40% on the right.
- **Pros**: No z-index complexity; clear spatial separation. Simpler to implement.
- **Cons**: The world is no longer "full-bleed" — violates Pilar 2 ("The World Is The Scoreboard"). On mobile, split layout reduces both canvas and panel to unusable sizes at 375px.
- **Rejection Reason**: Pilar 2 demands the isometric world be dominant. Full-bleed canvas + overlay panels achieves this at all screen sizes.

### Alternative 2: All UI in PixiJS canvas
- **Description**: Management panels, HUD, tables rendered as PixiJS UI elements inside the canvas.
- **Pros**: Maximum visual consistency; no z-index management; true single rendering context.
- **Cons**: PixiJS has no native form/input/table rendering. Text rendering in WebGL is significantly more complex than HTML. No accessibility (no semantic HTML, no ARIA, no keyboard navigation for DOM elements). Touch input on complex forms in canvas is notoriously unreliable.
- **Rejection Reason**: This is a management game with complex forms and tables. HTML/CSS/Svelte handles forms and tables vastly better than canvas. Accessibility is non-negotiable.

### Alternative 3: DOM-only (no canvas)
- **Description**: The isometric world is also DOM/HTML+CSS, no PixiJS.
- **Pros**: Uniform technology; no DOM↔Canvas boundary at all.
- **Cons**: Isometric tile rendering with animated sprites and day/night cycles at 60fps is not achievable at scale with DOM alone. ADR-006 already committed to PixiJS 8.
- **Rejection Reason**: ADR-006 is Accepted. PixiJS 8 is the rendering engine for the isometric world.

## Consequences

### Positive
- Clear frontier rule: implementation never requires judgment about "does this go in DOM or canvas?"
- `$state<GameState>` as the single source of truth: DOM panels and PixiJS world both derive from the same state
- Standard HTML/CSS/Svelte for all management UI: accessibility, forms, tables, keyboard navigation work without custom implementations
- PixiJS canvas always visible behind panels: Pilar 2 preserved at all screen sizes
- Dynamic import of PixiJS: not in initial bundle, satisfying the 500kb bundle budget

### Negative
- `$effect` bridge fires imperatively: if `updateWorld()` is slow, it runs synchronously on every `gameState` change. Must be fast (the function receives already-computed state, not perform simulation)
- `onMount` synchronous pattern with `.then()` is less readable than `async/await` — requires developer education (enforced by this ADR + comment in code)
- Any parent layout that accidentally adds `transform` CSS will silently break z-ordering

### Risks
- **R1 — `$effect` over-firing**: `gameState` being a large `$state` object means any field change re-runs `updateWorld()`. **Mitigation**: Use `$derived` to extract only the canvas-relevant fields (`worldState`, `currentWeek`) and pass the derived value to the effect, not the full `gameState`.
- **R2 — Stacking context violation**: A developer adds `transition: all` or `transform: translateZ(0)` to `+layout.svelte` for animation performance. **Mitigation**: Add a lint rule or comment block in `+layout.svelte` explicitly forbidding these properties. Document in the Negative Consequences.
- **R3 — PixiJS init race**: If the user navigates away before `a.init()` resolves, cleanup fires (returns from `onMount`) before `app` is set. **Mitigation**: The cleanup checks `if (app)` before calling destroy. The partially initialized PixiJS Application is garbage collected normally.
- **R4 — `60dvh` panel on very small devices**: On devices shorter than 500px (very small phones), 60dvh may not provide enough height for complex panels. **Mitigation**: UX GDD (`hud-ui.md`) defines minimum panel content requirements; panels should be scrollable within the 60dvh container.
- **R5 — PixiJS canvas pointer events**: PixiJS events (tile clicks) and DOM events compete for pointer attention. When a DOM panel is open and covers part of the canvas, touches on the panel area must not reach the canvas. **Mitigation**: Standard CSS behavior — DOM elements with `pointer-events: auto` (default) intercept events in their area. No special handling needed; the browser event model handles layering correctly.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | "Mundo isométrico vivo" as the primary world canvas | Canvas full-bleed at z-0; always visible behind panels |
| game-concept.md | Pilar 2: "The World Is The Scoreboard" — world always visible | Bottom sheet pattern (60dvh) keeps canvas visible on mobile |
| game-concept.md | "Abrir panel de decisión" — management UI in 30s loop | DOM panels at z-20 defined; frontier rules enable GDD authoring |
| game-concept.md | "UI híbrida menu + spatial" (DR2) | Explicit hybrid: spatial = canvas, menu = DOM. Clear assignment rule. |
| game-concept.md | Mobile PWA functional at 375px | Bottom sheet + 60dvh cap; `dvh` units for mobile viewport accuracy |
| game-concept.md | Pilar 4: "Calm Is The Tempo" | No animation >200ms for panel transitions (enforced in hud-ui.md GDD) |
| game-concept.md | "Anticipated event HUD" retention hook | HUD at z-10 (always visible) reads from AdvanceResult.nextEventPreview |

## Performance Implications

- **CPU**: `$effect` bridge runs `updateWorld()` on each `gameState` change. Using `$derived` for canvas-relevant fields caps this to only when world-visible state changes. Target: `updateWorld()` < 2ms per call.
- **Memory**: PixiJS Application + world textures loaded once, alive for the page session. DOM panels are rendered/destroyed on toggle (Svelte `{#if}` removes DOM nodes). No memory accumulation.
- **Load Time**: PixiJS (~1.5MB compressed) is code-split via dynamic import — loads only on the `/game` route, not on auth or landing pages.
- **Network**: No network impact from UI architecture choices.

## Migration Plan

No existing code to migrate. New patterns.

1. Apply `onMount` synchronous pattern (not `async`) everywhere PixiJS is initialized
2. Ensure `+layout.svelte` does not apply stacking-context-creating CSS
3. Establish `UI_LAYERS` constant as import in all DOM components that set `z-index`
4. Code-split PixiJS: remove any top-level `import { Application } from 'pixi.js'` — use dynamic import in `onMount` only
5. Create `updateWorld(app, payload)` function in `apps/web/src/lib/pixi/world.ts` as the canonical DOM→Canvas bridge

## Validation Criteria

- Canvas renders behind all DOM panels at correct z-index in Chrome, Firefox, and Safari (latest 2 versions).
- Navigating away from `/game` route destroys the PixiJS Application (no memory leak). Verified by browser DevTools heap snapshot.
- PixiJS bundle is absent from the initial JS bundle (`/` landing page). Verified by `npm run build` bundle analysis.
- On a 375px × 812px viewport (iPhone-sized), the decision panel opens as a bottom sheet with max-height 60dvh; the isometric canvas is visible above the panel.
- `updateWorld()` executes in < 2ms on a mid-range mobile device.
- HUD interactive elements (buttons) receive click events despite `pointer-events-none` on the HUD container — verified by adding `pointer-events-auto` to specific button elements.

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — SvelteKit 2 + Svelte 5 framework
- [ADR-006](ADR-006-isometric-rendering.md) — PixiJS 8 Application setup, `$state.raw` pattern, v8 destroy API
- [ADR-008](ADR-008-world-clock-event-loop.md) — `AdvanceResult` contains `nextEventPreview` displayed in HUD (z-10)
- [ADR-009](ADR-009-staff-message-routing.md) — `staff:messages-ready` Socket.IO event updates the inbox panel (z-20)
- `hud-ui.md` GDD (future) — specifies HUD component content, panel layouts, interaction patterns within the z-layer system defined here
- `isometric-world.md` GDD (future) — specifies PixiJS world rendering, tile interaction, state variant sprites within the canvas layer defined here

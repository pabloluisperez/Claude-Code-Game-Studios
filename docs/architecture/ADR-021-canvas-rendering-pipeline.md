# ADR-021: Canvas Rendering Pipeline (PixiJS 8)

## Status

Proposed (v1.1 design draft — autopilot 2026-05-21)

## Date

2026-05-21 — created during Sprint 14 closeout, ahead of v1.1 unlock.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Frontend / Rendering / Performance |
| **Knowledge Risk** | MEDIUM — PixiJS 8 has API breaking changes from v7 |
| **References Consulted** | ADR-006 (PixiJS choice — reactivated), Art Bible §3, isometric-world.md, city-progression.md |
| **Post-Cutoff APIs Used** | PixiJS 8 new asset loader, WebGL 2 paths |
| **Verification Required** | Spike completed in v1.0.x Sprint 18 must produce >50fps on target mobile device |

## Supersedes

ADR-006 stays Accepted (stack choice), but this ADR defines *how* to implement.

## Context

v1.1 introduces canvas rendering for Pillar B (Mundo Isométrico Vivo). The
existing MVP is DOM-only. We need a clear architecture for:

1. How PixiJS coexists with SvelteKit + Svelte 5 runes
2. How canvas state stays in sync with WorldState (server-authoritative)
3. How asset loading is lazy + budget-respected
4. How rendering can be downgraded for low-end devices

Without this ADR, each component will reinvent integration patterns and we
risk creating a hard-to-maintain canvas/DOM boundary.

## Decision

### D1. PixiJS 8 as canvas engine

Re-affirm ADR-006 choice. Upgrade to PixiJS 8 (current latest stable family).
v8 brings: new asset loader (`Assets.load`), simpler scene graph, better
TypeScript types, smaller bundle when tree-shaken.

### D2. Component pattern: `<PixiCanvas>` Svelte 5 wrapper

A single Svelte component wraps a PIXI.Application. Key choices:

- `$state.raw` para la PIXI.Application instance (no proxying — PixiJS
  internals are not Svelte reactive-friendly)
- Lifecycle: `onMount` creates app, `onDestroy` calls `app.destroy(true)`
- Props are reactive Svelte inputs; mutations apply via effects (`$effect`)
- Children of `<PixiCanvas>` are NOT Svelte children — they're PIXI display
  objects added via a small DSL or imperative methods

```svelte
<PixiCanvas
  width={800}
  height={600}
  worldState={data.worldState}
  cityTier={data.tier}
  onTileClick={(coord) => goto(`/stadium/tile/${coord.x}-${coord.y}`)}
/>
```

### D3. State sync: read-only, server-authoritative

The canvas ONLY reads WorldState. It NEVER mutates. Pattern:

```
Server (Hono + Drizzle)
  → /api/world/state (HTTP GET)
  → Svelte +page.server.ts loads as `data.worldState`
  → Page passes to <PixiCanvas worldState={data.worldState} />
  → PixiCanvas applies via $effect: when worldState changes, schedule re-render
```

NO Socket.IO push to canvas in v1.1. v1.3 may add live-updates via Socket.IO
for MMO trajectory.

### D4. Asset pipeline

- Source: `assets/atlases/` (PNG + JSON manifest, TexturePacker-compatible)
- Build: vite plugin generates a manifest of available atlases at build time
- Runtime: `apps/web/src/lib/canvas/asset-loader.ts` exposes
  `loadTierAtlas(tier: 1..4): Promise<Spritesheet>` with HTTP cache
- Lazy loading: tier T2+ atlases loaded on demand when `worldState.cityTier`
  reaches the tier (effect in PixiCanvas component)

Atlas size budget per ADR-014 (TBD) + isometric-world.md AC-ISO-16: < 1.5MB
total compressed.

### D5. Scene graph organization

```
app.stage
├── backgroundLayer        (sky / tint)
├── terrainLayer           (tile floor)
├── buildingsLayer         (static buildings)
├── propsLayer             (props, signs)
├── actorsLayer            (NPCs, manager sprite)
├── crowdLayer             (match-day only)
├── weatherLayer           (rain overlay)
├── lightingLayer          (day-night tint)
└── uiOverlayLayer         (toasts, click feedback)
```

Each layer is a PIXI.Container. Depth sorting per isometric-world.md §4.3.

### D6. Performance mode detection

Per isometric-world.md §3.8: 5s measurement window → auto-classify
high/medium/low/dom-fallback. Persisted in localStorage. User override
in settings panel.

### D7. DOM coexistence

PixiCanvas is one component in a Svelte page. Around it: regular DOM UI
(controls, panels, modals). DOM↔Canvas event routing per ADR-023.

PixiCanvas takes a specific viewport (e.g., `<div class="canvas-area">`).
It NEVER renders full-screen.

## Alternatives Considered

### A1. Three.js (3D)

REJECTED — Art Bible commits to 2D isometric. 3D engine overhead unjustified.

### A2. Custom WebGL with regl / twgl

REJECTED — PixiJS abstracts the WebGL boilerplate we don't want to maintain
solo. v8 is mature.

### A3. Phaser

REJECTED — Phaser is game-loop-oriented; we want a low-friction sprite
renderer that coexists with management UI, not a full game framework.

### A4. Canvas2D (no WebGL)

CONSIDERED for fallback mode. Decision: not implemented in v1.1; if WebGL
unavailable, go straight to DOM fallback (simpler than maintaining a third
render path).

## Consequences

### Positive

- Single rendering tech across v1.1+; no fragmentation
- PixiJS 8 has good TypeScript types and tree-shaking
- Server-authoritative pattern protected (canvas is consumer only)
- Asset budget enforced at build time

### Negative

- PixiJS 8 has post-cutoff API surface — knowledge gap for solo dev
- Bundle size grows by ~100KB compressed (PixiJS core) — acceptable per
  isometric-world.md §10 budget
- Two mental models (DOM Svelte runes, PIXI imperative) — onboarding cost

### Mitigations

- Spike in v1.0.x Sprint 18 validates PixiJS 8 patterns before committing
- Bundle budget enforced in CI; if PixiJS exceeds, defer adoption
- Document the PIXI patterns in `docs/engine-reference/web/pixijs-patterns.md`
  during Sprint 19

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.0.x #18 | Spike — bundle size + perf validated |
| v1.1 #20 | `<PixiCanvas>` component skeleton + first tile renders |
| v1.1 #21 | Asset loader + atlas T1 lazy-load |
| v1.1 #22 | Tier 1 fully rendered |
| v1.1 #28 | All tiers + a11y fallback shipped |

## References

- ADR-006 (PixiJS isometric — stack choice)
- ADR-012 (UI architecture DOM↔Canvas — supersedes for canvas-side)
- Art Bible §3 (tile size 32×16)
- isometric-world.md (this ADR implements)
- city-progression.md (consumer of this pipeline)

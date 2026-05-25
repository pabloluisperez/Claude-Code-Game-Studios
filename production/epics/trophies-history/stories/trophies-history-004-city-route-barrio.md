---
Story: TROPHIES-HISTORY-004
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: UI
GDD Requirement: AC-TH-01/02/03/22
Governing ADR: ADR-030 §D1, ADR-021, ADR-023
Control Manifest: 2026-05-19
Test Evidence: apps/web/src/routes/city/+page.svelte (manual walkthrough); svelte-check 0 errors; web tests 220/220 (no regression)
ImplementedAt: apps/web/src/routes/city/+page.svelte (full rewrite, DOM-first) + apps/web/src/routes/city/+page.server.ts (loads /api/museum/contents)
Deviation: PixiJS BarrioScene + canvas-based scene swap deferred to v1.2+. v1.1 ships a DOM-first museum (fully accessible by default, mobile-friendly). Stories 23-4/5/6 merged into one delivery.
---

# Story: /city route refactor — barrio scene (museum + stadium ext + manager office ext)

## Goal

Refactor the SvelteKit `/city` route from its current state (likely placeholder or old city-progression intent) to render the **barrio del club** per ADR-030 §D1: museum building (center) + stadium exterior (right) + manager office exterior (left). All clicks redirect to other routes.

## Scope

In `apps/web/src/routes/city/+page.server.ts` (create or modify):

```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  if (!locals.session) throw redirect(303, '/login');
  // Don't fetch museum contents here — they're loaded on demand when entering museum interior (story 005)
  return {};
};
```

In `apps/web/src/routes/city/+page.svelte` (full rewrite):

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import PixiCanvas from '$lib/components/PixiCanvas.svelte';
  import BarrioScene from '$lib/components/scenes/BarrioScene.svelte';
  // ... future MuseumInteriorScene from story 005

  let scene: 'barrio' | 'museum-interior' = $state('barrio');

  function handleMuseumClick() {
    scene = 'museum-interior';
  }
  function handleStadiumClick() {
    goto('/stadium');
  }
  function handleOfficeClick() {
    goto('/manager-office');
  }
</script>

<div class="city-route">
  <PixiCanvas width={1024} height={576}>
    {#if scene === 'barrio'}
      <BarrioScene
        onMuseumClick={handleMuseumClick}
        onStadiumClick={handleStadiumClick}
        onOfficeClick={handleOfficeClick}
      />
    {:else if scene === 'museum-interior'}
      <!-- MuseumInteriorScene — story 005 -->
    {/if}
  </PixiCanvas>

  <!-- DOM fallback for a11y -->
  <nav class="sr-only" aria-label="Navegación del barrio del club">
    <a href="/stadium">Estadio</a>
    <a href="/manager-office">Despacho del manager</a>
    <a href="/city-text">Museo (modo texto)</a>
  </nav>
</div>

<style>
  .city-route { width: 100%; max-width: 1024px; margin: 0 auto; }
  .sr-only { position: absolute; left: -9999px; }
</style>
```

In `apps/web/src/lib/components/scenes/BarrioScene.svelte` (new):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import * as PIXI from 'pixi.js';

  let { onMuseumClick, onStadiumClick, onOfficeClick } = $props();
  let pixiApp: PIXI.Application;

  onMount(() => {
    // Load 3 building sprites
    // Position: museum centered, stadium right, office left
    // Each sprite has interactive=true, on('pointerdown', handler)
    // ... initialization
  });
</script>
```

Assets needed (story 005 + asset story spawn 12-15 sprites in parallel):
- `museum-exterior.png` (~512×512)
- `stadium-exterior-tier-current.png` (reuse existing HD stadium tier sprites)
- `office-exterior.png` (~512×512)
- `barrio-background.png` (~1024×576, palms + sky + sidewalk)

## Out of Scope

- Museum interior scene (story 005)
- DOM /city-text fallback page (story 006)
- Asset spec sheet for new sprites (separate art story)

## Acceptance Criteria

1. `/city` renders without errors when logged in
2. Redirects to `/login` if no session
3. Barrio scene displays: background + museum center + stadium right + office left
4. Click museum building → scene swaps to interior (placeholder until story 005)
5. Click stadium building → redirects to `/stadium`
6. Click office building → redirects to `/manager-office`
7. Pointer hover on buildings shows tooltip ("Museo", "Estadio", "Despacho del manager")
8. Sprite of stadium exterior matches the current `stadium_visual_level` (sync with /stadium route)
9. DOM fallback `<nav>` accessible via screen reader (sr-only)
10. Page-load <800ms (AC-TH-22)
11. svelte-check 0 errors
12. Mobile PWA: layout adapts to 375px viewport (palms cropped, buildings still clickable)

## Test Requirements (UI/E2E)

`apps/web/tests/city-route.e2e.ts` (Playwright):

- Login → navigate to `/city`
- Verify scene renders (canvas present, sprites loaded)
- Click stadium → verify redirect to `/stadium`
- Click office → verify redirect to `/manager-office`
- Click museum → verify scene swap (interior placeholder visible)
- Keyboard nav: Tab through sr-only nav, Enter follows links

## Dependencies

- **Upstream**: ADR-021 (canvas pipeline) confirmed in place; existing `PixiCanvas` Svelte 5 wrapper available
- **Downstream**: 005 (museum interior scene), 006 (DOM fallback)
- **Parallel**: asset generation story (12-15 new sprites)

## Estimate

**1.5 days.** PixiJS scene + redirect logic + DOM fallback nav + e2e.

## Notes / Gotchas

- The `PixiCanvas` Svelte 5 wrapper is defined in ADR-021 §D2 — verify it exists in `apps/web/src/lib/components/`. If not, this story has an auxiliary scaffolding step.
- Asset sprites: if not yet generated, use placeholder squares with text labels — flag for art-director story to produce real sprites in parallel.
- The barrio is **static** — no animations in v1.1 beyond hover tooltips. Day/night cycle and ambient NPCs deferred to v1.2+.
- The stadium exterior sprite reuses existing HD tier sprites (`stadium-t0-amateur.png` etc.). Mapping logic: same as /stadium route's `getStadiumSprite()` (story stadium-upgrades-008).
- IMPORTANT: keep the route at `/city` (not `/museo` or `/barrio`). Backward-compat with existing sidebar links + bookmarks.

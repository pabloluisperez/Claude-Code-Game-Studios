---
Story: TROPHIES-HISTORY-005
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: UI
GDD Requirement: AC-TH-04/05/06/07/08/09/10/11/12/13/14/23
Governing ADR: ADR-030 §D2, ADR-021
Control Manifest: 2026-05-19
Test Evidence: Merged into 23-4. DOM-first museum renders 5 zones in /city as semantic sections.
ImplementedAt: apps/web/src/routes/city/+page.svelte (zones 1-5 rendered conditionally on m.{trophies,banners,legendTransfers,financialMilestones,stadiumHistory}.length > 0)
Note: PixiJS MuseumInteriorScene canvas implementation deferred to v1.2+ as visual polish layer.
---

# Story: Museum interior scene — 5 zones (trofeos / banners / hall of fame / milestones / estadio histórico)

## Goal

When user enters museum from barrio (story 004), render a horizontally-scrollable interior with 5 zones, each populated from the museum aggregator API (story 001). Each object is clickable/hoverable for the templated text (story 003).

## Scope

In `apps/web/src/lib/components/scenes/MuseumInteriorScene.svelte` (new):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import * as PIXI from 'pixi.js';

  let { onExit } = $props();
  let museumContents: MuseumContents | null = $state(null);
  let activeZone: 'trofeos' | 'banners' | 'hall' | 'milestones' | 'estadio' = $state('trofeos');
  let selectedObject: any = $state(null);

  onMount(async () => {
    const res = await fetch('/api/museum/contents');
    museumContents = await res.json();
    // Initialize PixiJS containers per zone
    // Populate based on data
  });

  function selectZone(z) { activeZone = z; }
  function selectObject(o) { selectedObject = o; }
</script>

<!-- Zone tabs (DOM overlay over canvas) -->
<div class="zone-tabs">
  <button onclick={() => selectZone('trofeos')} class={activeZone === 'trofeos' ? 'active' : ''}>🏆 Trofeos</button>
  <button onclick={() => selectZone('banners')} class={activeZone === 'banners' ? 'active' : ''}>🎌 Banners</button>
  <button onclick={() => selectZone('hall')} class={activeZone === 'hall' ? 'active' : ''}>👤 Hall of Fame</button>
  <button onclick={() => selectZone('milestones')} class={activeZone === 'milestones' ? 'active' : ''}>📜 Hitos</button>
  <button onclick={() => selectZone('estadio')} class={activeZone === 'estadio' ? 'active' : ''}>🏟 Estadio</button>
</div>

<button class="exit-btn" onclick={onExit}>← Volver al barrio</button>

{#if selectedObject}
  <div class="object-info">
    <h3>{selectedObject.name}</h3>
    <p>{selectedObject.contextualText}</p>
    <button onclick={() => selectedObject = null}>Cerrar</button>
  </div>
{/if}
```

In `apps/web/src/lib/components/scenes/MuseumZoneRender.ts` (new helper):

For each zone, PixiJS rendering logic:

```typescript
// Trofeos zone: array of trophy sprites in a row, dust overlay if old, click handler
// Banners zone: vertical wall of banners
// Hall of fame: grid of plaques with player sprites
// Milestones: scrollable list of plaques with text
// Estadio histórico: horizontal timeline of stadium item plaques with completion dates
```

LoD logic per AC-TH-23:
- If `museum_objects_count > MUSEUM_PERF_CAP` (250), render distant objects as simplified static sprites (no dust overlay, no animation)

Contextual text (story 003) is fetched per object on selection. Text computation happens on backend (story 001 enriches response with `contextualText` field) OR on frontend by importing template functions and seed-deterministic logic from `@smt/shared`.

## Out of Scope

- LLM-generated text (v1.2+)
- NPC ambient (v1.2+)
- Background music per zone (v1.2+)
- Screenshot mode (v1.2+)

## Acceptance Criteria

1. Entering museum scene → fetches `/api/museum/contents` once
2. 5 zone tabs visible; click changes activeZone
3. Trofeos zone shows trophy sprites; old trophies (>5 seasons) have dust overlay (AC-TH-07)
4. Banners zone shows banner sprites with text
5. Hall of fame shows plaques with player sprites
6. Milestones zone shows plaques with text
7. Estadio histórico shows chronological timeline
8. Click on any object → opens object info overlay with name + templated contextual text
9. Empty museum (new club) → each zone shows placeholder ("Aquí descansará tu primera copa", etc.) (AC-TH-16)
10. Exit button → returns to barrio scene
11. LoD: if `totalObjects > 250`, distant objects rendered simplified (AC-TH-23)
12. Mobile PWA: zone tabs become horizontally-scrollable on narrow screens
13. svelte-check 0 errors

## Test Requirements (UI/E2E)

`apps/web/tests/museum-interior.e2e.ts` (Playwright):

- Login → /city → click museum
- Verify 5 zone tabs visible
- Click each zone → verify content changes
- Click an object → verify info overlay appears with text
- Verify empty museum shows placeholder for new club
- Verify exit button returns to barrio

## Dependencies

- **Upstream**: 001 (API), 002 (formulas — though most used backend-side), 003 (text templates), 004 (barrio scene + scene swap mechanism)
- **Downstream**: 006 (DOM fallback /city-text)

## Estimate

**2 days.** Largest UI story — 5 PixiJS zones + DOM overlay + selection state.

## Notes / Gotchas

- Use Svelte 5 runes everywhere (`$state`, `$props`)
- PixiJS containers per zone — switching activeZone hides inactive containers (`container.visible = false`) for perf
- Loading state: while `/api/museum/contents` is fetching, show a "loading" PixiJS scene or a placeholder DOM overlay
- Caching: SvelteKit's `data` is loaded server-side per request; museum contents API has 60s cache (story 001). Avoid double-fetching.
- Touch support: pointer events work on mobile; verify no double-tap issues (e.g., zoom interfering with click)
- Sprite assets: trophy-cup-small.png, trophy-cup-medium.png, trophy-cup-large.png, plaque-base.png, banner-template-base.png, etc. — needed via parallel art story. Use placeholder squares until ready.

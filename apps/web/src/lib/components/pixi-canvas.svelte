<!--
  <PixiCanvas> — Svelte 5 wrapper around PIXI.Application.

  v1.1 Sprint 20 per ADR-021 §D2 + ADR-023 §D1.

  Props (read-only inputs from server):
    - worldView: CanvasWorldView (the slim subset of WorldState canvas needs)
    - onTileClick: callback when user clicks a tile

  Lifecycle:
    - onMount: create PIXI app, render initial state
    - $effect: react to worldView changes
    - onDestroy: destroy PIXI app + free WebGL resources

  Accessibility:
    - The <canvas> has tabindex="0" + aria-label for screen readers.
    - The actual ARIA-friendly content lives in /stadium?view=text (ADR-024).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { CanvasWorldView, TileCoord } from '$lib/canvas/types';
  import {
    createPixiApp,
    destroyPixiApp,
    renderTier1Baseline,
    applyDayNightTint,
    type PixiBundle,
  } from '$lib/canvas/pixi-app';
  import { screenToTile, TILE_WIDTH_HALF, TILE_HEIGHT_HALF } from '$lib/canvas/tile-projection';

  type Props = {
    worldView: CanvasWorldView;
    width?: number;
    height?: number;
    onTileClick?: (coord: TileCoord) => void;
  };

  let { worldView, width = 800, height = 600, onTileClick }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();

  // $state.raw because PIXI.Application is a complex object that we don't want
  // Svelte's reactive proxy wrapping (would break PIXI internals).
  let bundle = $state.raw<PixiBundle | null>(null);

  onMount(async () => {
    if (!canvasEl) return;
    bundle = await createPixiApp(canvasEl);
    renderTier1Baseline(bundle, worldView);
    applyDayNightTint(bundle, worldView);
  });

  onDestroy(() => {
    destroyPixiApp(bundle);
    bundle = null;
  });

  // React to worldView changes — re-render the affected layers.
  $effect(() => {
    // Touch worldView to register dependency
    const view = worldView;
    if (!bundle) return;
    renderTier1Baseline(bundle, view);
    applyDayNightTint(bundle, view);
  });

  function handleClick(ev: MouseEvent): void {
    if (!bundle || !canvasEl || !onTileClick) return;
    const rect = canvasEl.getBoundingClientRect();
    // Get screen position relative to canvas + adjust for camera offset stored
    // in the terrain layer.
    const localX = ev.clientX - rect.left - bundle.layers.terrain.position.x;
    const localY = ev.clientY - rect.top - bundle.layers.terrain.position.y;
    const coord = screenToTile({ screenX: localX, screenY: localY });
    onTileClick(coord);
  }

  function handleKeydown(ev: KeyboardEvent): void {
    if (!bundle) return;
    if (ev.key === 'f' || ev.key === 'F') {
      // Re-center on stadium
      ev.preventDefault();
      renderTier1Baseline(bundle, worldView);
    }
  }
</script>

<canvas
  bind:this={canvasEl}
  {width}
  {height}
  tabindex="0"
  role="application"
  aria-label="Vista isométrica del estadio del club. Usa Tab para salir de la vista. Pulsa F para centrar en el estadio. Hay una vista alternativa en formato texto disponible en el menú de accesibilidad."
  onclick={handleClick}
  onkeydown={handleKeydown}
></canvas>

<style>
  canvas {
    display: block;
    background: hsl(220 30% 8%);
    cursor: pointer;
    image-rendering: pixelated;
    border-radius: 0.25rem;
    outline: 2px solid transparent;
    transition: outline-color 0.15s;
  }
  canvas:focus-visible {
    outline-color: hsl(var(--p));
  }
</style>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Graphics } from 'pixi.js';

  // Use $state.raw so PixiJS instance is not proxied by Svelte reactivity
  let app = $state.raw<Application | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state(undefined);

  onMount(async () => {
    if (!canvas) return;

    const pixiApp = new Application();
    await pixiApp.init({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      backgroundColor: 0x1a1a2e,
      resolution: window.devicePixelRatio ?? 1,
      autoDensity: true
    });

    // Placeholder isometric ground tile
    const ground = new Graphics();
    ground.poly([
      pixiApp.screen.width / 2, 80,
      pixiApp.screen.width / 2 + 60, 110,
      pixiApp.screen.width / 2, 140,
      pixiApp.screen.width / 2 - 60, 110
    ]);
    ground.fill({ color: 0x4a7c59 });
    pixiApp.stage.addChild(ground);

    app = pixiApp;
  });

  onDestroy(() => {
    app?.destroy(true);
    app = null;
  });
</script>

<svelte:head>
  <title>Stadium — Cascada FC</title>
</svelte:head>

<div class="flex h-[calc(100vh-64px)] flex-col">
  <div class="flex items-center justify-between border-b border-base-300 px-4 py-2">
    <h1 class="text-lg font-bold">Your Club</h1>
    <span class="badge badge-neutral">Division 5 — Pre-Season</span>
  </div>

  <div class="relative flex-1">
    <canvas bind:this={canvas} class="h-full w-full" />
    <div class="absolute bottom-4 left-4 rounded bg-base-200/80 p-2 text-xs backdrop-blur">
      Isometric world — coming soon
    </div>
  </div>
</div>

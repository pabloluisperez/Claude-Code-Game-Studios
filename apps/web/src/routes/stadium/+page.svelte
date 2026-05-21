<!--
  /stadium — v1.1 Sprint 20-22.

  Two render modes (per ADR-024):
    - Default: <PixiCanvas> isometric view (data.useTextFallback === false)
    - Fallback: DOM-only descriptive view (data.useTextFallback === true)

  Both modes read the same `data.worldView` — they are visual variants of
  the same underlying state.
-->
<script lang="ts">
  import PixiCanvas from '$lib/components/pixi-canvas.svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import { pitchSurface } from '$lib/canvas/tier-derivation';
  import { timeToDayNightBucket } from '@smt/shared';

  let { data }: { data: PageData } = $props();

  function tierLabel(t: 1 | 2 | 3 | 4): string {
    return ['', 'Pueblo Olvidado', 'Club Emergente', 'Club Establecido', 'Imperio Local'][t];
  }

  function weatherLabel(w: 'clear' | 'rain'): string {
    return w === 'rain' ? '🌧 Lluvia' : '☀ Despejado';
  }

  function dayNightLabel(t: number): string {
    const bucket = timeToDayNightBucket(t);
    return {
      dawn: '🌅 Amanecer',
      day: '☀ Día',
      dusk: '🌆 Atardecer',
      night: '🌙 Noche',
    }[bucket];
  }
</script>

<svelte:head>
  <title>Estadio · Total Soccer Manager</title>
</svelte:head>

<article class="prose max-w-5xl mx-auto py-6">
  <header class="flex items-baseline justify-between flex-wrap gap-4 mb-6 not-prose">
    <div>
      <h1 class="text-2xl font-bold">{data.derived?.clubName ?? 'Mi estadio'}</h1>
      {#if data.derived}
        <p class="opacity-70 text-sm">
          {data.derived.clubCity} · Semana <span class="font-mono">{data.derived.week}</span> ·
          Día <span class="font-mono">{data.derived.dayOfSeason}</span>
        </p>
      {/if}
    </div>
    <a href={data.meta?.alternateView} class="btn btn-ghost btn-sm">
      {data.useTextFallback ? '🖼 Vista isométrica' : '📄 Vista en texto (accesible)'}
    </a>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      No tienes una carrera activa. <a href="/game" class="link">Crea una</a> para ver el estadio.
    </div>
  {:else if data.useTextFallback || !data.worldView}
    <!-- ADR-024 DOM fallback view -->
    <section aria-labelledby="tier-h" class="not-prose mb-6">
      <h2 id="tier-h" class="text-xl font-bold mb-2">
        Nivel actual: Tier {data.worldView?.tier} — {tierLabel(data.worldView?.tier ?? 1)}
      </h2>
      <ul class="list-disc list-inside opacity-80">
        <li>
          Estado del campo:
          <strong>{pitchSurface(data.worldView?.infrastructureLevel ?? 0)}</strong>
        </li>
        <li>Iluminación: {(data.worldView?.tier ?? 1) >= 2 ? 'instalada' : 'sin iluminación'}</li>
        <li>
          Tiempo: {dayNightLabel(data.worldView?.currentTimeOfDay ?? 0)} ·
          {weatherLabel(data.worldView?.weather ?? 'clear')}
        </li>
      </ul>
    </section>

    <section aria-labelledby="actions-h" class="not-prose">
      <h2 id="actions-h" class="text-xl font-bold mb-2">Acciones</h2>
      <ul class="list-disc list-inside">
        <li><a href="/dashboard" class="link">Volver al dashboard</a></li>
        <li><a href="/squad" class="link">Ver plantilla</a></li>
      </ul>
    </section>
  {:else}
    <!-- ADR-021 canvas view -->
    <section class="not-prose">
      <div class="flex gap-4 flex-wrap items-center mb-3 text-sm">
        <span class="badge badge-info">Tier {data.worldView.tier} — {tierLabel(data.worldView.tier)}</span>
        <span class="badge">{dayNightLabel(data.worldView.currentTimeOfDay)}</span>
        <span class="badge">{weatherLabel(data.worldView.weather)}</span>
        <span class="opacity-60 text-xs">
          Campo: {pitchSurface(data.worldView.infrastructureLevel)}
        </span>
      </div>

      <PixiCanvas
        worldView={data.worldView}
        width={960}
        height={540}
        onTileClick={(coord) => {
          // Placeholder — Sprint 21 wires this to actual destinations
          console.log('Tile clicked:', coord);
        }}
      />

      <p class="text-xs opacity-60 mt-2">
        Vista en desarrollo (v1.1). ¿Problemas para verla?
        <a href="/stadium?view=text" class="link">Cambia a vista en texto</a>.
      </p>
    </section>
  {/if}
</article>

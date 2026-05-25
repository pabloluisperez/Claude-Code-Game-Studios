<!--
  /city — Museo del club + navegación del barrio.
  Story TROPHIES-HISTORY-004/005/006 (combined into a DOM-first museum
  view for v1.1; PixiJS BarrioScene + MuseumInteriorScene deferred to v1.2+).

  Renders the 5 museum zones (trofeos, banderines, leyendas, hitos
  financieros, historia del estadio) plus barrio navigation cards.
  Fully accessible by default — semantic landmarks + keyboard navigation.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import {
    bannerTemplates,
    milestoneTemplates,
    stadiumHistoryTemplate,
    pickAdjective,
  } from '@smt/shared';

  let { data }: { data: PageData } = $props();

  const TRACK_LABELS: Record<string, string> = {
    gradas: 'Gradas',
    pitch: 'Césped',
    servicios: 'Servicios',
    training: 'Entrenamiento',
    academy: 'Cantera',
  };

  function stadiumItemName(slug: string): string {
    // Friendly fallback from slug if the catalog mapping isn't available client-side.
    return slug
      .split('-')
      .slice(2)
      .join(' ')
      .replace(/^./, (c) => c.toUpperCase());
  }

  const currentSeason = $derived(data.club?.currentSeason ?? 1);
</script>

<svelte:head>
  <title>Museo · Total Soccer Manager</title>
</svelte:head>

<article class="max-w-5xl mx-auto py-6 space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Museo del {data.club?.name ?? 'club'}</h1>
    <p class="opacity-70 text-sm">
      Una colección de los momentos que han hecho este club.
      {#if data.museum}
        <span class="opacity-50">
          · {data.museum.totalObjects} objetos · densidad {Math.round(data.museum.museumDensity * 100)}%
        </span>
      {/if}
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      No tienes una carrera activa. <a href="/game" class="link">Crea una</a> para ver el museo.
    </div>
  {:else}
    <!-- Barrio navigation: stadium + manager office. Visible above the museum
         so the player can jump back to the gameplay surfaces in 1 click. -->
    <nav aria-label="Barrio del club" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <a
        href="/stadium"
        class="card bg-base-200 hover:bg-base-300 transition-colors no-underline"
        aria-label="Ir al estadio"
      >
        <div class="card-body py-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl" aria-hidden="true">🏟</span>
            <div>
              <h2 class="card-title text-base">Estadio</h2>
              <p class="text-xs opacity-70">Reformas, capacidad, estado del campo</p>
            </div>
          </div>
        </div>
      </a>
      <a
        href="/manager"
        class="card bg-base-200 hover:bg-base-300 transition-colors no-underline"
        aria-label="Ir al despacho del manager"
      >
        <div class="card-body py-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl" aria-hidden="true">💼</span>
            <div>
              <h2 class="card-title text-base">Despacho</h2>
              <p class="text-xs opacity-70">Skills, XP, eventos de carrera</p>
            </div>
          </div>
        </div>
      </a>
    </nav>

    {#if !data.museum || data.museum.totalObjects === 0}
      <!-- Empty museum state — new players. -->
      <section class="card bg-base-100 shadow border border-base-300">
        <div class="card-body text-center py-12">
          <span class="text-5xl block mb-3" aria-hidden="true">🏛</span>
          <h2 class="card-title justify-center">Museo en construcción</h2>
          <p class="opacity-70 max-w-md mx-auto">
            Cada partido importante, cada trofeo, cada fichaje legendario
            aparecerá aquí. Por ahora, las salas están vacías — ve a jugar
            partidos y a construir la historia del club.
          </p>
        </div>
      </section>
    {:else}
      {@const m = data.museum}

      <!-- Zone 1: Trophies -->
      {#if m.trophies.length > 0}
        <section aria-labelledby="trophies-h" class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 id="trophies-h" class="card-title">🏆 Sala de Trofeos</h2>
            <ul class="space-y-2 mt-2">
              {#each m.trophies as t (t.id)}
                <li class="flex items-start gap-3 p-2 rounded bg-base-200">
                  <span class="text-2xl" aria-hidden="true">🏆</span>
                  <div class="flex-1">
                    <p class="font-semibold">{t.name}</p>
                    <p class="text-xs opacity-70">Temporada {t.seasonNumber}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}

      <!-- Zone 2: Banners (legendary matches + promotions) -->
      {#if m.banners.length > 0}
        <section aria-labelledby="banners-h" class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 id="banners-h" class="card-title">🚩 Salón de Banderines</h2>
            <p class="text-xs opacity-60 -mt-2">Partidos legendarios y ascensos.</p>
            <ul class="space-y-2 mt-2">
              {#each m.banners as b (b.id)}
                {@const result_text = b.homeScore > b.awayScore
                  ? `victoria ${b.homeScore}-${b.awayScore}`
                  : b.homeScore < b.awayScore
                  ? `derrota ${b.homeScore}-${b.awayScore}`
                  : `empate ${b.homeScore}-${b.awayScore}`}
                <li class="flex items-start gap-3 p-2 rounded bg-base-200">
                  <span class="text-2xl" aria-hidden="true">🚩</span>
                  <div class="flex-1">
                    <p class="text-sm">
                      {bannerTemplates.legendary({ season: currentSeason, match_description: result_text })}
                    </p>
                    <p class="text-xs opacity-70">Semana {b.week}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}

      <!-- Zone 3: Legend transfers -->
      {#if m.legendTransfers.length > 0}
        <section aria-labelledby="legends-h" class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 id="legends-h" class="card-title">⭐ Sala de Leyendas</h2>
            <ul class="space-y-2 mt-2">
              {#each m.legendTransfers as l (l.id)}
                <li class="flex items-start gap-3 p-2 rounded bg-base-200">
                  <span class="text-2xl" aria-hidden="true">⭐</span>
                  <div class="flex-1">
                    <p class="font-semibold">{l.playerName}</p>
                    <p class="text-xs opacity-70">{l.direction === 'in' ? 'Llegada' : 'Salida'} · {l.valueEurK} k€</p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}

      <!-- Zone 4: Financial milestones -->
      {#if m.financialMilestones.length > 0}
        <section aria-labelledby="finance-h" class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 id="finance-h" class="card-title">💰 Hitos Económicos</h2>
            <ul class="space-y-2 mt-2">
              {#each m.financialMilestones as f (f.id)}
                {@const milestoneText = f.kind === 'first_profit'
                  ? milestoneTemplates.first_profit({ season: currentSeason })
                  : f.kind === 'first_100k'
                  ? milestoneTemplates.millionaire({ season: currentSeason })
                  : f.description}
                <li class="flex items-start gap-3 p-2 rounded bg-base-200">
                  <span class="text-2xl" aria-hidden="true">💰</span>
                  <div class="flex-1">
                    <p class="text-sm">{milestoneText}</p>
                    <p class="text-xs opacity-70">Semana {f.week}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}

      <!-- Zone 5: Stadium history -->
      {#if m.stadiumHistory.length > 0}
        <section aria-labelledby="stadium-h" class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 id="stadium-h" class="card-title">🏗 Historia del Estadio</h2>
            <p class="text-xs opacity-60 -mt-2">Cada reforma terminada deja huella aquí.</p>
            <ul class="space-y-2 mt-2">
              {#each m.stadiumHistory as s (s.id)}
                {@const seed = s.id.charCodeAt(0) + s.tier}
                <li class="flex items-start gap-3 p-2 rounded bg-base-200">
                  <span class="text-2xl" aria-hidden="true">🏗</span>
                  <div class="flex-1">
                    <p class="text-sm">
                      {stadiumHistoryTemplate({
                        item_name: stadiumItemName(s.itemSlug),
                        season: currentSeason,
                        cost_eur_k: 0,
                      })}
                    </p>
                    <p class="text-xs opacity-70">
                      {TRACK_LABELS[s.track] ?? s.track} · Nivel {s.tier} ·
                      <span class="italic">Año de {pickAdjective(seed)}</span>
                    </p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}
    {/if}

    <!-- Closing flavor text -->
    <p class="text-center text-xs opacity-50 mt-8 italic">
      El museo del club refleja todo lo que has hecho, no lo que has comprado.
    </p>
  {/if}
</article>

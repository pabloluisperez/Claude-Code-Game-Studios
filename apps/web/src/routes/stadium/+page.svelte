<!--
  /stadium — close-up + catálogo de reformas.

  Story STADIUM-UPGRADES-008 (Sprint 22). Replaces the stop-gap commit
  6edca6b. Renders:
    - Hero stadium sprite driven by F1 stadium_visual_level (0..9).
    - Active obra widget (when an item is in_progress) with cancel.
    - Catalog grid grouped by track × tier with Available / Queued /
      InProgress / Complete / Locked states.
    - Critical-balance warning modal flow.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import type { PageData, ActionData } from './$types';
  import { getSocket, connectSocket } from '$lib/sockets';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
    1: 'Pueblo Olvidado',
    2: 'Club Emergente',
    3: 'Club Establecido',
    4: 'Imperio Local',
  };
  const TRACK_LABELS: Record<string, string> = {
    gradas: 'Gradas',
    pitch: 'Césped',
    servicios: 'Servicios',
    training: 'Entrenamiento',
    academy: 'Cantera',
  };

  function pitchLabel(p: string): string {
    return ({ dry: 'Tierra seca', patchy: 'Parches de césped', healthy: 'Césped completo', pristine: 'Césped premium' } as Record<string, string>)[p] ?? p;
  }

  function visualLevelSprite(v: number): string {
    const clamped = Math.max(0, Math.min(9, Math.floor(v)));
    return `/sprites/city-hd/stadium-v${clamped}.png`;
  }

  function formatEur(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} M€`;
    if (amount >= 1_000) return `${Math.round(amount / 1_000)} k€`;
    return `${amount} €`;
  }

  // Estimated cost lookup (server should ideally provide; for v1.1 we hard-code
  // the same formula as F4 with no modifiers for display only — the actual
  // charge runs through service.buy() which applies modifiers server-side).
  const BASE_COST_TIER: Record<number, number> = { 1: 15, 2: 55, 3: 130, 4: 340 };
  const TRACK_MULT: Record<string, number> = {
    gradas: 1.4, pitch: 0.8, servicios: 0.9, training: 1.1, academy: 1.0,
  };
  function estimatedTotalEurK(track: string, tier: number): number {
    return Math.round((BASE_COST_TIER[tier] ?? 0) * (TRACK_MULT[track] ?? 1));
  }
  function estimatedDurationWeeks(tier: number): number {
    return ({ 1: 2, 2: 4, 3: 6, 4: 8 } as Record<number, number>)[tier] ?? 0;
  }
  function estimatedWeeklyEurK(track: string, tier: number): number {
    const dur = estimatedDurationWeeks(tier);
    return dur > 0 ? Math.round(estimatedTotalEurK(track, tier) / dur) : 0;
  }

  // Build the grid grouped by (track, tier).
  type Item = NonNullable<PageData['catalog']>['items'][number];
  const grouped = $derived.by(() => {
    const items = data.catalog?.items ?? [];
    const byTrack: Record<string, Record<number, Item[]>> = {};
    for (const it of items) {
      byTrack[it.track] ??= {};
      byTrack[it.track]![it.tier] ??= [];
      byTrack[it.track]![it.tier]!.push(it);
    }
    return byTrack;
  });

  // Critical-balance modal state.
  let warningSlug: string | null = $state(null);

  // Form-action error post-processing.
  $effect(() => {
    if (form?.action === 'buy' && form.error === 'CRITICAL_BALANCE_WARNING' && form.itemSlug) {
      warningSlug = String(form.itemSlug);
    }
  });

  // Socket.IO realtime updates: invalidate page data on `stadium:item_complete`.
  onMount(() => {
    const socket = getSocket();
    connectSocket();
    socket.on('stadium:item_complete' as never, (() => {
      invalidateAll();
    }) as never);
  });
  onDestroy(() => {
    const socket = getSocket();
    socket.off('stadium:item_complete' as never);
  });
</script>

<svelte:head>
  <title>Estadio · Total Soccer Manager</title>
</svelte:head>

<article class="max-w-5xl mx-auto py-6">
  <header class="flex items-baseline justify-between flex-wrap gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-bold">Estadio de {data.club?.name ?? 'mi club'}</h1>
      {#if data.stadium}
        <p class="opacity-70 text-sm">
          Tier {data.stadium.tier} — {TIER_LABELS[data.stadium.tier]} · Capacidad
          <span class="font-mono">{data.stadium.capacity.toLocaleString('es-ES')}</span>
        </p>
      {/if}
    </div>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      No tienes una carrera activa. <a href="/game" class="link">Crea una</a> para ver el estadio.
    </div>
  {:else if data.stadium}
    <!-- Stadium hero -->
    <section class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Capacidad</h2>
            <p class="text-2xl font-bold font-mono">{data.stadium.capacity.toLocaleString('es-ES')}</p>
            <p class="text-xs opacity-50">asientos</p>
          </div>
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Estado del campo</h2>
            <p class="text-lg font-semibold">{pitchLabel(data.stadium.pitchSurface)}</p>
            <p class="text-xs opacity-50">
              Infrastructure: <span class="font-mono">{data.stadium.infrastructureLevel}/100</span>
            </p>
          </div>
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Balance del club</h2>
            <p class="text-2xl font-bold font-mono">{data.stadium.budget.toLocaleString('es-ES')} k€</p>
            {#if data.stadium.reformCostThisWeek > 0}
              <p class="text-xs text-warning">
                Esta semana se cobraron <span class="font-mono">{data.stadium.reformCostThisWeek} k€</span> por la obra en curso
              </p>
            {:else}
              <p class="text-xs opacity-50">disponible para reformas</p>
            {/if}
          </div>
        </div>

        <div class="mt-6 rounded bg-gradient-to-b from-base-200 to-base-300 p-4 text-center overflow-hidden">
          <img
            src={visualLevelSprite(data.stadium.visualLevel)}
            alt="Estadio nivel visual {data.stadium.visualLevel}"
            class="mx-auto max-w-full h-auto"
            style="image-rendering: pixelated; max-height: 480px;"
            width="1536"
            height="1152"
            loading="eager"
            decoding="async"
          />
          <p class="text-xs opacity-60 mt-3">
            <span class="sr-only">Estadio nivel visual: {data.stadium.visualLevel}</span>
            Cada reforma terminada acerca tu estadio a su forma final.
          </p>
        </div>
      </div>
    </section>

    <!-- Active obra widget -->
    {#if data.catalog?.active}
      {@const active = data.catalog.active}
      <section class="card bg-warning/10 border border-warning shadow mb-6 sticky top-2 z-10">
        <div class="card-body py-4">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 class="text-sm uppercase opacity-70">Obra activa</h2>
              <p class="font-semibold">{active.itemSlug}</p>
              <p class="text-xs opacity-70">
                Quedan <span class="font-mono">{active.weeksRemaining}</span> de <span class="font-mono">{active.durationWeeks}</span> semanas
              </p>
            </div>
            <form method="POST" action="?/cancel" use:enhance>
              <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
              <input type="hidden" name="itemId" value={active.id} />
              <button
                type="submit"
                class="btn btn-warning btn-sm"
                onclick={(e) => {
                  if (!confirm('¿Cancelar obra y recuperar 50% del coste?')) e.preventDefault();
                }}
              >
                Cancelar obra
              </button>
            </form>
          </div>
        </div>
      </section>
    {/if}

    {#if form?.action === 'cancel' && 'refundEurK' in form}
      <div class="alert alert-info mb-4">
        Obra cancelada — recuperado {Number(form.refundEurK)} k€ (50% de lo ya pagado).
      </div>
    {/if}
    {#if form?.action === 'buy' && 'itemId' in form}
      {@const f = form as unknown as { installmentEurK?: number; durationWeeks?: number; totalCost?: number }}
      <div class="alert alert-success mb-4">
        🔨 Obra iniciada. Se cobrarán <span class="font-mono">{f.installmentEurK ?? 0} k€</span>
        cada semana durante <span class="font-mono">{f.durationWeeks ?? 0}</span> semanas
        (total <span class="font-mono">{f.totalCost ?? 0} k€</span>).
      </div>
    {/if}
    {#if form?.action === 'buy' && form.error && form.error !== 'CRITICAL_BALANCE_WARNING'}
      <div class="alert alert-error mb-4">
        ❌ No se pudo iniciar la obra: <span class="font-mono">{String(form.error)}</span>
      </div>
    {/if}

    <!-- Catalog grid -->
    <section aria-labelledby="upgrades-h" class="space-y-6">
      <h2 id="upgrades-h" class="text-xl font-bold">Catálogo de reformas</h2>

      {#each Object.entries(grouped) as [track, tiers] (track)}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <h3 class="card-title text-lg">{TRACK_LABELS[track] ?? track}</h3>
            {#each [1, 2, 3, 4] as tier (tier)}
              {#if tiers[tier]}
                <div class="mt-3">
                  <p class="text-sm opacity-70 mb-2">Nivel {tier}</p>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {#each tiers[tier] as item (item.slug)}
                      {@const totalK = estimatedTotalEurK(item.track, item.tier)}
                      {@const weeks = estimatedDurationWeeks(item.tier)}
                      {@const weeklyK = estimatedWeeklyEurK(item.track, item.tier)}
                      <article class="rounded border border-base-300 p-3 bg-base-50 flex flex-col gap-2">
                        <div class="flex items-start gap-2">
                          <h4 class="font-semibold flex-1">{item.name}</h4>
                          <span
                            class="badge badge-sm"
                            class:badge-success={item.state === 'Complete'}
                            class:badge-warning={item.state === 'InProgress'}
                            class:badge-info={item.state === 'Queued'}
                            class:badge-ghost={item.state === 'Locked'}
                            class:badge-primary={item.state === 'Available'}
                          >
                            {item.state}
                          </span>
                        </div>
                        <p class="text-xs opacity-70 flex-1">{item.description}</p>
                        {#if item.state === 'Available'}
                          <div class="text-xs space-y-0.5">
                            <div class="flex justify-between">
                              <span class="opacity-70">Coste total:</span>
                              <span class="font-mono font-semibold">{totalK} k€</span>
                            </div>
                            <div class="flex justify-between">
                              <span class="opacity-70">Cuota semanal:</span>
                              <span class="font-mono">{weeklyK} k€ × {weeks} sem</span>
                            </div>
                          </div>
                          <form method="POST" action="?/buy" use:enhance>
                            <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                            <input type="hidden" name="itemSlug" value={item.slug} />
                            <button type="submit" class="btn btn-primary btn-sm w-full">🔨 Construir — {weeklyK} k€/sem</button>
                          </form>
                        {:else if item.state === 'InProgress'}
                          <p class="text-xs font-mono">Quedan {item.weeksRemaining} sem · {weeklyK} k€/sem</p>
                        {:else if item.state === 'Locked'}
                          <p class="text-xs opacity-50 italic">Requiere un item del nivel anterior.</p>
                        {:else if item.state === 'Queued'}
                          <p class="text-xs opacity-60">{totalK} k€ total · espera turno</p>
                        {:else if item.state === 'Complete'}
                          <p class="text-xs opacity-60">✓ Pagado {totalK} k€</p>
                        {/if}
                      </article>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </section>

    <!-- Critical-balance warning modal -->
    {#if warningSlug}
      <div
        class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-labelledby="cb-warn-title"
        aria-modal="true"
      >
        <div class="card bg-base-100 shadow-xl max-w-md">
          <div class="card-body">
            <h3 id="cb-warn-title" class="card-title">Balance crítico</h3>
            <p class="text-sm">
              Esta compra dejará tu balance por debajo del umbral seguro
              (€50K). Si continúas, tu club entra en zona de riesgo financiero.
            </p>
            <div class="card-actions justify-end mt-4">
              <button
                type="button"
                class="btn btn-ghost"
                onclick={() => {
                  warningSlug = null;
                }}
              >
                Volver
              </button>
              <form method="POST" action="?/buy" use:enhance={() => () => { warningSlug = null; }}>
                <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                <input type="hidden" name="itemSlug" value={warningSlug} />
                <input type="hidden" name="acceptRisk" value="true" />
                <button type="submit" class="btn btn-warning">Acepto el riesgo — Construir</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</article>

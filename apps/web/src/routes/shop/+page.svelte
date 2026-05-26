<!--
  /shop — Tienda. Merch (precio + fabricar stock) + concesiones (precio).
  Pablo 2026-05-27 (#39). Las ventas ocurren solas en partidos en casa.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MERCH = [
    { kind: 'scarf', icon: '🧣', label: 'Bufanda', priceKey: 'merchScarfPrice', stockKey: 'merchScarfStock' },
    { kind: 'cap', icon: '🧢', label: 'Gorra', priceKey: 'merchCapPrice', stockKey: 'merchCapStock' },
    { kind: 'shirt', icon: '👕', label: 'Camiseta', priceKey: 'merchShirtPrice', stockKey: 'merchShirtStock' },
  ] as const;
  const CONCESSIONS = [
    { item: 'food', icon: '🥪', label: 'Bocadillos', key: 'concessionFoodPrice' },
    { item: 'soda', icon: '🥤', label: 'Refrescos', key: 'concessionSodaPrice' },
    { item: 'beer', icon: '🍺', label: 'Cerveza', key: 'concessionBeerPrice' },
    { item: 'water', icon: '💧', label: 'Agua', key: 'concessionWaterPrice' },
  ] as const;

  // Local manufacture qty per kind (UI only).
  let qty: Record<string, number> = $state({ scarf: 500, cap: 500, shirt: 200 });

  function unitCostAt(kind: string, q: number): number {
    const curve = data.hasPlaythrough ? data.costCurve.find((c) => c.kind === kind) : null;
    if (!curve) return 0;
    // Interpolate from nearest sample (display only).
    const samples = curve.samples;
    let best = samples[0];
    for (const s of samples) if (Math.abs(s.qty - q) < Math.abs(best.qty - q)) best = s;
    return best.unitCost;
  }
</script>

<svelte:head><title>Tienda — TSM</title></svelte:head>

<div class="container mx-auto p-4 max-w-4xl space-y-6">
  <header>
    <h1 class="text-2xl font-bold">🛍 Tienda del club</h1>
    <p class="opacity-60">Fabrica merchandising y fija precios. Las ventas ocurren en cada partido en casa según la asistencia.</p>
  </header>

  {#if !data.hasPlaythrough || !data.club}
    <div class="alert alert-info"><span>No hay carrera activa.</span></div>
  {:else}
    {#if form?.ok && form.action === 'manufacture'}
      <div class="alert alert-success">
        ✅ Fabricadas {form.qty} uds de {form.kind} por <span class="font-mono">{form.cost} k€</span>.
      </div>
    {/if}
    {#if form && 'error' in form && form.error}
      <div class="alert alert-error"><span>{form.error}</span></div>
    {/if}

    <!-- Merchandising -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Merchandising</h2>
        <p class="text-xs opacity-60 mb-2">Cuanto más fabricas de golpe, más barata sale cada unidad (economía de escala).</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {#each MERCH as m (m.kind)}
            {@const price = data.club[m.priceKey]}
            {@const stock = data.club[m.stockKey]}
            <div class="card border border-base-300">
              <div class="card-body p-4 gap-2">
                <div class="text-3xl text-center">{m.icon}</div>
                <div class="font-bold text-center">{m.label}</div>
                <div class="text-center text-sm">
                  Stock: <span class="font-mono font-bold {stock === 0 ? 'text-error' : ''}">{stock}</span> uds
                </div>
                <form method="POST" action="?/manufacture" use:enhance class="space-y-2 mt-1">
                  <input type="hidden" name="kind" value={m.kind} />
                  <label class="form-control">
                    <span class="label-text text-xs">Precio venta (€)</span>
                    <input type="number" name="price" value={price} min="1" max="500" class="input input-sm input-bordered" />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Fabricar (uds)</span>
                    <input type="number" name="qty" bind:value={qty[m.kind]} min="0" max="100000" step="100" class="input input-sm input-bordered" />
                  </label>
                  <div class="text-xs opacity-70">
                    ≈ {unitCostAt(m.kind, qty[m.kind] ?? 0)} k€/ud · total ≈
                    <span class="font-mono">{Math.round(unitCostAt(m.kind, qty[m.kind] ?? 0) * (qty[m.kind] ?? 0))} k€</span>
                  </div>
                  <button type="submit" class="btn btn-sm btn-primary w-full">🔨 Fabricar + guardar precio</button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Concessions -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Bar del estadio</h2>
        <p class="text-xs opacity-60 mb-2">Sin stock — se sirve fresco. Precio más alto = más margen pero menos consumo.</p>
        {#if form?.ok && form.action === 'setConcessionPrice'}
          <div class="alert alert-success py-2 text-sm">Precio actualizado.</div>
        {/if}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          {#each CONCESSIONS as c (c.item)}
            {@const price = data.club[c.key]}
            <div class="card border border-base-300">
              <div class="card-body p-3 gap-1 items-center">
                <div class="text-2xl">{c.icon}</div>
                <div class="text-sm font-semibold">{c.label}</div>
                <form method="POST" action="?/setConcessionPrice" use:enhance class="w-full">
                  <input type="hidden" name="item" value={c.item} />
                  <div class="join w-full">
                    <input type="number" name="price" value={price} min="1" max="50" class="input input-xs input-bordered join-item w-full" />
                    <button type="submit" class="btn btn-xs join-item">€</button>
                  </div>
                </form>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}
</div>

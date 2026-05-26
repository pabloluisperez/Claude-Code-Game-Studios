<!--
  /shop — Tienda (reworked Pablo 2026-05-27).
  Fabricar (tarda X semanas, coste total visible, más barato cuanta más
  cantidad) separado de fijar precio de venta (muestra coste medio fab).
  Sliders enriquecidos con indicadores live.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { merchUnitCost, merchBatchCost, merchLeadTimeWeeks } from '@smt/shared';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MERCH = [
    { kind: 'scarf', icon: '🧣', label: 'Bufanda' },
    { kind: 'cap', icon: '🧢', label: 'Gorra' },
    { kind: 'shirt', icon: '👕', label: 'Camiseta' },
  ] as const;
  const CONCESSIONS = [
    { item: 'food', icon: '🥪', label: 'Bocadillos', key: 'concessionFoodPrice' },
    { item: 'soda', icon: '🥤', label: 'Refrescos', key: 'concessionSodaPrice' },
    { item: 'beer', icon: '🍺', label: 'Cerveza', key: 'concessionBeerPrice' },
    { item: 'water', icon: '💧', label: 'Agua', key: 'concessionWaterPrice' },
  ] as const;

  type Club = NonNullable<Extract<PageData, { hasPlaythrough: true }>['club']>;
  function field<K extends keyof Club>(c: Club, k: K): Club[K] { return c[k]; }

  // Local slider state per kind.
  let mfgQty: Record<string, number> = $state({ scarf: 500, cap: 500, shirt: 200 });
  let salePrice: Record<string, number> = $state({ scarf: 15, cap: 12, shirt: 40 });
  let concPrice: Record<string, number> = $state({ food: 4, soda: 3, beer: 5, water: 2 });

  // Initialize sale + concession prices from club data once.
  $effect(() => {
    if (data.hasPlaythrough && data.club) {
      salePrice.scarf ||= data.club.merchScarfPrice;
      salePrice.cap ||= data.club.merchCapPrice;
      salePrice.shirt ||= data.club.merchShirtPrice;
    }
  });

  function merchData(kind: string) {
    if (!data.hasPlaythrough || !data.club) return null;
    const c = data.club;
    if (kind === 'scarf') return { price: c.merchScarfPrice, stock: c.merchScarfStock, mfgQty: c.merchScarfMfgQty, mfgWeeks: c.merchScarfMfgWeeksLeft, unitCost: c.merchScarfUnitCost };
    if (kind === 'cap') return { price: c.merchCapPrice, stock: c.merchCapStock, mfgQty: c.merchCapMfgQty, mfgWeeks: c.merchCapMfgWeeksLeft, unitCost: c.merchCapUnitCost };
    return { price: c.merchShirtPrice, stock: c.merchShirtStock, mfgQty: c.merchShirtMfgQty, mfgWeeks: c.merchShirtMfgWeeksLeft, unitCost: c.merchShirtUnitCost };
  }
</script>

<svelte:head><title>Tienda — TSM</title></svelte:head>

<div class="container mx-auto p-4 max-w-4xl space-y-6">
  <header>
    <h1 class="text-2xl font-bold">🛍 Tienda del club</h1>
    <p class="opacity-60">Fabrica merchandising (tarda según cantidad) y fija precios de venta. Las ventas ocurren en cada partido en casa.</p>
  </header>

  {#if !data.hasPlaythrough || !data.club}
    <div class="alert alert-info"><span>No hay carrera activa.</span></div>
  {:else}
    {#if form?.ok && form.action === 'manufacture'}
      <div class="alert alert-success">
        ✅ Pedido de {form.qty} uds de {form.kind} encargado por <span class="font-mono">{form.cost} k€</span> — llega en {form.weeks} semana{form.weeks === 1 ? '' : 's'}.
      </div>
    {/if}
    {#if form && 'error' in form && form.error}
      <div class="alert alert-error"><span>{form.error}</span></div>
    {/if}

    <!-- Merchandising -->
    {#each MERCH as m (m.kind)}
      {@const md = merchData(m.kind)}
      {#if md}
        {@const inProgress = md.mfgQty > 0}
        {@const qSel = mfgQty[m.kind] ?? 500}
        {@const unit = merchUnitCost(m.kind, qSel)}
        {@const total = merchBatchCost(m.kind, qSel)}
        {@const weeks = merchLeadTimeWeeks(qSel)}
        <section class="card bg-base-100 shadow">
          <div class="card-body">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{m.icon}</span>
              <div class="flex-1">
                <h2 class="card-title">{m.label}</h2>
                <div class="text-sm opacity-70">
                  Stock: <span class="font-mono font-bold {md.stock === 0 ? 'text-error' : ''}">{md.stock}</span> uds
                  · Coste medio fab.: <span class="font-mono">{md.unitCost} k€/ud</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
              <!-- Fabricar -->
              <div>
                <div class="text-xs uppercase opacity-60 mb-1 font-semibold">🔨 Fabricar</div>
                {#if inProgress}
                  <div class="alert alert-warning py-2 text-sm">
                    <span>🚧 {md.mfgQty} uds en fabricación · llegan en {md.mfgWeeks} sem.</span>
                  </div>
                {:else}
                  <form method="POST" action="?/manufacture" use:enhance>
                    <input type="hidden" name="kind" value={m.kind} />
                    <input type="hidden" name="qty" value={qSel} />
                    <div class="flex items-baseline justify-between text-sm mb-1">
                      <span class="font-mono font-bold text-lg">{qSel} uds</span>
                      <span class="text-xs opacity-70">⏱ {weeks} sem</span>
                    </div>
                    <input type="range" class="range range-primary range-sm" min="50" max="5000" step="50" bind:value={mfgQty[m.kind]} aria-label="Cantidad a fabricar" />
                    <div class="flex justify-between text-xs opacity-50 mt-0.5">
                      <span>50</span><span>5000</span>
                    </div>
                    <div class="text-sm mt-2 flex items-baseline justify-between">
                      <span>≈ <span class="font-mono">{unit}</span> k€/ud</span>
                      <span class="font-mono font-bold text-base">Total {total} k€</span>
                    </div>
                    <button type="submit" class="btn btn-sm btn-primary w-full mt-2">Encargar pedido</button>
                  </form>
                {/if}
              </div>

              <!-- Precio de venta -->
              <div>
                <div class="text-xs uppercase opacity-60 mb-1 font-semibold">🏷 Precio de venta</div>
                <form method="POST" action="?/setSalePrice" use:enhance>
                  <input type="hidden" name="kind" value={m.kind} />
                  <input type="hidden" name="price" value={salePrice[m.kind]} />
                  <div class="flex items-baseline justify-between text-sm mb-1">
                    <span class="font-mono font-bold text-lg">{salePrice[m.kind]} €</span>
                    <span class="text-xs {(salePrice[m.kind] ?? 0) - md.unitCost > 0 ? 'text-success' : 'text-error'}">
                      margen {(salePrice[m.kind] ?? 0) - md.unitCost > 0 ? '+' : ''}{(salePrice[m.kind] ?? 0) - md.unitCost} €/ud
                    </span>
                  </div>
                  <input type="range" class="range range-success range-sm" min="1" max="120" step="1" bind:value={salePrice[m.kind]} aria-label="Precio de venta" />
                  <div class="flex justify-between text-xs opacity-50 mt-0.5">
                    <span>1€</span><span>coste fab {md.unitCost}€</span><span>120€</span>
                  </div>
                  <p class="text-xs opacity-60 mt-2">Precio alto = más margen pero menos ventas.</p>
                  <button type="submit" class="btn btn-sm btn-success w-full mt-2">Fijar precio</button>
                </form>
              </div>
            </div>
          </div>
        </section>
      {/if}
    {/each}

    <!-- Concessions -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">🍺 Bar del estadio</h2>
        <p class="text-xs opacity-60 mb-2">Sin stock — se sirve fresco. Precio más alto = más margen pero menos consumo.</p>
        {#if form?.ok && form.action === 'setConcessionPrice'}
          <div class="alert alert-success py-2 text-sm">Precio actualizado.</div>
        {/if}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each CONCESSIONS as c (c.item)}
            <form method="POST" action="?/setConcessionPrice" use:enhance class="bg-base-200 rounded p-3">
              <input type="hidden" name="item" value={c.item} />
              <input type="hidden" name="price" value={concPrice[c.item]} />
              <div class="flex items-baseline justify-between mb-1">
                <span class="text-sm font-semibold">{c.icon} {c.label}</span>
                <span class="font-mono font-bold">{concPrice[c.item]} €</span>
              </div>
              <input type="range" class="range range-warning range-sm" min="1" max="15" step="1" bind:value={concPrice[c.item]} aria-label="Precio {c.label}" />
              <button type="submit" class="btn btn-xs btn-warning w-full mt-2">Fijar</button>
            </form>
          {/each}
        </div>
      </div>
    </section>
  {/if}
</div>

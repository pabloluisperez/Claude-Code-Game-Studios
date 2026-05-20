<!--
  Finance panel — wired to apps/web/src/routes/finance/+page.server.ts.

  Story: HUD-UI-004
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let priceConfirmOpen = $state(false);
  let priceFormEl: HTMLFormElement | undefined = $state();

  // Sponsor decision confirmation state.
  let sponsorConfirmOpen = $state(false);
  let sponsorConfirmTitle = $state('');
  let sponsorConfirmMessage = $state('');
  let sponsorConfirmLabel = $state('Confirmar');
  let sponsorConfirmDangerous = $state(false);
  let pendingSponsorAction: (() => void) | null = $state(null);
  let sponsorForms: Record<string, HTMLFormElement | undefined> = $state({});

  function askSponsorConfirm(
    title: string,
    message: string,
    label: string,
    dangerous: boolean,
    action: () => void,
  ) {
    sponsorConfirmTitle = title;
    sponsorConfirmMessage = message;
    sponsorConfirmLabel = label;
    sponsorConfirmDangerous = dangerous;
    pendingSponsorAction = action;
    sponsorConfirmOpen = true;
  }
  function runPendingSponsor() {
    pendingSponsorAction?.();
    pendingSponsorAction = null;
  }

  // RangeSlider is loaded client-only (the library touches window at
  // module init which crashes SSR). On the server we render a fallback
  // number input.
  let RangeSlider = $state<typeof import('svelte-range-slider-pips').default | null>(null);
  onMount(async () => {
    if (browser) {
      const mod = await import('svelte-range-slider-pips');
      await import('svelte-range-slider-pips/dist/range-slider-pips.css');
      RangeSlider = mod.default;
    }
  });

  let priceValues = $state<[number]>([data.club?.seasonTicketPriceEur ?? 35]);
  $effect(() => {
    priceValues = [data.club?.seasonTicketPriceEur ?? 35];
  });

  const latest = $derived(data.hasPlaythrough ? data.snapshots[0] : undefined);
  const balance = $derived(Math.round(latest?.state.financial_balance ?? 0));
  const cashflow = $derived(Math.round(latest?.state.weekly_cashflow ?? 0));
  const financialStatus = $derived(Math.round(latest?.state.financial_status ?? 0));
  const sponsorRevenue = $derived(Math.round(latest?.state.sponsor_revenue_weekly ?? 0));

  const cashflowSeries = $derived(
    data.hasPlaythrough
      ? data.snapshots
          .slice(0, 4)
          .reverse()
          .map((s) => Math.round(s.state.weekly_cashflow ?? 0))
      : [],
  );

  const cashflowMax = $derived(Math.max(...cashflowSeries.map(Math.abs), 1));

  const statusName = ['Sano', 'En Riesgo', 'Crisis', 'Quiebra'];
  const statusClass = ['alert-success', 'alert-warning', 'alert-error', 'alert-error'];

  type FinanceTab = 'resumen' | 'patrocinadores' | 'abonos';
  let activeTab = $state<FinanceTab>('resumen');
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Finanzas</h1>
    <p class="opacity-60">Balance, ingresos, gastos y patrocinadores del club</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver las finanzas.</span>
    </div>
  {:else if !latest}
    <div class="alert alert-info">
      <span>Esperando primer tick del simulador para calcular el balance.</span>
    </div>
  {:else}
    <div role="tablist" class="tabs tabs-boxed w-fit">
      <button
        role="tab"
        class="tab {activeTab === 'resumen' ? 'tab-active' : ''}"
        onclick={() => (activeTab = 'resumen')}
      >
        📊 Resumen
      </button>
      <button
        role="tab"
        class="tab {activeTab === 'patrocinadores' ? 'tab-active' : ''}"
        onclick={() => (activeTab = 'patrocinadores')}
      >
        🤝 Patrocinadores
        {#if data.pendingSponsorOffers && data.pendingSponsorOffers.length > 0}
          <span class="badge badge-warning badge-sm ml-1">
            {data.pendingSponsorOffers.length}
          </span>
        {/if}
      </button>
      <button
        role="tab"
        class="tab {activeTab === 'abonos' ? 'tab-active' : ''}"
        onclick={() => (activeTab = 'abonos')}
      >
        🎟 Abonos
      </button>
      <a
        role="tab"
        class="tab"
        href="/finance/tv-rights"
      >
        📺 Derechos TV
      </a>
    </div>

    {#if form?.ok && form.priceEur}
      <div class="alert alert-success">
        <span>Nuevo precio de abono: {form.priceEur}€ · {form.holders} abonados.</span>
      </div>
    {/if}

    <!-- Season tickets card -->
    {#if activeTab === 'abonos' && data.club}
      <section class="card bg-base-100 shadow border-2 border-info/30">
        <div class="card-body">
          <h2 class="card-title">Abonos de temporada</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div>
              <div class="text-xs opacity-60 uppercase">Abonados</div>
              <div class="font-mono text-2xl">{data.club.seasonTicketHolders}</div>
              <div class="text-xs opacity-60">de {data.club.fanBase} aficionados</div>
            </div>
            <div>
              <div class="text-xs opacity-60 uppercase">Precio actual</div>
              <div class="font-mono text-2xl">{data.club.seasonTicketPriceEur} €</div>
            </div>
            <div>
              <div class="text-xs opacity-60 uppercase">Ingreso anual estimado</div>
              <div class="font-mono text-2xl text-success">
                {Math.round((data.club.seasonTicketHolders * data.club.seasonTicketPriceEur) / 1000)} k€
              </div>
              <div class="text-xs opacity-60">se cobra al inicio de cada temporada</div>
            </div>
          </div>

          {#if data.isPriceLocked}
            <div class="alert alert-warning py-2 mt-3">
              <span class="text-xs">
                🔒 Precio fijado para esta temporada — ya se está captando abonados.
                {#if data.club.seasonTicketHoldersCollected > 0}
                  Llevamos {data.club.seasonTicketHoldersCollected} / {data.club.seasonTicketHolders} confirmados.
                {/if}
              </span>
            </div>
          {:else if data.pretemporada}
            <div class="alert alert-info py-2 mt-3">
              <span class="text-xs">
                ✅ Pretemporada — puedes fijar el precio del abono.
                {#if data.weeksUntilKickoff !== null && data.weeksUntilKickoff > 0}
                  Quedan {data.weeksUntilKickoff} semana{data.weeksUntilKickoff === 1 ? '' : 's'} hasta la jornada 1.
                {/if}
                <strong class="block mt-1">Solo podrás fijarlo una vez por temporada.</strong>
              </span>
            </div>
            <form
              method="POST"
              action="?/setTicketPrice"
              use:enhance
              class="mt-2"
              bind:this={priceFormEl}
            >
              <div class="text-xs label-text mb-2">
                Fijar precio del abono: <strong>{priceValues[0]} €</strong>
              </div>
              <div class="ticket-slider mb-2 max-w-md">
                {#if RangeSlider}
                  <RangeSlider
                    bind:values={priceValues}
                    min={5}
                    max={100}
                    step={5}
                    pips
                    pipstep={3}
                    all="label"
                    float
                    ariaLabels={['Precio del abono en euros']}
                  />
                {:else}
                  <input
                    type="range"
                    class="range range-primary"
                    min="5"
                    max="100"
                    step="5"
                    bind:value={priceValues[0]}
                  />
                {/if}
              </div>
              <input type="hidden" name="priceEur" value={priceValues[0]} />
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onclick={() => (priceConfirmOpen = true)}
              >
                Fijar precio
              </button>
            </form>
            <p class="text-xs opacity-60 mt-2">
              ≤ 25 € → más abonados, peor margen.
              ≥ 50 € → menos abonados pero más caro por persona.
              Una vez fijado, los abonados se suman gradualmente durante la
              pretemporada y los 3 primeros partidos.
            </p>
          {:else}
            <div class="alert alert-warning py-2 mt-3">
              <span class="text-xs">
                🔒 Solo puedes fijar el precio del abono en pretemporada.
                Espera al final de la temporada actual.
              </span>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    {#if activeTab === 'resumen'}
    <div class="alert {statusClass[financialStatus] ?? 'alert-info'}">
      <div>
        <div class="text-xs uppercase opacity-70">Estado financiero</div>
        <div class="text-lg font-bold">{statusName[financialStatus] ?? 'Desconocido'}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Balance</div>
          <div class="font-mono text-3xl {balance < 0 ? 'text-error' : ''}">{balance} €K</div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Cashflow semanal</div>
          <div class="font-mono text-3xl {cashflow < 0 ? 'text-error' : 'text-success'}">
            {cashflow > 0 ? '+' : ''}{cashflow} €K
          </div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Ingresos sponsor</div>
          <div class="font-mono text-3xl text-success">+{sponsorRevenue} €K</div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Semana</div>
          <div class="font-mono text-3xl">{latest.week}</div>
        </div>
      </div>
    </div>

    {#if cashflowSeries.length > 0}
      {@const minVal = Math.min(...cashflowSeries, 0)}
      {@const maxVal = Math.max(...cashflowSeries, 0)}
      {@const range = Math.max(1, maxVal - minVal)}
      {@const pad = range * 0.15}
      {@const yMin = minVal - pad}
      {@const yMax = maxVal + pad}
      {@const w = 600}
      {@const h = 160}
      {@const ptsX = (i: number) => (cashflowSeries.length === 1 ? w / 2 : (i / (cashflowSeries.length - 1)) * (w - 40) + 20)}
      {@const ptsY = (v: number) => h - 20 - ((v - yMin) / (yMax - yMin)) * (h - 40)}
      {@const zeroY = ptsY(0)}
      {@const points = cashflowSeries.map((v, i) => [ptsX(i), ptsY(v)] as const)}
      {@const linePath = points.length > 1
        ? points.reduce((acc, [x, y], idx) => {
            if (idx === 0) return `M ${x} ${y}`;
            const [px, py] = points[idx - 1]!;
            const cx = (px + x) / 2;
            return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
          }, '')
        : ''}
      {@const areaPath = points.length > 1
        ? `${linePath} L ${points[points.length - 1]![0]} ${zeroY} L ${points[0]![0]} ${zeroY} Z`
        : ''}
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Cashflow histórico</h2>
          <svg viewBox="0 0 {w} {h}" class="w-full" preserveAspectRatio="none">
            <!-- Grid horizontal -->
            <line x1="20" x2={w - 20} y1={zeroY} y2={zeroY} stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="3 3" />
            <!-- Filled area -->
            <path d={areaPath} fill="currentColor" fill-opacity="0.12" />
            <!-- Smooth curve -->
            <path d={linePath} stroke="currentColor" stroke-width="2" fill="none" />
            <!-- Points + values -->
            {#each points as [x, y], i}
              {@const v = cashflowSeries[i]!}
              <circle cx={x} cy={y} r="3" fill={v >= 0 ? '#10b981' : '#ef4444'} />
              <text x={x} y={y - 8} text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.7">
                {v > 0 ? '+' : ''}{v}
              </text>
            {/each}
            <!-- X-axis labels -->
            {#each cashflowSeries as _, i}
              <text x={ptsX(i)} y={h - 4} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.5">
                S{(latest?.week ?? 0) - (cashflowSeries.length - 1 - i)}
              </text>
            {/each}
            <!-- Y-axis labels -->
            <text x="2" y={ptsY(yMax)} font-size="9" fill="currentColor" fill-opacity="0.5">{Math.round(yMax)} €K</text>
            <text x="2" y={zeroY + 4} font-size="9" fill="currentColor" fill-opacity="0.5">0</text>
            <text x="2" y={ptsY(yMin) + 4} font-size="9" fill="currentColor" fill-opacity="0.5">{Math.round(yMin)} €K</text>
          </svg>
        </div>
      </section>

    {/if}
    {/if}

    {#if activeTab === 'patrocinadores'}
    {@const SLOT_META = {
      kit:             { label: '👕 Camiseta',        capacity: 1 },
      stadium_boards:  { label: '🪧 Carteles del estadio', capacity: data.boardsCapacity ?? 4 },
      press_room:      { label: '🎙 Sala de prensa',  capacity: 1 },
    } as const}
    {@const slotsOrder = ['kit', 'stadium_boards', 'press_room'] as const}
    {@const sponsorsBySlot = slotsOrder.reduce((acc, s) => {
      acc[s] = data.sponsors.filter((x) => (x as { slot?: string }).slot === s && x.status === 'active');
      return acc;
    }, {} as Record<string, typeof data.sponsors>)}
    {@const offersBySlot = slotsOrder.reduce((acc, s) => {
      acc[s] = (data.pendingSponsorOffers ?? []).filter(
        (o) => ((o.metadata as { slot?: string } | null)?.slot ?? 'kit') === s,
      );
      return acc;
    }, {} as Record<string, typeof data.pendingSponsorOffers>)}

    <div class="space-y-3">
      {#each slotsOrder as slotKey}
        {@const slotInfo = SLOT_META[slotKey]}
        {@const active = sponsorsBySlot[slotKey] ?? []}
        {@const offers = offersBySlot[slotKey] ?? []}
        <section class="card bg-base-100 shadow">
          <div class="card-body">
            <div class="flex items-baseline justify-between flex-wrap gap-2">
              <h2 class="card-title">{slotInfo.label}</h2>
              <span class="text-xs opacity-70">
                {active.length} / {slotInfo.capacity} ocupado{slotInfo.capacity === 1 ? '' : 's'}
              </span>
            </div>

            <!-- Active sponsors in this slot -->
            {#if active.length === 0}
              <p class="text-xs opacity-60 mt-1">Slot libre.</p>
            {:else}
              <div class="space-y-2 mt-2">
                {#each active as s}
                  {@const weeksLeft = s.endsWeek - (latest?.week ?? 0)}
                  <div class="flex items-center gap-3 p-2 bg-base-200 rounded">
                    <div class="flex-1">
                      <div class="font-semibold">{s.name}</div>
                      <div class="text-xs opacity-70">
                        <span class="badge badge-sm">Nivel {s.tier}</span>
                        · <span class="font-mono">{s.weeklyEurK} €K/sem</span>
                      </div>
                      <div class="text-xs opacity-60 mt-0.5">
                        Contrato hasta sem {s.endsWeek}
                        {#if weeksLeft > 0}
                          <span class="opacity-70">({weeksLeft} semana{weeksLeft === 1 ? '' : 's'} restante{weeksLeft === 1 ? '' : 's'})</span>
                        {:else}
                          <span class="badge badge-warning badge-xs ml-1">expira ya</span>
                        {/if}
                      </div>
                    </div>
                    <span class="badge {s.status === 'active' ? 'badge-success' : 'badge-ghost'}">
                      {s.status}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Pending offers for this slot -->
            {#if offers.length > 0}
              <div class="mt-3 pt-3 border-t border-base-300">
                <div class="text-xs uppercase opacity-70 mb-2 font-semibold">
                  📬 Ofertas pendientes ({offers.length})
                </div>
                <div class="space-y-2">
                  {#each offers as offer}
                    {@const meta = offer.metadata as { brand?: string; weeklyAmountEurK?: number; contractWeeks?: number; description?: string; qualityDelta?: number } | null}
                    <div class="p-2 bg-warning/5 border border-warning/30 rounded">
                      <div class="flex items-baseline justify-between flex-wrap gap-1">
                        <div class="font-semibold">{meta?.brand ?? 'Patrocinador'}</div>
                        <div class="text-xs opacity-70">Sem {offer.week}</div>
                      </div>
                      <div class="text-xs opacity-80 mt-1">
                        {#if meta?.weeklyAmountEurK}<strong>{meta.weeklyAmountEurK} €K/sem</strong>{/if}
                        {#if meta?.contractWeeks} · {meta.contractWeeks} sem{/if}
                        {#if meta?.weeklyAmountEurK && meta?.contractWeeks}
                          <span class="opacity-60">(≈{Math.round(meta.weeklyAmountEurK * meta.contractWeeks)} k€)</span>
                        {/if}
                      </div>
                      {#if meta?.description}
                        <div class="text-xs opacity-60 mt-1">{meta.description}</div>
                      {/if}
                      {#if meta?.qualityDelta !== undefined && meta.qualityDelta < 0}
                        <div class="text-xs text-warning mt-1">
                          ⚠ Afición: {meta.qualityDelta}
                        </div>
                      {/if}
                      <div class="flex gap-2 mt-2">
                        <form method="POST" action="?/decideSponsor" use:enhance bind:this={sponsorForms[`${offer.id}:accept`]}>
                          <input type="hidden" name="eventId" value={offer.id} />
                          <input type="hidden" name="choice" value="accept" />
                          <button
                            type="button"
                            class="btn btn-xs btn-primary"
                            onclick={() =>
                              askSponsorConfirm(
                                `Aceptar ${meta?.brand ?? 'patrocinador'}`,
                                `Firmas con ${meta?.brand ?? 'el patrocinador'} por ${meta?.weeklyAmountEurK ?? 0} €K/sem durante ${meta?.contractWeeks ?? 0} semanas. Las otras ofertas del mismo slot esta semana se descartarán.`,
                                'Aceptar',
                                false,
                                () => sponsorForms[`${offer.id}:accept`]?.requestSubmit(),
                              )}
                          >
                            Aceptar
                          </button>
                        </form>
                        <form method="POST" action="?/decideSponsor" use:enhance bind:this={sponsorForms[`${offer.id}:reject`]}>
                          <input type="hidden" name="eventId" value={offer.id} />
                          <input type="hidden" name="choice" value="reject" />
                          <button
                            type="button"
                            class="btn btn-xs btn-ghost"
                            onclick={() =>
                              askSponsorConfirm(
                                `Rechazar ${meta?.brand ?? 'oferta'}`,
                                `La oferta de ${meta?.brand ?? 'este patrocinador'} desaparecerá. Las otras ofertas siguen disponibles.`,
                                'Rechazar',
                                true,
                                () => sponsorForms[`${offer.id}:reject`]?.requestSubmit(),
                              )}
                          >
                            Rechazar
                          </button>
                        </form>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>
      {/each}
    </div>

    {/if}
  {/if}
</div>

<ConfirmDialog
  bind:open={priceConfirmOpen}
  title="Fijar precio del abono"
  message={`Vas a fijar el precio del abono en ${priceValues[0]} €. Una vez fijado no podrás cambiarlo hasta la próxima pretemporada y comenzará la campaña de abonados durante las próximas semanas.`}
  confirmLabel="Fijar precio"
  dangerous={false}
  onConfirm={() => priceFormEl?.requestSubmit()}
/>

<ConfirmDialog
  bind:open={sponsorConfirmOpen}
  title={sponsorConfirmTitle}
  message={sponsorConfirmMessage}
  confirmLabel={sponsorConfirmLabel}
  dangerous={sponsorConfirmDangerous}
  onConfirm={runPendingSponsor}
/>

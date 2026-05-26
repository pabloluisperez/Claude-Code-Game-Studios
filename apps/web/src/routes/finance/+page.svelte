<!--
  Finance panel — wired to apps/web/src/routes/finance/+page.server.ts.

  Story: HUD-UI-004
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  import { formatEurK, formatEurKSigned } from '$lib/format';
  import RecoveryLeversPanel from '$lib/components/recovery-levers-panel.svelte';
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

  // Bug B2 fix (playtest 2026-05-21 Pablo): svelte-range-slider-pips v4.1.1
  // is compiled against Svelte 4 (class-based components) and Svelte 5
  // rejects it with 'Class constructor RangeSlider cannot be invoked
  // without new'. The fallback native `<input type="range">` works fine
  // for the Abonos price selector — we leave RangeSlider permanently null
  // so the {:else} branch renders. If a Svelte 5-native slider library
  // becomes available, swap this back in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RangeSlider: any = null;
  void onMount;
  void browser;

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
  // Bug P1 (playtest 2026-05-21 Pablo): dashboard upcoming-events route
  // here with ?tab=patrocinadores so the user lands on the right tab.
  let activeTab = $state<FinanceTab>(
    $page.url.searchParams.get('tab') === 'patrocinadores' ? 'patrocinadores'
    : $page.url.searchParams.get('tab') === 'abonos' ? 'abonos'
    : 'resumen',
  );
  // Bug 2026-05-25 (Pablo): RecoveryLeversPanel links to /finance?tab=… via
  // <a href>. SvelteKit client-side nav updates $page but the activeTab state
  // initializer above only runs once. Sync activeTab whenever the URL changes
  // so the linked tab actually shows. User-driven button clicks set activeTab
  // directly (no URL change), so this $effect doesn't fight them.
  $effect(() => {
    const t = $page.url.searchParams.get('tab');
    // Pablo 2026-05-27: sidebar drives the section now. Plain /finance → resumen.
    activeTab = t === 'patrocinadores' ? 'patrocinadores' : t === 'abonos' ? 'abonos' : 'resumen';
  });
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
    <!-- a11y P1-4 (Sprint 11 task 11-3): each tab declares aria-selected
         + aria-controls; corresponding tabpanels expose role + id. -->

    {#if form?.ok && form.priceEur}
      <div class="alert alert-success">
        <span>Nuevo precio de abono: {form.priceEur}€ · {form.holders} abonados.</span>
      </div>
    {/if}

    <!-- Season tickets card -->
    {#if activeTab === 'abonos' && data.club}
      <div
        role="tabpanel"
        id="tabpanel-finance-abonos"
        aria-labelledby="tab-finance-abonos"
        class="card bg-base-100 shadow border-2 border-info/30"
      >
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
                {(data.club.seasonTicketHolders * data.club.seasonTicketPriceEur).toLocaleString('es-ES')} €
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
                    aria-label="Precio del abono en euros"
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
      </div>
    {/if}

    {#if activeTab === 'resumen'}
    <div
      role="tabpanel"
      id="tabpanel-finance-resumen"
      aria-labelledby="tab-finance-resumen"
      class="alert {statusClass[financialStatus] ?? 'alert-info'}"
    >
      <div>
        <div class="text-xs uppercase opacity-70">Estado financiero</div>
        <div class="text-lg font-bold">{statusName[financialStatus] ?? 'Desconocido'}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Balance</div>
          <div class="font-mono text-3xl {balance < 0 ? 'text-error' : ''}">{formatEurK(balance)}</div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Cashflow semanal</div>
          <div class="font-mono text-3xl {cashflow < 0 ? 'text-error' : 'text-success'}">
            {formatEurKSigned(cashflow)}
          </div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Ingresos sponsor</div>
          <div class="font-mono text-3xl text-success">{formatEurKSigned(sponsorRevenue)}</div>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50">Semana</div>
          <div class="font-mono text-3xl">{latest.week}</div>
        </div>
      </div>
    </div>

    <!-- Bug P13 fix (playtest 2026-05-21 Pablo): 'En finanzas ver un desglose
         donde se va el cashflow semanal, bien claro, si es en sueldos de quién
         son los sueldos, y otros gastos, ahora mismo ves que pierdes dinero
         pero no sabes donde recortar gastos.' -->
    {@const stateRead = latest.state as Record<string, number>}

    <!-- Sprint 10 task 10-3: Recovery levers coaching panel. Surfaces above
         the cashflow breakdown so 'En Riesgo / Crisis / Quiebra' players see
         the action list before they see the diagnosis. The component
         renders nothing when financialStatus === 0 (Sano). -->
    <RecoveryLeversPanel
      {financialStatus}
      pretemporada={data.pretemporada}
      pendingSponsorOffersCount={data.pendingSponsorOffers?.length ?? 0}
      activeStaff={data.activeStaff ?? []}
      playerWagesEurK={Math.round(stateRead['player_wages_weekly'] ?? 0)}
      staffCostEurK={Math.round(stateRead['staff_cost_weekly'] ?? 0)}
    />

    {@const incSponsor = Math.round(stateRead['sponsor_revenue_weekly'] ?? 0)}
    {@const incMatchday = Math.round(stateRead['matchday_revenue_weekly'] ?? 0)}
    {@const incTV = Math.round((stateRead['tv_revenue_weekly'] ?? 0) * 10) / 10}
    {@const incMerch = Math.round(stateRead['merch_revenue_weekly'] ?? 0)}
    {@const totalIncome = incSponsor + incMatchday + incTV + incMerch}
    {@const costStaff = Math.round(stateRead['staff_cost_weekly'] ?? 0)}
    {@const costPlayers = Math.round(stateRead['player_wages_weekly'] ?? 0)}
    {@const costStadium = Math.round(stateRead['stadium_reform_cost_weekly'] ?? 0)}
    {@const totalCost = costStaff + costPlayers + costStadium}
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">Desglose del cashflow semanal</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <!-- INGRESOS -->
          <div>
            <div class="text-xs uppercase opacity-70 mb-2">📈 Ingresos · +{formatEurK(totalIncome)}</div>
            <table class="table table-sm">
              <tbody>
                <tr>
                  <td>Patrocinadores</td>
                  <td class="text-right font-mono text-success">+{formatEurK(incSponsor)}</td>
                </tr>
                <tr>
                  <td>Taquilla (partido en casa)</td>
                  <td class="text-right font-mono {incMatchday > 0 ? 'text-success' : 'opacity-40'}">
                    {incMatchday > 0 ? '+' : ''}{formatEurK(incMatchday)}
                  </td>
                </tr>
                <tr>
                  <td>Derechos de TV</td>
                  <td class="text-right font-mono {incTV > 0 ? 'text-success' : 'opacity-40'}">
                    {incTV > 0 ? '+' : ''}{formatEurK(incTV)}
                  </td>
                </tr>
                <tr>
                  <td>Merchandising</td>
                  <td class="text-right font-mono text-success">+{formatEurK(incMerch)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- GASTOS -->
          <div>
            <div class="text-xs uppercase opacity-70 mb-2">📉 Gastos · −{formatEurK(totalCost)}</div>
            <table class="table table-sm">
              <tbody>
                <tr>
                  <td>Salarios de jugadores</td>
                  <td class="text-right font-mono text-error">−{formatEurK(costPlayers)}</td>
                </tr>
                <tr>
                  <td>Salarios del staff</td>
                  <td class="text-right font-mono text-error">−{formatEurK(costStaff)}</td>
                </tr>
                <tr>
                  <td>Reformas del estadio</td>
                  <td class="text-right font-mono {costStadium > 0 ? 'text-error' : 'opacity-40'}">
                    {costStadium > 0 ? '−' : ''}{formatEurK(costStadium)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recovery levers -->
        <div class="divider my-1"></div>
        <div class="text-xs opacity-70">
          <strong>Para recortar gastos:</strong>
          <a href="/staff" class="link">despide staff de tier alto</a> ·
          <a href="/squad" class="link">vende jugadores</a>
          en el mercado de fichajes.
          <strong>Para subir ingresos:</strong> firma nuevos
          <a href="/finance?tab=patrocinadores" class="link">patrocinadores</a> ·
          ajusta el <a href="/finance?tab=abonos" class="link">precio de abono</a>
          en pretemporada.
        </div>
      </div>
    </section>

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
            <text x="2" y={ptsY(yMax)} font-size="9" fill="currentColor" fill-opacity="0.5">{formatEurK(yMax)}</text>
            <text x="2" y={zeroY + 4} font-size="9" fill="currentColor" fill-opacity="0.5">0</text>
            <text x="2" y={ptsY(yMin) + 4} font-size="9" fill="currentColor" fill-opacity="0.5">{formatEurK(yMin)}</text>
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

    <div
      role="tabpanel"
      id="tabpanel-finance-patrocinadores"
      aria-labelledby="tab-finance-patrocinadores"
      class="space-y-3"
    >
      <!-- Pablo 2026-05-26: renovaciones de patrocinador decididas aquí (en contexto). -->
      {#if data.pendingSponsorRenewals && data.pendingSponsorRenewals.length > 0}
        <section class="card bg-warning/10 border border-warning shadow">
          <div class="card-body">
            <h2 class="card-title text-base">🔁 Renovaciones pendientes</h2>
            {#each data.pendingSponsorRenewals as ev (ev.id)}
              {@const m = ev.metadata as { brand?: string; currentWeeklyEurK?: number; proposedWeeklyEurK?: number; contractWeeks?: number; currentContractWeeks?: number; tier?: number }}
              {@const amtBetter = (m.proposedWeeklyEurK ?? 0) >= (m.currentWeeklyEurK ?? 0)}
              {@const durBetter = (m.contractWeeks ?? 0) >= (m.currentContractWeeks ?? 0)}
              <div class="bg-base-100 rounded p-3 mt-2">
                <div class="font-semibold">{m.brand} <span class="opacity-60 text-xs">(tier {m.tier ?? '?'})</span></div>
                <div class="flex items-center justify-between gap-3 mt-2 text-sm">
                  <div>
                    <div class="text-xs opacity-60">Pagaba</div>
                    <div class="font-mono font-bold">€{m.currentWeeklyEurK}K/sem</div>
                    <div class="text-xs opacity-50">{m.currentContractWeeks ?? '?'} sem</div>
                  </div>
                  <div class="text-xl opacity-40">→</div>
                  <div>
                    <div class="text-xs opacity-60">Ofrece</div>
                    <div class="font-mono font-bold {amtBetter ? 'text-success' : 'text-warning'}">€{m.proposedWeeklyEurK}K/sem</div>
                    <div class="text-xs {durBetter ? 'text-success' : 'text-warning'}">{m.contractWeeks} sem</div>
                  </div>
                </div>
                <div class="text-xs font-semibold mt-2">
                  {#if amtBetter && durBetter}✅ Mejor: paga más y por más tiempo.
                  {:else if amtBetter}🟡 Paga más, pero por menos tiempo.
                  {:else if durBetter}🟡 Paga menos, pero por más tiempo.
                  {:else}🔻 Peor: paga menos y por menos tiempo.{/if}
                </div>
                <div class="flex gap-2 mt-3">
                  <form method="POST" action="?/decideSponsorRenewal" use:enhance>
                    <input type="hidden" name="eventId" value={ev.id} />
                    <input type="hidden" name="choice" value="renew" />
                    <button type="submit" class="btn btn-sm btn-success">Renovar</button>
                  </form>
                  <form method="POST" action="?/decideSponsorRenewal" use:enhance>
                    <input type="hidden" name="eventId" value={ev.id} />
                    <input type="hidden" name="choice" value="decline" />
                    <button type="submit" class="btn btn-sm btn-ghost">No renovar</button>
                  </form>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

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
                        · <span class="font-mono">{formatEurK(s.weeklyEurK)}/sem</span>
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
                <!-- First-time sponsor onboarding callout — shows when no active sponsor in this slot.
                     Sprint 9 task 9-4 friction #3 — agent walkthrough flagged STOP modal needs first-time context. -->
                {#if active.length === 0}
                  <div class="alert alert-info text-xs mb-2 py-2">
                    <div class="flex flex-col gap-0.5">
                      <span class="font-semibold">💡 Aún no tienes patrocinador aquí</span>
                      <span class="opacity-90">
                        Aceptar firma un acuerdo semanal por las jornadas indicadas. Rechazar
                        descarta esa oferta pero las demás siguen sobre la mesa. El ingreso
                        del patrocinador entra cada semana en caja.
                      </span>
                    </div>
                  </div>
                {/if}
                <div class="space-y-2">
                  {#each offers as offer}
                    {@const meta = offer.metadata as { brand?: string; weeklyAmountEurK?: number; contractWeeks?: number; description?: string; qualityDelta?: number } | null}
                    <div class="p-2 bg-warning/5 border border-warning/30 rounded">
                      <div class="flex items-baseline justify-between flex-wrap gap-1">
                        <div class="font-semibold">{meta?.brand ?? 'Patrocinador'}</div>
                        <div class="text-xs opacity-70">Sem {offer.week}</div>
                      </div>
                      <div class="text-xs opacity-80 mt-1">
                        {#if meta?.weeklyAmountEurK}<strong>{formatEurK(meta.weeklyAmountEurK)}/sem</strong>{/if}
                        {#if meta?.contractWeeks} · {meta.contractWeeks} sem{/if}
                        {#if meta?.weeklyAmountEurK && meta?.contractWeeks}
                          <span class="opacity-60">(≈ {formatEurK(meta.weeklyAmountEurK * meta.contractWeeks)} total)</span>
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
                            aria-label="Aceptar oferta de {meta?.brand ?? 'patrocinador'}"
                            onclick={() =>
                              askSponsorConfirm(
                                `Aceptar ${meta?.brand ?? 'patrocinador'}`,
                                `Firmas con ${meta?.brand ?? 'el patrocinador'} por ${formatEurK(meta?.weeklyAmountEurK ?? 0)}/sem durante ${meta?.contractWeeks ?? 0} semanas. Las otras ofertas del mismo slot esta semana se descartarán.`,
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
                            aria-label="Rechazar oferta de {meta?.brand ?? 'patrocinador'}"
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

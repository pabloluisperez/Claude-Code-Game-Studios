<!--
  Finance panel — wired to apps/web/src/routes/finance/+page.server.ts.

  Story: HUD-UI-004
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  let { data, form }: { data: PageData; form: ActionData } = $props();

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
    {#if form?.ok && form.priceEur}
      <div class="alert alert-success">
        <span>Nuevo precio de abono: {form.priceEur}€ · {form.holders} abonados.</span>
      </div>
    {/if}

    <!-- Season tickets card -->
    {#if data.club}
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
            <form method="POST" action="?/setTicketPrice" use:enhance class="mt-2">
              <label class="form-control w-full max-w-xs">
                <span class="label-text text-xs">Fijar precio del abono (5-200 €)</span>
                <div class="join">
                  <input
                    class="join-item input input-bordered"
                    type="number"
                    name="priceEur"
                    min="5"
                    max="200"
                    step="5"
                    value={data.club.seasonTicketPriceEur}
                  />
                  <button type="submit" class="join-item btn btn-primary">Fijar</button>
                </div>
              </label>
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
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Cashflow últimas {cashflowSeries.length} semanas</h2>
          <div class="flex items-end gap-2 h-32 pt-4">
            {#each cashflowSeries as cf, i}
              <div class="flex-1 flex flex-col items-center gap-1">
                <div class="text-xs font-mono">{cf > 0 ? '+' : ''}{cf}</div>
                <div
                  class="w-full rounded-t {cf >= 0 ? 'bg-success' : 'bg-error'}"
                  style="height: {(Math.abs(cf) / cashflowMax) * 100}%"
                ></div>
                <div class="text-xs opacity-60">S-{cashflowSeries.length - 1 - i}</div>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Patrocinadores</h2>
        {#if data.sponsors.length === 0}
          <p class="opacity-60 text-sm">Aún no hay patrocinadores registrados.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Marca</th><th>Tier</th><th class="text-right">€K/sem</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {#each data.sponsors as s}
                  <tr>
                    <td class="font-semibold">{s.name}</td>
                    <td><span class="badge">Tier {s.tier}</span></td>
                    <td class="text-right font-mono">{s.weeklyEurK}</td>
                    <td>
                      <span class="badge {s.status === 'active' ? 'badge-success' : s.status === 'cancelled' ? 'badge-error' : 'badge-ghost'}">
                        {s.status}
                      </span>
                      {#if s.cancellationReason}
                        <span class="text-xs opacity-60 ml-2">{s.cancellationReason}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

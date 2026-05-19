<!--
  Finance panel — wired to apps/web/src/routes/finance/+page.server.ts.

  Story: HUD-UI-004
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

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

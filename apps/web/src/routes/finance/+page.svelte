<!--
  Finance panel — balance + 4-week cashflow + revenue/cost breakdown +
  bankruptcy state banner + sponsors list.

  Story: HUD-UI-004
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  const state = {
    balance: 38,
    weeklyCashflow: -3,
    financialStatus: 1, // 0=Sano | 1=En Riesgo | 2=Crisis | 3=Quiebra
    last4Cashflow: [-2, +5, -3, -3],
    revenue: { matchDay: 0, sponsors: 5, tvRights: 3, total: 8 },
    costs:   { playerWages: 8, staffWages: 3, catering: 2, scouting: 1.2, groundskeeper: 2, maintenance: 2, total: 18.2 },
  };

  interface SponsorRow {
    id: string;
    brand: string;
    tier: number;
    weeklyEurK: number;
    status: 'active' | 'cancelled' | 'expired';
    cancellationReason: string | null;
  }
  const sponsors: SponsorRow[] = [
    { id: 's1', brand: 'Pueblo Bakery', tier: 1, weeklyEurK: 3, status: 'active', cancellationReason: null },
    { id: 's2', brand: 'Tienda Garcés', tier: 1, weeklyEurK: 2, status: 'active', cancellationReason: null },
    { id: 's3', brand: 'Antigua S.A.',  tier: 2, weeklyEurK: 5, status: 'cancelled', cancellationReason: 'scandal' },
  ];

  const statusName = ['Sano', 'En Riesgo', 'Crisis', 'Quiebra'];
  const statusClass = ['alert-success', 'alert-warning', 'alert-error', 'alert-error'];

  const cashflowMax = Math.max(...state.last4Cashflow.map(Math.abs), 1);
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Finanzas</h1>
    <p class="opacity-60">Balance, ingresos, gastos y patrocinadores del club</p>
  </header>

  <!-- Bankruptcy banner -->
  <div class="alert {statusClass[state.financialStatus]}">
    <div>
      <div class="text-xs uppercase opacity-70">Estado financiero</div>
      <div class="text-lg font-bold">{statusName[state.financialStatus]}</div>
    </div>
  </div>

  <!-- Headline numbers -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="text-xs uppercase opacity-50">Balance</div>
        <div class="font-mono text-3xl {state.balance < 0 ? 'text-error' : ''}">{state.balance} €K</div>
      </div>
    </div>
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="text-xs uppercase opacity-50">Cashflow semanal</div>
        <div class="font-mono text-3xl {state.weeklyCashflow < 0 ? 'text-error' : 'text-success'}">
          {state.weeklyCashflow > 0 ? '+' : ''}{state.weeklyCashflow} €K
        </div>
      </div>
    </div>
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="text-xs uppercase opacity-50">Ingresos semana</div>
        <div class="font-mono text-3xl text-success">+{state.revenue.total} €K</div>
      </div>
    </div>
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="text-xs uppercase opacity-50">Costes semana</div>
        <div class="font-mono text-3xl text-error">-{state.costs.total} €K</div>
      </div>
    </div>
  </div>

  <!-- 4-week cashflow trend -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Últimas 4 semanas</h2>
      <div class="flex items-end gap-2 h-32 pt-4">
        {#each state.last4Cashflow as cf, i}
          <div class="flex-1 flex flex-col items-center gap-1">
            <div class="text-xs font-mono">{cf > 0 ? '+' : ''}{cf}</div>
            <div
              class="w-full rounded-t {cf >= 0 ? 'bg-success' : 'bg-error'}"
              style="height: {(Math.abs(cf) / cashflowMax) * 100}%"
            ></div>
            <div class="text-xs opacity-60">S-{4 - i}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Revenue + costs breakdown -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Ingresos</h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span>Match-day</span><span class="font-mono">{state.revenue.matchDay} €K</span></div>
          <div class="flex justify-between"><span>Patrocinadores</span><span class="font-mono">{state.revenue.sponsors} €K</span></div>
          <div class="flex justify-between"><span>TV rights</span><span class="font-mono">{state.revenue.tvRights} €K</span></div>
          <div class="divider my-1"></div>
          <div class="flex justify-between font-semibold"><span>Total</span><span class="font-mono">{state.revenue.total} €K</span></div>
        </div>
      </div>
    </section>

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Gastos</h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span>Salarios jugadores</span><span class="font-mono">{state.costs.playerWages} €K</span></div>
          <div class="flex justify-between"><span>Salarios staff</span><span class="font-mono">{state.costs.staffWages} €K</span></div>
          <div class="flex justify-between"><span>Catering</span><span class="font-mono">{state.costs.catering} €K</span></div>
          <div class="flex justify-between"><span>Scouting</span><span class="font-mono">{state.costs.scouting} €K</span></div>
          <div class="flex justify-between"><span>Jardinero</span><span class="font-mono">{state.costs.groundskeeper} €K</span></div>
          <div class="flex justify-between"><span>Mantenimiento</span><span class="font-mono">{state.costs.maintenance} €K</span></div>
          <div class="divider my-1"></div>
          <div class="flex justify-between font-semibold"><span>Total</span><span class="font-mono">{state.costs.total} €K</span></div>
        </div>
      </div>
    </section>
  </div>

  <!-- Sponsors -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Patrocinadores</h2>
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr><th>Marca</th><th>Tier</th><th class="text-right">€K/sem</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {#each sponsors as s}
              <tr>
                <td class="font-semibold">{s.brand}</td>
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
    </div>
  </section>
</div>

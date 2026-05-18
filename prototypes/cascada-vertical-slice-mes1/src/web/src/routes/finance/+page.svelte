<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Finance — basic per-week proxy from fan_attendance + ticket_price_index.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getState, type StateDto } from "$lib/api";

  let pt: StateDto | null = $state(null);
  let error: string | null = $state(null);

  // Slice-only revenue/cost proxies — production uses economy.md F-functions
  const WEEKLY_FIXED_COSTS = 18; // €K — salaries + staff + maintenance baseline
  const STADIUM_CAPACITY = 3000;
  const TICKET_PRICE_BASE = 8; // €
  const TRAINING_COST_BASE = 6; // €K — at intensity 50

  function ticketRevenue(s: NonNullable<StateDto["snapshot"]>): number {
    // (fan_attendance/100) × CAPACITY × ticket_price_eur / 1000 (k€)
    const ticketEur = TICKET_PRICE_BASE * (s.state.ticket_price_index / 50);
    return (s.state.fan_attendance / 100) * STADIUM_CAPACITY * (ticketEur / 1000);
  }

  function trainingCost(s: NonNullable<StateDto["snapshot"]>): number {
    return TRAINING_COST_BASE * (0.4 + (s.state.training_intensity / 100) * 0.4);
  }

  async function load() {
    try {
      pt = await getState();
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  onMount(load);
</script>

<h1>Finanzas (proyección semanal)</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{:else if pt?.snapshot}
  {@const snap = pt.snapshot}
  {@const tickets = ticketRevenue(snap)}
  {@const training = trainingCost(snap)}
  {@const balance = tickets - WEEKLY_FIXED_COSTS - training}
  <div class="metrics-grid">
    <div class="panel">
      <div class="metric-label">Taquilla esta semana</div>
      <div class="metric-value good">{tickets.toFixed(1)} €K</div>
      <div class="dim">@ {(TICKET_PRICE_BASE * (snap.state.ticket_price_index / 50)).toFixed(1)} €/entrada · {snap.state.fan_attendance.toFixed(0)}% aforo</div>
    </div>
    <div class="panel">
      <div class="metric-label">Costes fijos</div>
      <div class="metric-value bad">-{WEEKLY_FIXED_COSTS.toFixed(1)} €K</div>
    </div>
    <div class="panel">
      <div class="metric-label">Coste de entreno</div>
      <div class="metric-value bad">-{training.toFixed(1)} €K</div>
      <div class="dim">intensidad {snap.state.training_intensity}</div>
    </div>
    <div class="panel">
      <div class="metric-label">Balance proyectado</div>
      <div class="metric-value" class:good={balance >= 0} class:bad={balance < 0}>
        {balance >= 0 ? "+" : ""}{balance.toFixed(1)} €K
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top: var(--space-4);">
    <h2>Nota del director financiero</h2>
    <p class="dim">
      {#if balance < -10}
        "Esto no va. A este ritmo el club entra en pérdidas críticas en pocas semanas."
      {:else if balance < 0}
        "Cuidado: estamos en negativo. Sostenible un mes; dos meses no."
      {:else}
        "Vamos justos pero estamos en verde. Cualquier sorpresa nos toca."
      {/if}
    </p>
  </div>
{:else}
  <p class="dim">Cargando estado…</p>
{/if}

<style>
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
  }
</style>

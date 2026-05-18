<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Dashboard — Day 8 placeholder. Day 9 wires the decisions panel here.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getState, postAdvance, type StateDto, type AdvanceResponse } from "$lib/api";

  let pt: StateDto | null = $state(null);
  let trainingIntensity = $state(50);
  let ticketPriceIndex = $state(50);
  let lastResult: AdvanceResponse | null = $state(null);
  let pending = $state(false);
  let error = $state<string | null>(null);

  async function refresh() {
    try {
      pt = await getState();
      if (pt.snapshot?.state) {
        trainingIntensity = pt.snapshot.state.training_intensity ?? 50;
        ticketPriceIndex = pt.snapshot.state.ticket_price_index ?? 50;
      }
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  async function advance() {
    pending = true;
    error = null;
    try {
      lastResult = await postAdvance({
        training_intensity: trainingIntensity,
        ticket_price_index: ticketPriceIndex,
      });
      await refresh();
    } catch (err) {
      error = `Advance failed: ${(err as Error).message}`;
    } finally {
      pending = false;
    }
  }

  onMount(refresh);
</script>

<h1>Esta semana</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad); margin-bottom: var(--space-4);">
    {error}
  </div>
{/if}

{#if pt}
  <div class="metrics-grid">
    <div class="panel">
      <div class="metric-label">Semana</div>
      <div class="metric-value">{pt.playthrough.currentWeek}</div>
    </div>
    <div class="panel">
      <div class="metric-label">Forma del equipo</div>
      <div class="metric-value">{pt.snapshot?.state.team_fitness.toFixed(0) ?? "—"}</div>
    </div>
    <div class="panel">
      <div class="metric-label">Afición (fan_momentum)</div>
      <div
        class="metric-value"
        class:bad={(pt.snapshot?.state.fan_momentum ?? 50) < 20}
        class:warn={(pt.snapshot?.state.fan_momentum ?? 50) < 35}
      >
        {pt.snapshot?.state.fan_momentum.toFixed(0) ?? "—"}
      </div>
    </div>
    <div class="panel">
      <div class="metric-label">Asistencia (último)</div>
      <div class="metric-value">{pt.snapshot?.state.fan_attendance.toFixed(0) ?? "—"}%</div>
    </div>
  </div>

  <div class="panel decisions">
    <h2>Decisiones de esta semana</h2>
    <div class="decision-row">
      <label>
        <div class="metric-label">Intensidad de entrenamiento</div>
        <input type="range" min="0" max="100" bind:value={trainingIntensity} />
        <div class="value-row">
          <span>0 (descanso)</span>
          <strong>{trainingIntensity}</strong>
          <span>(carga máxima) 100</span>
        </div>
      </label>
    </div>
    <div class="decision-row">
      <label>
        <div class="metric-label">Precio de entradas (índice)</div>
        <input type="range" min="0" max="100" bind:value={ticketPriceIndex} />
        <div class="value-row">
          <span>0 (regalado)</span>
          <strong>{ticketPriceIndex}</strong>
          <span>(carísimo) 100</span>
        </div>
      </label>
    </div>
    <button class="primary" disabled={pending} onclick={advance}>
      {pending ? "Procesando…" : "Avanzar semana →"}
    </button>
  </div>

  {#if lastResult}
    <div class="panel" style="margin-top: var(--space-4);">
      <h2>Semana {lastResult.weekProcessed} cerrada</h2>
      {#if lastResult.playerMatchOutcome}
        <p>
          Resultado:
          <strong>
            {lastResult.playerMatchOutcome.homeScore}-{lastResult.playerMatchOutcome.awayScore}
          </strong>
          ·
          {lastResult.playerMatchOutcome.winner}
          · ∆MPI {lastResult.playerMatchOutcome.worldStateDeltas.match_performance_index}
        </p>
      {/if}
      {#if lastResult.thresholdCrossings.length}
        <p class="warn">⚠ {lastResult.thresholdCrossings.length} threshold(s) cruzado(s).</p>
      {/if}
      {#if lastResult.managerLeveledUp}
        <p class="good">⬆ ¡Has subido de nivel! ({lastResult.managerState.level})</p>
      {/if}
    </div>
  {/if}
{:else}
  <p class="dim">Cargando estado…</p>
{/if}

<style>
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .decisions {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .decision-row label { display: block; }
  .value-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
    color: var(--fg-dim);
    margin-top: var(--space-1);
  }
  .value-row strong { color: var(--fg); font-size: var(--text-lg); }
</style>

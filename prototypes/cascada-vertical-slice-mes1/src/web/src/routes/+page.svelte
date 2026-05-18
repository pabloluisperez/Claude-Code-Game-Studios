<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Dashboard — Day 13 polish: onboarding banner, match-week prompt, end-of-month auto-redirect.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getState, postAdvance, type StateDto, type AdvanceResponse } from "$lib/api";

  let pt: StateDto | null = $state(null);
  let trainingIntensity = $state(50);
  let ticketPriceIndex = $state(50);
  let lastResult: AdvanceResponse | null = $state(null);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let showOnboarding = $state(true);

  async function refresh() {
    try {
      pt = await getState();
      if (pt.snapshot?.state) {
        trainingIntensity = pt.snapshot.state.training_intensity ?? 50;
        ticketPriceIndex = pt.snapshot.state.ticket_price_index ?? 50;
      }
      // Auto-redirect to end-of-month when mes 1 has closed
      if (pt.playthrough.currentWeek > 4) {
        await goto("/end-of-month");
        return;
      }
      // Hide onboarding once we have a snapshot beyond week 1
      if ((pt.snapshot?.week ?? 0) > 0) showOnboarding = false;
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  async function advance() {
    pending = true;
    error = null;
    showOnboarding = false;
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

  // Match weeks in this slice: every week has a fixture for Real Pueblo (1..4)
  const isMatchWeek = $derived.by(() => {
    const w = pt?.playthrough?.currentWeek ?? 0;
    return w >= 1 && w <= 4;
  });

  onMount(refresh);
</script>

<h1>Esta semana</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad); margin-bottom: var(--space-4);">
    {error}
  </div>
{/if}

{#if showOnboarding}
  <div class="panel onboarding">
    <h2>Bienvenido al Real Pueblo CF</h2>
    <p>
      Acabas de aterrizar en la oficina de un club humilde en <strong>Segunda
      División</strong>. La afición está desencantada (fan_momentum=35), las
      finanzas justas, y tienes 4 jornadas para empezar a dar señales.
    </p>
    <p>
      Cada semana decides dos cosas: <strong>cómo entrenar</strong> y
      <strong>cuánto cobrar la entrada</strong>. El staff te avisará si ve
      algo raro. Las cascadas son reales — y a veces contraintuitivas.
    </p>
    <p class="dim">
      Toma una decisión y pulsa <em>Avanzar semana</em>. No hay reloj — el
      tiempo se detiene hasta que tú lo decidas. Calma.
    </p>
    <button onclick={() => (showOnboarding = false)}>Empezar</button>
  </div>
{/if}

{#if pt && !showOnboarding}
  {#if isMatchWeek}
    <div class="panel match-prompt">
      <h2>🎮 Hay partido esta semana</h2>
      <p class="dim">
        Puedes jugar el partido en directo (con decisión de cambio al descanso),
        o avanzar directamente y dejar que el equipo lo juegue solo.
      </p>
      <a href="/match" class="button-link primary-link">Jugar partido en directo →</a>
    </div>
  {/if}

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
        <p class="hint dim">
          Sweet spot ~50. El extremo bajo (descanso total) y el extremo alto (sobrecarga)
          tienen efectos diferentes — el staff te lo dirá si ve algo.
        </p>
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
        <p class="hint dim">
          50 = precio del mercado. Subirlo genera ingresos pero la afición tiene memoria.
        </p>
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
          {lastResult.playerMatchOutcome.winner === "draw"
            ? "empate"
            : lastResult.playerMatchOutcome.winner === "home"
              ? "victoria local"
              : "victoria visitante"}
          · ∆MPI {lastResult.playerMatchOutcome.worldStateDeltas.match_performance_index}
        </p>
      {/if}
      {#if lastResult.thresholdCrossings.length}
        <p class="warn">⚠ {lastResult.thresholdCrossings.length} umbral(es) cruzados — revisa /staff.</p>
      {/if}
      {#if lastResult.managerLeveledUp}
        <p class="good">⬆ ¡Has subido de nivel! (Lvl {lastResult.managerState.level})</p>
      {/if}
      <p class="dim">
        <a href="/staff">Ver lo que dice el staff →</a>
      </p>
    </div>
  {/if}
{:else if !pt}
  <p class="dim">Cargando estado…</p>
{/if}

<style>
  .onboarding { border-color: var(--accent); margin-bottom: var(--space-4); }
  .onboarding p { margin-bottom: var(--space-2); }
  .match-prompt { border-color: var(--warn); margin-bottom: var(--space-4); }
  .button-link { display: inline-block; padding: var(--space-2) var(--space-4); border: 1px solid var(--border); border-radius: 6px; text-decoration: none; }
  .button-link.primary-link { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .decisions { display: flex; flex-direction: column; gap: var(--space-4); }
  .decision-row label { display: block; }
  .hint { font-size: var(--text-sm); margin-top: var(--space-1); }
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

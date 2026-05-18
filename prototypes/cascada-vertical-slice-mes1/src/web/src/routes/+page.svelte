<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Dashboard — Day 13 polish: onboarding banner, match-week prompt, end-of-month auto-redirect.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getState, postAdvance, type StateDto, type AdvanceResponse } from "$lib/api";

  // ── UI → engine mappings ────────────────────────────────────────────────
  // The cascade engine consumes 0-100 indices. The UI exposes natural units
  // (categorical buckets for intensity, euros for price) and translates here.

  type IntensityBucket = "descanso" | "suave" | "normal" | "fuerte" | "brutal";
  const INTENSITY_BUCKETS: { id: IntensityBucket; label: string; index: number; danger?: "good" | "warn" | "bad" }[] = [
    { id: "descanso", label: "Descanso", index: 10, danger: "warn" },
    { id: "suave", label: "Suave", index: 30 },
    { id: "normal", label: "Normal", index: 50, danger: "good" },
    { id: "fuerte", label: "Fuerte", index: 70 },
    { id: "brutal", label: "Brutal", index: 90, danger: "bad" },
  ];

  // Real Pueblo (Segunda humilde): max 25€, market price 10€, erosion ~13€
  // TODO production: compute MAX_TICKET_EUR from f(stadium_capacity, division_tier, fan_culture)
  const MARKET_TICKET_EUR = 10;
  const MAX_TICKET_EUR = 25;
  const TICKET_STEP_EUR = 5;
  const EROSION_INDEX_THRESHOLD = 65; // T_price_danger from cascade-engine.md C15

  function eurosToIndex(eur: number): number {
    // index where market (10€) = 50 → index = euros / 10 × 50 = euros × 5
    return Math.min(100, Math.round((eur / MARKET_TICKET_EUR) * 50));
  }
  function indexToEuros(idx: number): number {
    return Math.round((idx / 50) * MARKET_TICKET_EUR);
  }
  function snapToStep(eur: number): number {
    return Math.round(eur / TICKET_STEP_EUR) * TICKET_STEP_EUR;
  }

  let pt: StateDto | null = $state(null);
  let intensityBucket: IntensityBucket = $state("normal");
  let ticketPriceEur = $state(MARKET_TICKET_EUR);
  let lastResult: AdvanceResponse | null = $state(null);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let showOnboarding = $state(true);

  const trainingIntensity = $derived(
    INTENSITY_BUCKETS.find((b) => b.id === intensityBucket)?.index ?? 50,
  );
  const ticketPriceIndex = $derived(eurosToIndex(ticketPriceEur));
  const priceWillErode = $derived(ticketPriceIndex > EROSION_INDEX_THRESHOLD);

  async function refresh() {
    try {
      pt = await getState();
      if (pt.snapshot?.state) {
        // Hydrate intensity bucket from the persisted index (nearest bucket)
        const persistedIntensity = pt.snapshot.state.training_intensity ?? 50;
        intensityBucket =
          INTENSITY_BUCKETS.reduce((best, b) =>
            Math.abs(b.index - persistedIntensity) < Math.abs(best.index - persistedIntensity) ? b : best,
          ).id;
        // Hydrate price euros from the persisted index (snap to step)
        const persistedPriceIndex = pt.snapshot.state.ticket_price_index ?? 50;
        ticketPriceEur = snapToStep(indexToEuros(persistedPriceIndex));
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
        // UI exposes natural units; translate to engine indices on submit
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

    <!-- Intensidad: button group categórico -->
    <div class="decision-row">
      <div class="metric-label">Intensidad de entrenamiento</div>
      <div class="bucket-group" role="radiogroup" aria-label="Intensidad de entrenamiento">
        {#each INTENSITY_BUCKETS as b}
          <button
            type="button"
            role="radio"
            aria-checked={intensityBucket === b.id}
            class:active={intensityBucket === b.id}
            class:good={intensityBucket === b.id && b.danger === "good"}
            class:warn={intensityBucket === b.id && b.danger === "warn"}
            class:bad={intensityBucket === b.id && b.danger === "bad"}
            onclick={() => (intensityBucket = b.id)}
          >
            {b.label}
          </button>
        {/each}
      </div>
      <p class="hint dim">
        Parábola invertida (C4): el centro premia, los extremos castigan. Con
        rachas de derrota, mantener intensidad alta sobreentrena.
      </p>
    </div>

    <!-- Precio: slider en €, step 5€, max contextual -->
    <div class="decision-row">
      <div class="metric-label">
        Precio de la entrada ·
        <strong class="current">{ticketPriceEur}€</strong>
        {#if priceWillErode}
          <span class="warn">· erosionando lealtad</span>
        {:else if ticketPriceEur === 0}
          <span class="dim">· entrada gratis</span>
        {:else if ticketPriceEur === MARKET_TICKET_EUR}
          <span class="good">· precio del mercado</span>
        {/if}
      </div>
      <div class="slider-wrap">
        <input
          type="range"
          min="0"
          max={MAX_TICKET_EUR}
          step={TICKET_STEP_EUR}
          bind:value={ticketPriceEur}
        />
        <div class="slider-anchors">
          {#each [0, 5, 10, 15, 20, 25] as anchorEur}
            <span
              class="anchor"
              class:sweet={anchorEur === MARKET_TICKET_EUR}
              class:danger={anchorEur >= 15}
              style="left: {(anchorEur / MAX_TICKET_EUR) * 100}%"
            >
              <span class="tick"></span>
              <span class="anchor-label">
                {anchorEur}€
                {#if anchorEur === MARKET_TICKET_EUR}<br>mercado{/if}
                {#if anchorEur === 15}<br>erosión{/if}
              </span>
            </span>
          {/each}
        </div>
      </div>
      <p class="hint dim">
        Mercado de Segunda humilde: <strong>{MARKET_TICKET_EUR}€</strong>.
        Por encima de 15€, la afición lo recuerda 2 semanas después
        (C15 — erosión diferida).
      </p>
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
  .decisions { display: flex; flex-direction: column; gap: var(--space-5); }
  .decision-row { display: flex; flex-direction: column; gap: var(--space-1); }
  .decision-row .current { color: var(--accent); font-size: var(--text-lg); font-variant-numeric: tabular-nums; }

  /* Button group (segmented control) for categorical decisions */
  .bucket-group {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0;
    background: var(--bg-3);
    border-radius: 8px;
    padding: 2px;
    border: 1px solid var(--border);
  }
  .bucket-group button {
    background: transparent;
    border: none;
    padding: var(--space-2);
    color: var(--fg-dim);
    font-size: var(--text-sm);
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
  }
  .bucket-group button:hover { color: var(--fg); }
  .bucket-group button.active {
    background: var(--bg);
    color: var(--fg);
    font-weight: 600;
  }
  .bucket-group button.active.good { color: var(--accent); border: 1px solid var(--accent); }
  .bucket-group button.active.warn { color: var(--warn); border: 1px solid var(--warn); }
  .bucket-group button.active.bad { color: var(--bad); border: 1px solid var(--bad); }

  /* Discrete euro slider */
  .slider-wrap { position: relative; padding-bottom: 32px; }
  .slider-wrap input[type="range"] { width: 100%; margin: 0; }
  .slider-anchors { position: relative; height: 28px; margin-top: -2px; }
  .anchor {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
  }
  .anchor .tick {
    width: 1px;
    height: 6px;
    background: var(--border);
  }
  .anchor.sweet .tick { background: var(--accent); width: 2px; }
  .anchor.danger .tick { background: var(--bad); width: 2px; }
  .anchor-label {
    font-size: 10px;
    color: var(--fg-dim);
    white-space: nowrap;
    margin-top: 2px;
    text-align: center;
    line-height: 1.1;
  }
  .anchor.sweet .anchor-label { color: var(--accent); font-weight: 600; }
  .anchor.danger .anchor-label { color: var(--bad); font-weight: 600; }
  .hint { font-size: var(--text-sm); margin-top: var(--space-2); }
</style>

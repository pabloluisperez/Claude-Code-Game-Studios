<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Dashboard — Day 13 polish: onboarding banner, match-week prompt, end-of-month auto-redirect.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import RangeSlider from "svelte-range-slider-pips";
  import "svelte-range-slider-pips/dist/range-slider-pips.css";
  import { getState, postAdvance, type StateDto, type AdvanceResponse } from "$lib/api";
  import {
    formatAttendance,
    formatFanMomentum,
    formatFitness,
    severityClass,
    STADIUM_CAPACITY_DEFAULT,
  } from "$lib/format";

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
  // svelte-range-slider-pips uses array of values (single-handle = 1-element array)
  let priceValues = $state<[number]>([MARKET_TICKET_EUR]);
  const ticketPriceEur = $derived(priceValues[0]);
  let lastResult: AdvanceResponse | null = $state(null);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let showOnboarding = $state(true);

  // Pip labels — football language, no engine jargon
  const PRICE_LABELS: Record<number, string> = {
    0: "Gratis",
    5: "Barato",
    10: "Mercado",
    15: "Caro",
    20: "Muy caro",
    25: "Carísimo",
  };
  function formatPip(v: number): string {
    return `${v}€\n${PRICE_LABELS[v] ?? ""}`;
  }
  function formatHandle(v: number): string {
    return `${v}€ · ${PRICE_LABELS[v] ?? ""}`;
  }

  const trainingIntensity = $derived(
    INTENSITY_BUCKETS.find((b) => b.id === intensityBucket)?.index ?? 50,
  );
  const ticketPriceIndex = $derived(eurosToIndex(ticketPriceEur));

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
        priceValues = [snapToStep(indexToEuros(persistedPriceIndex))];
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

  {@const fit = pt.snapshot?.state.team_fitness !== undefined ? formatFitness(pt.snapshot.state.team_fitness) : null}
  {@const fan = pt.snapshot?.state.fan_momentum !== undefined ? formatFanMomentum(pt.snapshot.state.fan_momentum) : null}
  {@const att = pt.snapshot?.state.fan_attendance !== undefined ? formatAttendance(pt.snapshot.state.fan_attendance, STADIUM_CAPACITY_DEFAULT) : null}

  <div class="metrics-grid">
    <div class="panel">
      <div class="metric-label">Semana</div>
      <div class="metric-value">{pt.playthrough.currentWeek}</div>
    </div>
    <div class="panel">
      <div class="metric-label">Estado físico</div>
      <div class="metric-value-text {fit ? severityClass(fit.severity) : 'dim'}">
        {fit?.text ?? "—"}
      </div>
    </div>
    <div class="panel">
      <div class="metric-label">Afición</div>
      <div class="metric-value-text {fan ? severityClass(fan.severity) : 'dim'}">
        {fan?.text ?? "—"}
      </div>
    </div>
    <div class="panel">
      <div class="metric-label">Asistencia (último)</div>
      {#if att}
        <div class="metric-value">{att.absolute.toLocaleString("es")}<span class="metric-unit"> personas</span></div>
        <div class="metric-sub {severityClass(att.qualitative.severity)}">
          {att.qualitative.text} · {att.percent}% del aforo
        </div>
      {:else}
        <div class="metric-value">—</div>
      {/if}
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

    <!-- Precio: library slider con color zones + pips en domain language -->
    <div class="decision-row">
      <div class="metric-label">Precio de la entrada</div>
      <div class="price-slider-wrap">
        <RangeSlider
          bind:values={priceValues}
          min={0}
          max={MAX_TICKET_EUR}
          step={TICKET_STEP_EUR}
          pips
          pipstep={1}
          all="label"
          float
          springValues={{ stiffness: 0.18, damping: 0.55 }}
          formatter={formatPip}
          handleFormatter={formatHandle}
          ariaLabels={["Precio de la entrada"]}
        />
      </div>
      <p class="hint dim">
        El mercado de Segunda humilde es <strong>{MARKET_TICKET_EUR}€</strong>.
        Cobrar caro da más por entrada vendida, pero la afición tiene memoria
        — no perdona enseguida cuando vienen tiempos malos.
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
  .metric-value-text {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .metric-unit { font-size: var(--text-sm); color: var(--fg-dim); font-weight: 400; }
  .metric-sub { font-size: var(--text-sm); margin-top: 2px; }
  .decisions { display: flex; flex-direction: column; gap: var(--space-5); }
  .decision-row { display: flex; flex-direction: column; gap: var(--space-1); }

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

  .hint { font-size: var(--text-sm); margin-top: var(--space-2); }

  /* ── svelte-range-slider-pips: dark theme + color zones ─────────────── */
  .price-slider-wrap {
    padding: var(--space-5) var(--space-3) var(--space-2);
    --range-slider: var(--bg-3);
    --range-handle-inactive: var(--fg-dim);
    --range-handle: var(--fg);
    --range-handle-focus: var(--accent);
    --range-handle-border: var(--border);
    --range-range-inactive: var(--border);
    --range-range: transparent;     /* we paint the bar via gradient below */
    --range-float-inactive: var(--bg-2);
    --range-float: var(--accent);
    --range-float-text: var(--bg);
    --range-pip: var(--fg-dim);
    --range-pip-text: var(--fg-dim);
    --range-pip-active: var(--fg);
    --range-pip-active-text: var(--fg);
    --range-pip-hover: var(--fg);
    --range-pip-hover-text: var(--fg);
    --range-pip-in-range: var(--accent);
    --range-pip-in-range-text: var(--fg);
  }
  /* Color zones on the bar: green at gratis-mercado, accent at promoción-mercado, warn at caro, bad at carísimo */
  .price-slider-wrap :global(.rangeSlider) {
    background: linear-gradient(
      to right,
      rgba(74, 222, 128, 0.55) 0%,        /* 0€ gratis  */
      rgba(74, 222, 128, 0.65) 20%,       /* 5€ barato  */
      rgba(74, 222, 128, 0.85) 40%,       /* 10€ mercado (peak green) */
      rgba(251, 191, 36, 0.55) 60%,       /* 15€ caro   */
      rgba(248, 113, 113, 0.6) 80%,       /* 20€ muy caro */
      rgba(248, 113, 113, 0.85) 100%      /* 25€ carísimo */
    );
    height: 10px;
    border-radius: 5px;
    overflow: visible;
  }
  .price-slider-wrap :global(.rangeFloat) {
    font-weight: 600;
    white-space: nowrap;
    transform: translateY(-2px);
  }
  .price-slider-wrap :global(.rangePips) {
    margin-top: 4px;
  }
  .price-slider-wrap :global(.pipVal) {
    font-size: 10px;
    white-space: pre-line;
    line-height: 1.1;
    text-align: center;
  }
  .price-slider-wrap :global(.rangeHandle) {
    transition: transform 0.15s ease;
  }
  .price-slider-wrap :global(.rangeHandle):focus-within,
  .price-slider-wrap :global(.rangeHandle):hover {
    transform: scale(1.15);
  }
</style>

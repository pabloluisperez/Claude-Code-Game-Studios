<!--
  AdvanceTransition — full-screen modal driving 7 full day/night cycles
  (one per in-game day). Interruptible: user can pause/cancel before the
  week actually commits to the server.

  Lifecycle (client-driven):
   - Parent calls `open = true` → modal mounts, internal 7-day animation begins.
   - At day 7, parent's `onComplete` callback fires → parent submits the form.
   - User can click "Pausar" anytime → animation freezes; "Reanudar" or
     "Cancelar y actuar" become available.
   - "Cancelar y actuar" calls parent's `onCancel` → modal closes, no submit.

  Visual layers:
   1. Sky gradient that shifts dawn → noon → dusk → night, repeating per day.
   2. Sun trajectory (day) → Moon trajectory (night) on a horizon SVG.
   3. Stars fade in at night.
   4. Date pill increments day-by-day.
   5. Headlines ticker fades through generated items.
   6. Worrying headline (medical/finance) pops a "Cancelar y actuar" CTA.

  Story: Alma Pass v2 — 7 day cycles + interruptible
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Headline } from '@smt/shared';
  import { weekToDate } from '@smt/shared';

  interface Props {
    open: boolean;
    fromWeek: number;
    headlines: readonly Headline[];
    /** Wall-clock duration of one in-game day (default 5s). */
    msPerDay?: number;
    /** True when the destination week has a user-club fixture. */
    matchPendingThisAdvance?: boolean;
    /**
     * Called when day 7 closes WITHOUT a match — auto-commit. Should
     * submit the form.
     */
    onComplete: () => void;
    /**
     * Called when day 7 closes WITH a match and the user picks how to
     * view it. The string identifies the chosen mode. The parent should
     * submit the form with the right redirect hint.
     */
    onMatchChoice?: (mode: 'autoplay' | 'skip' | 'dashboard') => void;
    onCancel?: () => void;
  }

  let {
    open,
    fromWeek,
    headlines,
    msPerDay = 5000,
    matchPendingThisAdvance = false,
    onComplete,
    onMatchChoice,
    onCancel,
  }: Props = $props();

  // ── Resume persistence ───────────────────────────────────────────────────
  // We persist (fromWeek, dayIndex) in localStorage. If the user cancels
  // mid-week and re-enters the modal at the same fromWeek, we resume from
  // the saved dayIndex. Once the advance commits, the entry is cleared.
  const RESUME_KEY = 'tsm-advance-resume';

  interface ResumeState {
    fromWeek: number;
    dayIndex: number;
  }

  function readResume(): ResumeState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as ResumeState;
      if (typeof v?.dayIndex === 'number' && typeof v?.fromWeek === 'number') return v;
      return null;
    } catch { return null; }
  }
  function writeResume(state: ResumeState): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(RESUME_KEY, JSON.stringify(state));
  }
  function clearResume(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(RESUME_KEY);
  }

  // ── Animation state ──────────────────────────────────────────────────────
  let dayIndex = $state(0);          // 0..6
  let hourPhase = $state(0);         // 0..1 within a single day
  let tickerIndex = $state(0);
  let paused = $state(false);
  let completed = $state(false);

  let lastTs = $state(0);
  let raf: number | null = null;

  // ── Headlines pacing ─────────────────────────────────────────────────────
  let headlineTimer: ReturnType<typeof setInterval> | null = null;

  // ── Derived visuals ──────────────────────────────────────────────────────
  // The day is split into 4 segments:
  //   0.00..0.45  → sun rises and traverses
  //   0.45..0.55  → twilight (no body visible)
  //   0.55..0.95  → moon rises and traverses
  //   0.95..1.00  → predawn (no body visible)
  // celestialOpacity hides the sun/moon during the transitions so we never
  // see both at once.
  // 24H digital clock — hourPhase 0..1 maps to 00:00..23:59.
  const clockTotalMinutes = $derived(Math.floor(hourPhase * 24 * 60));
  const clockHH = $derived(Math.floor(clockTotalMinutes / 60) % 24);
  const clockHHStr = $derived(String(clockHH).padStart(2, '0'));
  const clockMMStr = $derived(String(clockTotalMinutes % 60).padStart(2, '0'));

  // Real time-of-day mapping:
  //   hourPhase 0.00 = 00:00 (midnight, fully dark)
  //   hourPhase 0.25 = 06:00 (sunrise)
  //   hourPhase 0.50 = 12:00 (noon, fully light)
  //   hourPhase 0.75 = 18:00 (sunset)
  //   hourPhase 1.00 = 24:00 (midnight again)
  //
  // dayness = (1 − cos(2π × hourPhase)) / 2 ∈ [0, 1]
  //   peaks at hourPhase 0.5, troughs at 0 and 1.
  const dayness = $derived((1 - Math.cos(2 * Math.PI * hourPhase)) / 2);
  const isNight = $derived(dayness < 0.25);

  // Sun visible 06:00–18:00 (hourPhase 0.25..0.75)
  const sunVisible = $derived(hourPhase >= 0.25 && hourPhase <= 0.75);
  const sunProgress = $derived(sunVisible ? (hourPhase - 0.25) / 0.5 : 0);

  // Moon visible 20:00–04:00 (hourPhase ≥ 0.833 OR ≤ 0.167) — wraps midnight.
  const moonVisible = $derived(hourPhase >= 0.833 || hourPhase <= 0.167);
  const moonProgress = $derived(
    hourPhase >= 0.833
      ? (hourPhase - 0.833) / 0.333
      : (hourPhase + 0.167) / 0.333,
  );

  // Celestial body position (sun OR moon, never both)
  const celestialProgress = $derived(sunVisible ? sunProgress : moonProgress);
  const celestialX = $derived(celestialProgress * 100);
  const celestialY = $derived(50 - 35 * Math.sin(Math.PI * celestialProgress));

  // Sky: continuous HSL interpolation. Hue shifts (cool indigo at night →
  // light blue at noon → warm orange at dawn/dusk). Lightness driven by
  // `dayness`. Plus a warm tint when near sunrise/sunset.
  const twilight = $derived(
    Math.max(0, Math.min(1, 1 - Math.abs(dayness - 0.4) * 5)),
  );
  const skyTop = $derived.by(() => {
    // Night hue ~250 (indigo) → day hue ~210 (blue) → twilight ~25 (orange)
    const hue = 250 - dayness * 40 + twilight * (25 - 210);
    const sat = 60 + twilight * 10;
    const light = 8 + dayness * 55;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  });
  const skyBottom = $derived.by(() => {
    const hue = 240 - dayness * 50 + twilight * (20 - 200);
    const sat = 55 + twilight * 15;
    const light = 18 + dayness * 55;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  });

  const currentDate = $derived(weekToDate(fromWeek + dayIndex / 7));
  const targetDate = $derived(weekToDate(fromWeek + 1));

  const currentHeadline = $derived(
    headlines.length > 0 ? headlines[tickerIndex % headlines.length] ?? null : null,
  );
  /** Headlines that imply a manager intervention is worth doing. */
  const worryingHeadline = $derived(
    currentHeadline &&
      (currentHeadline.tag === 'medical' || currentHeadline.tag === 'finance'),
  );

  // Auto-pause once when the first critical headline surfaces so the user
  // can react. We only auto-pause once per cycle to avoid being annoying.
  let autoPausedOnce = $state(false);
  $effect(() => {
    if (open && !paused && !completed && worryingHeadline && !autoPausedOnce) {
      autoPausedOnce = true;
      paused = true;
    }
  });

  // ── Animation loop ───────────────────────────────────────────────────────
  function tick(ts: number) {
    if (!open || paused || completed) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (lastTs === 0) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    hourPhase += dt / msPerDay;
    if (hourPhase >= 1) {
      hourPhase = 0;
      dayIndex += 1;
      if (dayIndex >= 7) {
        // Always pause at day 7 — the user must explicitly confirm before
        // the week commits. If a match is pending they pick "Vivir/Saltar";
        // otherwise just "Volver al dashboard".
        completed = true;
        clearResume();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function startCycle(): void {
    // Resume from a saved day if the user previously cancelled mid-week.
    const resume = readResume();
    if (resume && resume.fromWeek === fromWeek && resume.dayIndex >= 0 && resume.dayIndex < 7) {
      dayIndex = resume.dayIndex;
    } else {
      dayIndex = 0;
    }
    hourPhase = 0;
    tickerIndex = 0;
    paused = false;
    completed = false;
    autoPausedOnce = false;
    lastTs = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);

    if (headlineTimer) clearInterval(headlineTimer);
    headlineTimer = setInterval(() => {
      if (!paused && headlines.length > 0) {
        tickerIndex = (tickerIndex + 1) % headlines.length;
      }
    }, 1800);
  }

  function stopCycle(): void {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (headlineTimer) {
      clearInterval(headlineTimer);
      headlineTimer = null;
    }
  }

  $effect(() => {
    if (open) {
      startCycle();
    } else {
      stopCycle();
    }
  });

  onDestroy(() => stopCycle());

  function handlePause() {
    paused = true;
  }
  function handleResume() {
    paused = false;
    lastTs = 0; // avoid huge delta on resume
  }
  function handleCancel() {
    paused = true;
    // Persist where we paused so the next "Avanzar semana" resumes here.
    writeResume({ fromWeek, dayIndex });
    onCancel?.();
  }

  /** Skip the remaining days and trigger the end-of-week panel. */
  function handleFastForward() {
    dayIndex = 6;
    hourPhase = 0.95; // almost at the close
    paused = false;
  }

  // Persist resume continuously as the cycle progresses — survives the
  // user clicking deep links in the action panel, which trigger navigation
  // before handleCancel can finish writing.
  $effect(() => {
    if (open && !completed && dayIndex > 0) {
      writeResume({ fromWeek, dayIndex });
    }
  });

  function headlineColor(tag: Headline['tag'] | undefined): string {
    if (tag === 'match') return 'border-l-primary';
    if (tag === 'finance') return 'border-l-warning';
    if (tag === 'sponsor') return 'border-l-info';
    if (tag === 'medical') return 'border-l-error';
    if (tag === 'mood') return 'border-l-secondary';
    if (tag === 'training') return 'border-l-accent';
    if (tag === 'board') return 'border-l-warning';
    if (tag === 'youth') return 'border-l-success';
    if (tag === 'fans') return 'border-l-info';
    return 'border-l-neutral';
  }

  function headlineTagLabel(tag: Headline['tag'] | undefined): string {
    switch (tag) {
      case 'match': return 'Partido';
      case 'finance': return 'Finanzas';
      case 'sponsor': return 'Patrocinador';
      case 'medical': return 'Médico';
      case 'mood': return 'Clasificación';
      case 'training': return 'Entrenamiento';
      case 'board': return 'Directiva';
      case 'youth': return 'Cantera';
      case 'fans': return 'Afición';
      case 'ambient': return 'Ambiente';
      default: return tag ?? '';
    }
  }
</script>

{#if open}
  <div class="advance-modal" role="dialog" aria-modal="true" aria-label="Avanzando una semana">
    <div
      class="advance-sky"
      style="background: linear-gradient(180deg, {skyTop} 0%, {skyBottom} 100%);"
    >
      {#if isNight}
        <div class="stars">
          {#each Array.from({ length: 40 }) as _, i}
            <span
              class="star"
              style="left: {(i * 37) % 100}%; top: {(i * 19) % 50}%; animation-delay: {i * 0.08}s"
            ></span>
          {/each}
        </div>
      {/if}

      <svg viewBox="0 0 100 60" preserveAspectRatio="none" class="celestial">
        {#if sunVisible}
          <circle cx={celestialX} cy={celestialY} r="5" fill="#fde047" />
          <circle cx={celestialX} cy={celestialY} r="6" fill="#fde047" opacity="0.25" />
        {:else if moonVisible}
          <circle cx={celestialX} cy={celestialY} r="5" fill="#f5f5dc" opacity="0.95" />
          <circle
            cx={celestialX + 1.6}
            cy={celestialY - 0.4}
            r="4.2"
            fill={skyTop}
            opacity="1"
          />
        {/if}
      </svg>

      <div class="horizon"></div>
    </div>

    <div class="advance-content">
      <div class="text-center mb-4">
        <div class="text-xs uppercase opacity-70 tracking-widest text-base-100">
          {#if completed}
            Final de la semana
          {:else if paused && autoPausedOnce && worryingHeadline}
            ⚠ Pausa automática — hay una noticia importante
          {:else if paused}
            ⏸ Pausado
          {:else}
            Avanzando una semana
          {/if}
        </div>
        <div class="text-2xl md:text-4xl font-bold text-base-100 drop-shadow-lg mt-1">
          {#if paused}📍 {/if}{currentDate.display}
        </div>
        <div class="font-mono text-3xl md:text-5xl font-bold text-base-100 drop-shadow-lg tabular-nums mt-1">
          {clockHHStr}:{clockMMStr}
        </div>
        <div class="text-base-100/70 text-sm mt-1">
          Día {dayIndex + 1} / 7 · destino {targetDate.display}
        </div>
      </div>

      <!-- Ticker -->
      <div class="ticker">
        {#if currentHeadline}
          {#key currentHeadline.text}
            <div class="ticker-card border-l-4 {headlineColor(currentHeadline.tag)}">
              <div class="text-xs uppercase opacity-50 tracking-wide">
                {headlineTagLabel(currentHeadline.tag)}
              </div>
              <div class="text-base md:text-lg font-semibold">
                {currentHeadline.text}
              </div>
            </div>
          {/key}
        {/if}
      </div>

      <!-- Controls -->
      <!-- Bug D fix (playtest 2026-05-21 Pablo): 'Saltar al fin de semana' e
           'Ir a partido' eran prácticamente lo mismo cuando había partido el
           finde. Consolidado en un único botón context-aware:
             matchPendingThisAdvance=true  → '⚽ Avanzar a día de partido'
             matchPendingThisAdvance=false → '⏩ Avanzar a fin de semana' -->
      <div class="flex flex-wrap justify-center gap-2 mt-6">
        {#if !completed}
          {#if !paused}
            <button class="btn btn-warning btn-sm" type="button" onclick={handlePause}>
              ⏸ Pausar
            </button>
            {#if matchPendingThisAdvance && onMatchChoice}
              <button
                class="btn btn-primary btn-sm"
                type="button"
                onclick={() => onMatchChoice('autoplay')}
              >
                ⚽ Avanzar a día de partido
              </button>
            {:else}
              <button class="btn btn-accent btn-sm" type="button" onclick={handleFastForward}>
                ⏩ Avanzar a fin de semana
              </button>
            {/if}
          {:else}
            <button class="btn btn-success btn-sm" type="button" onclick={handleResume}>
              ▶ Reanudar
            </button>
            {#if matchPendingThisAdvance && onMatchChoice}
              <button
                class="btn btn-primary btn-sm"
                type="button"
                onclick={() => onMatchChoice('autoplay')}
              >
                ⚽ Avanzar a día de partido
              </button>
            {:else}
              <button class="btn btn-accent btn-sm" type="button" onclick={handleFastForward}>
                ⏩ Avanzar a fin de semana
              </button>
            {/if}
            <button class="btn btn-error btn-sm" type="button" onclick={handleCancel}>
              🛑 Cancelar y actuar
            </button>
          {/if}
        {/if}
      </div>

      <!-- Actionable headline call-to-action -->
      {#if paused && worryingHeadline && onCancel}
        <div class="action-panel mt-6">
          <div class="text-xs uppercase opacity-70 mb-1">¿Te preocupa esta noticia?</div>
          <p class="text-sm mb-2">Cancela el avance y toma medidas antes de que la semana avance.</p>
          <div class="flex gap-2 flex-wrap">
            {#if currentHeadline?.tag === 'finance'}
              <a href="/finance" class="btn btn-sm btn-outline" onclick={handleCancel}>Ver finanzas</a>
              <a href="/staff" class="btn btn-sm btn-outline" onclick={handleCancel}>Revisar staff</a>
            {:else if currentHeadline?.tag === 'medical'}
              <a href="/squad" class="btn btn-sm btn-outline" onclick={handleCancel}>Ver plantilla</a>
              <a href="/staff" class="btn btn-sm btn-outline" onclick={handleCancel}>Contratar médico</a>
            {/if}
          </div>
        </div>
      {/if}

      <!-- End-of-week CTA: ALWAYS shown when day 7 closes. The buttons
           depend on whether there's a user match this week. -->
      {#if completed && onMatchChoice}
        <div class="action-panel mt-6 text-center">
          {#if matchPendingThisAdvance}
            <div class="text-3xl mb-2">⚽</div>
            <div class="text-lg font-bold">¡Llegó el día del partido!</div>
            <p class="text-sm opacity-80 mb-3">¿Cómo quieres vivirlo?</p>
            <div class="flex gap-2 justify-center flex-wrap">
              <button class="btn btn-primary" type="button" onclick={() => onMatchChoice('autoplay')}>
                ▶ Vivir el partido
              </button>
              <button class="btn btn-outline" type="button" onclick={() => onMatchChoice('skip')}>
                ⏭ Saltar al resultado
              </button>
              <button class="btn btn-ghost btn-sm" type="button" onclick={() => onMatchChoice('dashboard')}>
                Volver al dashboard
              </button>
            </div>
          {:else}
            <div class="text-3xl mb-2">📅</div>
            <div class="text-lg font-bold">Semana terminada</div>
            <p class="text-sm opacity-80 mb-3">
              No hay partido tuyo esta jornada. Vuelve al despacho cuando quieras.
            </p>
            <button class="btn btn-primary" type="button" onclick={() => onMatchChoice('dashboard')}>
              → Volver al dashboard
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .advance-modal {
    position: fixed; inset: 0; z-index: 100; overflow: hidden;
    animation: fade-in 0.25s ease-out;
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .advance-sky { position: absolute; inset: 0; transition: background 0.4s linear; }
  .celestial { position: absolute; inset: 0; width: 100%; height: 100%; }
  .horizon {
    position: absolute; bottom: 0; left: 0; right: 0; height: 35%;
    background: linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 100%);
  }
  .stars { position: absolute; inset: 0; pointer-events: none; }
  .star {
    position: absolute; width: 2px; height: 2px;
    background: #fff; border-radius: 50%; opacity: 0;
    animation: twinkle 1.6s ease-in-out infinite;
  }
  @keyframes twinkle { 0%, 100% { opacity: 0; } 50% { opacity: 0.9; } }
  .advance-content {
    position: relative; z-index: 2; height: 100%;
    display: flex; flex-direction: column; justify-content: center;
    padding: 1rem 2rem; max-width: 60rem; margin: 0 auto;
  }
  .ticker { min-height: 4.5rem; }
  .ticker-card {
    background: rgba(255, 255, 255, 0.92); color: rgb(20 20 30);
    padding: 0.75rem 1rem; border-radius: 0.5rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: ticker-in 0.4s ease-out;
  }
  @keyframes ticker-in {
    from { transform: translateY(8px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .action-panel {
    background: rgba(255, 255, 255, 0.95); color: rgb(20 20 30);
    border-radius: 0.5rem; padding: 1rem;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35);
  }
</style>

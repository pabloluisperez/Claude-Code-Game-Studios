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
    /** Wall-clock duration of one in-game day (default 1.5s). */
    msPerDay?: number;
    onComplete: () => void;
    onCancel?: () => void;
  }

  let {
    open,
    fromWeek,
    headlines,
    msPerDay = 3000,
    onComplete,
    onCancel,
  }: Props = $props();

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
  const isNight = $derived(hourPhase >= 0.5);
  const sunVisible = $derived(hourPhase >= 0 && hourPhase < 0.45);
  const moonVisible = $derived(hourPhase >= 0.55 && hourPhase < 0.95);
  const sunProgress = $derived(sunVisible ? hourPhase / 0.45 : 0);
  const moonProgress = $derived(moonVisible ? (hourPhase - 0.55) / 0.4 : 0);
  const celestialProgress = $derived(sunVisible ? sunProgress : moonProgress);
  const celestialX = $derived(celestialProgress * 100);
  const celestialY = $derived(50 - 35 * Math.sin(Math.PI * celestialProgress));

  // Sky: dawn (warm) → noon (clear blue) → dusk (orange) → night (indigo).
  const skyTop = $derived.by(() => {
    const p = hourPhase;
    if (p < 0.15) return `hsl(${20 + p * 200}, 70%, ${40 + p * 100}%)`;          // dawn
    if (p < 0.5)  return `hsl(${200 - (p - 0.15) * 50}, 70%, 60%)`;             // day
    if (p < 0.65) return `hsl(${30 + (p - 0.5) * 100}, 70%, ${50 - p * 30}%)`;  // dusk
    return `hsl(${260 + (p - 0.65) * 30}, 60%, ${15 + (1 - p) * 15}%)`;         // night
  });
  const skyBottom = $derived.by(() => {
    const p = hourPhase;
    if (p < 0.15) return `hsl(${30 + p * 100}, 60%, 70%)`;
    if (p < 0.5)  return `hsl(${180 + (p - 0.15) * 30}, 60%, 75%)`;
    if (p < 0.65) return `hsl(${20 + (p - 0.5) * 80}, 70%, 60%)`;
    return `hsl(${260 + (p - 0.65) * 20}, 50%, 25%)`;
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
        completed = true;
        // Schedule the server submit on the next tick so the final frame
        // (day 7 at dawn) is visible to the user briefly before navigation.
        setTimeout(() => onComplete(), 300);
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function startCycle(): void {
    dayIndex = 0;
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
    onCancel?.();
  }

  function headlineColor(tag: Headline['tag'] | undefined): string {
    if (tag === 'match') return 'border-l-primary';
    if (tag === 'finance') return 'border-l-warning';
    if (tag === 'sponsor') return 'border-l-info';
    if (tag === 'medical') return 'border-l-error';
    if (tag === 'mood') return 'border-l-secondary';
    return 'border-l-neutral';
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
          <circle cx={celestialX} cy={celestialY} r="5" fill="#fde047">
            <animate attributeName="r" values="5;5.5;5" dur="2s" repeatCount="indefinite" />
          </circle>
        {/if}
        {#if moonVisible}
          <circle cx={celestialX} cy={celestialY} r="5" fill="#f5f5dc" opacity="0.95" />
          <circle cx={celestialX + 1.5} cy={celestialY - 0.5} r="4" fill={skyTop} opacity="0.9" />
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
            En pausa — el tiempo se detiene
          {:else}
            Avanzando una semana
          {/if}
        </div>
        <div class="text-2xl md:text-4xl font-bold text-base-100 drop-shadow-lg mt-1">
          {currentDate.display}
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
                {currentHeadline.tag}
              </div>
              <div class="text-base md:text-lg font-semibold">
                {currentHeadline.text}
              </div>
            </div>
          {/key}
        {/if}
      </div>

      <!-- Controls -->
      <div class="flex flex-wrap justify-center gap-2 mt-6">
        {#if !completed}
          {#if !paused}
            <button class="btn btn-warning btn-sm" type="button" onclick={handlePause}>
              ⏸ Pausar
            </button>
          {:else}
            <button class="btn btn-success btn-sm" type="button" onclick={handleResume}>
              ▶ Reanudar
            </button>
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

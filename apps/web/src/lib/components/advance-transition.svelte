<!--
  AdvanceTransition — full-screen modal shown while /dashboard ?/advance runs.

  Visual layers (bottom to top):
   1. Sky gradient that shifts from dawn → noon → dusk → night → dawn as the
      day counter cycles.
   2. SVG horizon with a sun and a moon that traverse left → right in sync
      with the day counter (sun in the upper half day-time, moon at night).
   3. A large date display that updates day-by-day for 7 in-game days.
   4. A bottom ticker of newspaper-style headlines that fade in/out.
   5. A small "avanzando..." caption.

  Lifecycle:
   - Parent mounts the component with `open=true` when the form submits.
   - Internal timer drives the animation for `minDurationMs` (default 2500ms).
   - When the SvelteKit redirect completes the page changes; parent simply
     unmounts the component on the new route.

  Pure presentation — no network calls.

  Story: Alma Pass — advance transition
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Headline } from '@smt/shared';

  interface Props {
    /** Visible-only when true. */
    open: boolean;
    /** ISO start date label, e.g. "Sáb 22 ago 2026". */
    fromDateDisplay: string;
    /** ISO target date label (7 days later). */
    toDateDisplay: string;
    /** Pre-generated headlines that will scroll in the ticker. */
    headlines: readonly Headline[];
    /** Min wall-clock duration in ms. */
    minDurationMs?: number;
  }

  let { open, fromDateDisplay, toDateDisplay, headlines, minDurationMs = 2500 }: Props = $props();

  // ── Day counter (0..7) ────────────────────────────────────────────────────
  let dayIndex = $state(0);
  let tickerIndex = $state(0);

  const ticks = 7;
  const tickIntervalMs = $derived(Math.floor(minDurationMs / ticks));
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let headlineTimer: ReturnType<typeof setInterval> | null = null;

  // Sun/moon X position progresses with dayIndex.
  const celestialX = $derived(((dayIndex + 0.5) / ticks) * 100);
  // Y arc: sun rises and sets, moon mirrors. Use sine.
  const celestialY = $derived(50 - 35 * Math.sin(Math.PI * ((dayIndex + 0.5) / ticks)));
  // Sky hue: day=blue → dusk=orange → night=indigo
  const phase = $derived((dayIndex % ticks) / ticks);
  const skyTop = $derived(
    phase < 0.5
      ? `hsl(${200 - phase * 120}, 70%, ${60 - phase * 20}%)` // day
      : `hsl(${260 + (phase - 0.5) * 40}, 60%, ${20 + (1 - phase) * 25}%)`, // night
  );
  const skyBottom = $derived(
    phase < 0.5
      ? `hsl(${180 + phase * 40}, 60%, 70%)`
      : `hsl(${20 + (phase - 0.5) * 60}, 70%, 50%)`,
  );

  const isNight = $derived(phase >= 0.5);

  $effect(() => {
    if (!open) {
      if (tickTimer) clearInterval(tickTimer);
      if (headlineTimer) clearInterval(headlineTimer);
      dayIndex = 0;
      tickerIndex = 0;
      return;
    }
    dayIndex = 0;
    tickerIndex = 0;
    tickTimer = setInterval(() => {
      dayIndex = Math.min(ticks - 1, dayIndex + 1);
    }, tickIntervalMs);
    // Headlines cycle faster than days so user sees ~3-4 of them.
    const headlineMs = Math.max(800, Math.floor(minDurationMs / Math.max(headlines.length, 1)));
    headlineTimer = setInterval(() => {
      tickerIndex = (tickerIndex + 1) % Math.max(headlines.length, 1);
    }, headlineMs);
  });

  onDestroy(() => {
    if (tickTimer) clearInterval(tickTimer);
    if (headlineTimer) clearInterval(headlineTimer);
  });

  // ── Current display values ────────────────────────────────────────────────
  const dayCounter = $derived(`Día ${dayIndex + 1} / 7`);
  const currentHeadline = $derived(
    headlines.length > 0 ? headlines[tickerIndex % headlines.length] : null,
  );

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
      <!-- Stars on night -->
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

      <!-- Celestial body (sun or moon) -->
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" class="celestial">
        <circle
          cx={celestialX}
          cy={celestialY}
          r="5"
          fill={isNight ? '#f5f5dc' : '#fde047'}
          opacity={isNight ? 0.95 : 1}
        >
          {#if !isNight}
            <animate attributeName="r" values="5;5.5;5" dur="2s" repeatCount="indefinite" />
          {/if}
        </circle>
        {#if isNight}
          <!-- Crescent shadow -->
          <circle cx={celestialX + 1.5} cy={celestialY - 0.5} r="4" fill={skyTop} opacity="0.85" />
        {/if}
      </svg>

      <!-- Horizon -->
      <div class="horizon"></div>
    </div>

    <!-- Center: date counter -->
    <div class="advance-content">
      <div class="text-xs uppercase opacity-70 tracking-widest text-center">Avanzando</div>
      <div class="text-3xl md:text-5xl font-bold text-center mt-1 text-base-100 drop-shadow-lg">
        {fromDateDisplay}
        <span class="opacity-60 mx-2">→</span>
        {toDateDisplay}
      </div>
      <div class="text-base-100/80 font-mono text-center mt-2">{dayCounter}</div>

      <!-- Ticker -->
      <div class="ticker mt-8">
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
    </div>
  </div>
{/if}

<style>
  .advance-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow: hidden;
    animation: fade-in 0.25s ease-out;
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .advance-sky {
    position: absolute;
    inset: 0;
    transition: background 1.2s linear;
  }
  .celestial {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .celestial circle {
    transition: cx 1.2s linear, cy 1.2s linear, fill 1.2s linear;
  }
  .horizon {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 35%;
    background: linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 100%);
  }
  .stars { position: absolute; inset: 0; pointer-events: none; }
  .star {
    position: absolute;
    width: 2px; height: 2px;
    background: #fff;
    border-radius: 50%;
    opacity: 0;
    animation: twinkle 1.6s ease-in-out infinite;
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0; }
    50% { opacity: 0.9; }
  }
  .advance-content {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 1rem 2rem;
    max-width: 60rem;
    margin: 0 auto;
  }
  .ticker {
    min-height: 4.5rem;
  }
  .ticker-card {
    background: rgba(255, 255, 255, 0.92);
    color: rgb(20 20 30);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: ticker-in 0.4s ease-out;
  }
  @keyframes ticker-in {
    from { transform: translateY(8px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
</style>

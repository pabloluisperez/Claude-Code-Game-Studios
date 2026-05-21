<!--
  Dashboard — hero + week summary + cascade nodes + upcoming events + staff
  messages. Anchored on the current in-game date (weekDate).

  Story: MVP UX fixes — dashboard refresh
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { generateHeadlines, weekToDate } from '@smt/shared';
  import AdvanceTransition from '$lib/components/advance-transition.svelte';
  import { formatEurK } from '$lib/format';

  let { data }: { data: PageData } = $props();

  // Bug M2 fix: track whether the user has already watched today's match
  // result (sessionStorage flag written by /match/[id] on final whistle).
  // Drives the dashboard card's two states: 'Ir a partido' vs 'Resultado'.
  let matchSeen = $state(false);
  $effect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (data.lastResult && data.lastResult.week === data.week) {
      matchSeen = sessionStorage.getItem(`tsm-seen-fixture:${data.lastResult.id}`) === '1';
    } else {
      matchSeen = false;
    }
  });

  let showTransition = $state(false);
  let advanceFormEl: HTMLFormElement | undefined = $state();
  let redirectModeInput: HTMLInputElement | undefined = $state();
  let advanceSubmitting = $state(false);

  // The next user fixture (if it's this advance) — drives the match-arrival CTA.
  const userMatchNextAdvance = $derived.by(() => {
    if (!data.hasPlaythrough) return null;
    const f = data.nextFixtures.find((nf) => nf.week === data.week + 1);
    return f ?? null;
  });

  function handleAdvanceClick(e: Event) {
    e.preventDefault();
    if (advanceSubmitting) return;
    showTransition = true;
  }
  function onTransitionComplete() {
    if (advanceSubmitting) return;
    advanceSubmitting = true;
    advanceFormEl?.requestSubmit();
    showTransition = false;
  }
  function onTransitionMatchChoice(mode: 'autoplay' | 'skip' | 'dashboard') {
    if (advanceSubmitting) return;
    advanceSubmitting = true;
    if (redirectModeInput) redirectModeInput.value = mode;
    advanceFormEl?.requestSubmit();
    showTransition = false;
  }
  function onTransitionCancel() {
    showTransition = false;
  }

  // Reset submitting flag once new data lands (post-advance refresh).
  $effect(() => {
    if (data.justAdvanced) {
      advanceSubmitting = false;
      showTransition = false;
    }
  });

  // Headlines for the transition modal — generated from the current week's
  // data so the user sees a recap of what just happened.
  const transitionHeadlines = $derived.by(() => {
    if (!data.hasPlaythrough) return [];
    return generateHeadlines({
      clubName: data.activePlaythrough?.clubName ?? 'el club',
      week: data.week,
      weekDateDisplay: data.weekDate.display,
      lastResult: data.lastResult && data.lastResult.outcome
        ? {
            opponentName: data.lastResult.opponentName ?? 'rival',
            isHome: data.lastResult.isHome,
            myScore: data.lastResult.myScore ?? 0,
            oppScore: data.lastResult.oppScore ?? 0,
            outcome: data.lastResult.outcome,
          }
        : undefined,
      // Bug B4 fix (playtest 2026-05-21 Pablo): suppress position headlines
      // until at least one league fixture has been played. Before kick-off
      // the standings sort alphabetically/seed-order, so 'Real Madrid CF (1º)'
      // could fire pre-season and break immersion.
      position: data.hasPlayedFixture ? (data.position ?? undefined) : undefined,
      totalClubs: data.hasPlayedFixture && data.standingsCount > 0 ? data.standingsCount : undefined,
      weeklyCashflow: data.worldState?.weekly_cashflow,
      financialBalance: data.worldState?.financial_balance,
      trainingIntensity: data.worldState?.training_intensity,
      fanMomentum: data.worldState?.fan_momentum,
    });
  });

  const nextWeekDateDisplay = $derived.by(() => {
    if (!data.hasPlaythrough) return '';
    return weekToDate(data.week + 1).display;
  });

  interface NodeReading {
    nodeId: string;
    label: string;
    /** Big formatted text shown as the headline value. */
    display: string;
    /** Optional secondary line (e.g. mood label for fan momentum). */
    subtitle?: string;
    /** 0..100 for the progress bar. */
    progressValue: number;
    /** Whether the value is "negative" for accent colour. */
    isNegative?: boolean;
  }

  const ROSTER_SIZE = 25;

  function fanMomentumLabel(v: number): string {
    if (v < 20) return 'Decepcionada';
    if (v < 40) return 'Tibia';
    if (v < 60) return 'Neutral';
    if (v < 80) return 'Buena ola';
    return 'Eufórica';
  }

  const nodes = $derived.by<NodeReading[]>(() => {
    if (!data.hasPlaythrough || !data.worldState) return [];
    const state = data.worldState;

    const balance = Math.round(state['financial_balance'] ?? 0);
    const momentum = Math.round(state['fan_momentum'] ?? 0);
    const fitness = Math.round(state['team_fitness'] ?? 0);
    const availPct = Math.round(state['squad_available_pct'] ?? 0);
    const availPlayers = Math.round((availPct / 100) * ROSTER_SIZE);

    return [
      {
        nodeId: 'financial_balance',
        label: 'Balance',
        display: formatEurK(balance),
        progressValue: Math.max(0, Math.min(100, balance / 10)),
        isNegative: balance < 0,
      },
      {
        nodeId: 'fan_momentum',
        label: 'Afición',
        display: `${momentum}`,
        subtitle: fanMomentumLabel(momentum),
        progressValue: momentum,
      },
      {
        nodeId: 'team_fitness',
        label: 'Estado físico del equipo',
        display: `${fitness}%`,
        progressValue: fitness,
      },
      {
        nodeId: 'squad_available_pct',
        label: 'Plantilla disp.',
        display: `${availPlayers} / ${ROSTER_SIZE}`,
        subtitle: `${availPct}% disponibles`,
        progressValue: availPct,
      },
    ];
  });

  const messages = $derived(data.hasPlaythrough ? data.messages : []);
  const nextFixtures = $derived(data.hasPlaythrough ? data.nextFixtures : []);
  const pendingEvents = $derived(data.hasPlaythrough ? data.pendingEvents : []);

  function colorFor(value: number): string {
    if (value < 30) return 'progress-error';
    if (value < 70) return 'progress-warning';
    return 'progress-success';
  }

  /**
   * Per-node tooltip: what does this indicator measure + what moves it.
   * Surfaced on hover via DaisyUI's `tooltip` class on the card.
   */
  function nodeTooltip(nodeId: string): string {
    switch (nodeId) {
      case 'financial_balance':
        return 'La caja del club. Sube con taquilla, patrocinadores y derechos de TV. Baja con salarios, scouting y multas. En negativo significa deuda.';
      case 'fan_momentum':
        return 'El ánimo de la afición. Las victorias lo levantan poco a poco; las derrotas lo hunden rápido. Recuperarlo cuesta más que perderlo.';
      case 'team_fitness':
        return 'La forma física del equipo. Una mala alimentación, entrenamientos extremos o jornadas sin descanso lo machacan. La plantilla sana y el descanso lo recuperan.';
      case 'squad_available_pct':
        return 'Porcentaje de jugadores disponibles para jugar (sin lesiones ni sanciones). Un campo en mal estado o tarjetas de más lo bajan; ojeadores y descanso lo recuperan.';
      default:
        return '';
    }
  }

  // Headline tag → Spanish display label (mirrors advance-transition.svelte).
  function tagLabel(tag: string): string {
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
      default: return tag;
    }
  }

  function outcomeBadge(outcome: 'win' | 'draw' | 'loss' | null): string {
    if (outcome === 'win') return 'badge-success';
    if (outcome === 'loss') return 'badge-error';
    if (outcome === 'draw') return 'badge-warning';
    return 'badge-ghost';
  }
  function outcomeLabel(outcome: 'win' | 'draw' | 'loss' | null): string {
    if (outcome === 'win') return 'Victoria';
    if (outcome === 'loss') return 'Derrota';
    if (outcome === 'draw') return 'Empate';
    return '—';
  }

  function eventIcon(type: string): string {
    if (type.startsWith('season_'))    return '🗓';
    if (type.startsWith('transfer_'))  return '💼';
    if (type.startsWith('sponsor_'))   return '🤝';
    if (type.startsWith('board_'))     return '🏛';
    if (type.startsWith('tv_'))        return '📺';
    return '•';
  }

  /**
   * Route an event card to its decision-making destination.
   * Bug P1 fix (playtest 2026-05-21 Pablo): the dashboard's upcoming-events
   * cards used to all link to /calendar regardless of type. Now sponsor
   * offers go to /finance#patrocinadores and TV-related events to
   * /finance/tv-rights.
   */
  function eventDestination(type: string): string {
    if (type === 'sponsor_offer') return '/finance?tab=patrocinadores';
    if (type === 'tv_auction' || type === 'tv_midseason_offer') return '/finance/tv-rights';
    return '/calendar';
  }
</script>

<AdvanceTransition
  open={showTransition}
  fromWeek={data.hasPlaythrough ? data.week : 0}
  startDayOfWeek={data.hasPlaythrough ? data.dayInWeek : 0}
  haltAtDayOfWeek={data.hasPlaythrough ? data.haltAtDayOfWeek : null}
  headlines={transitionHeadlines}
  msPerDay={5000}
  matchPendingThisAdvance={userMatchNextAdvance !== null}
  onComplete={onTransitionComplete}
  onMatchChoice={onTransitionMatchChoice}
  onCancel={onTransitionCancel}
/>

<div class="space-y-6">
  {#if !data.hasPlaythrough}
    <div class="hero bg-base-200 rounded-lg">
      <div class="hero-content text-center">
        <div class="max-w-md">
          <h1 class="text-3xl font-bold">¡Bienvenido a Total Soccer Manager!</h1>
          <p class="py-4 opacity-70">
            Todavía no has comenzado una partida. Crea tu primera carrera para
            tomar las riendas de un club modesto y construir tu legado.
          </p>
          <a href="/game" class="btn btn-primary">Crear mi primera carrera</a>
        </div>
      </div>
    </div>
  {:else}
    <!-- Hero -->
    <section class="card bg-base-200 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 class="card-title text-2xl">{data.activePlaythrough?.clubName ?? 'Mi club'}</h1>
            <p class="opacity-70 text-sm">
              <span>{data.todayPrecise.displayLong}</span>
              · semana <span class="font-mono">{data.week}</span>
              {#if data.dayInWeek > 0}
                · <span class="badge badge-warning badge-sm">Mid-week (día {data.dayInWeek + 1} / 7)</span>
              {/if}
              {#if data.position !== null && data.standingsCount > 0}
                · <span class="badge badge-info">Pos {data.position}º / {data.standingsCount}</span>
              {/if}
            </p>
          </div>
          <!--
            The visible button doesn't submit directly — it shows the
            7-day transition modal. The modal calls `onComplete` at day 7,
            which programmatically submits this real form. This lets the
            user pause / cancel mid-transition before the server commits.
          -->
          <form
            bind:this={advanceFormEl}
            method="POST"
            action="/dashboard?/advance"
            class="contents"
            use:enhance
          >
            <input
              type="hidden"
              name="redirectMode"
              value="dashboard"
              bind:this={redirectModeInput}
            />
          </form>
          <button
            type="button"
            class="btn btn-primary btn-lg"
            onclick={handleAdvanceClick}
          >
            ▶ Avanzar semana
          </button>
        </div>
      </div>
    </section>

    <!-- Sprint 12 walkthrough fix (Pablo Part B): STOP-event halt banner.
         When the orchestrator halts mid-week, the form action redirects to
         /dashboard?stop_event=<id>&day=<n>. This alert surfaces the reason
         the halt happened so the player can act. -->
    {#if $page.url.searchParams.get('stop_event')}
      {@const stopId = $page.url.searchParams.get('stop_event')}
      {@const stopEvent = pendingEvents.find((e) => e.id === stopId)}
      <section class="alert alert-warning shadow">
        <div class="flex flex-col gap-1 flex-1">
          <span class="font-semibold">⚠ Evento detectado · {data.todayPrecise.displayLong}</span>
          {#if stopEvent}
            {@const meta = stopEvent.metadata as { label?: string } | null}
            <span class="text-sm opacity-90">
              {meta?.label ?? stopEvent.type} — Resuélvelo antes de seguir avanzando.
            </span>
            <div class="mt-1 flex gap-2">
              <a href={eventDestination(stopEvent.type)} class="btn btn-sm btn-primary">
                Resolver ahora
              </a>
              <a href="/calendar" class="btn btn-sm btn-ghost">Ver en calendario</a>
            </div>
          {:else}
            <span class="text-sm opacity-90">
              El evento ya no está pendiente (puede que se resolviera). Vuelve a avanzar.
            </span>
          {/if}
        </div>
      </section>
    {/if}

    <!-- First-advance onboarding callout — first real week of management. -->
    {#if data.justAdvanced && data.week === 1}
      <div class="alert alert-success">
        <div class="flex flex-col gap-1">
          <span class="font-semibold">¡Acaba tu primera semana al frente del club!</span>
          <span class="text-sm opacity-90">
            Echa un vistazo a los indicadores de arriba — el ánimo de la afición, la forma
            física, la disponibilidad de plantilla — porque ahora ya tienen historia. Pasa el
            ratón sobre cada uno para entender qué los mueve. Antes de avanzar otra semana,
            asómate a <a href="/squad" class="link">tu plantilla</a>,
            <a href="/finance" class="link">la caja del club</a> o
            <a href="/manager" class="link">tu despacho</a>.
          </span>
        </div>
      </div>
    {/if}

    <!-- Week summary (post-advance) -->
    {#if data.justAdvanced}
      {#if data.lastResult && data.lastResult.week === data.week}
        <!-- Match-day card: shows two states based on whether the user has
             seen the result yet (tracked via sessionStorage match:seen flag
             written by /match/[id] page on final whistle).
             Bug M2 fix (playtest 2026-05-21 Pablo): previously this card
             stayed in 'pending' state forever, even after watching. -->
        <section class="card bg-base-200 shadow-lg border-2 border-primary/40">
          <div class="card-body">
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div class="text-xs uppercase opacity-70 tracking-wider">
                  {matchSeen ? 'Resultado del partido' : 'Partido jugado hoy'}
                </div>
                <h3 class="font-bold text-xl mt-1">
                  vs {data.lastResult.opponentName}
                  <span class="opacity-50 text-sm font-normal ml-2">
                    ({data.lastResult.isHome ? 'casa' : 'fuera'})
                  </span>
                  {#if matchSeen}
                    <!-- Playtest PT-3 fix (Pablo Sprint 12): siempre
                         "homeScore - awayScore" en ese orden, sin
                         intercambio según el club del usuario. -->
                    <span class="font-mono ml-3 text-2xl">
                      {data.lastResult.homeScore}–{data.lastResult.awayScore}
                    </span>
                  {/if}
                </h3>
                {#if !matchSeen}
                  <div class="text-sm opacity-80 mt-1">
                    Tu equipo acaba de salir del vestuario. ¿Cómo quieres verlo?
                  </div>
                {/if}
              </div>
              <div class="flex gap-2 flex-wrap">
                {#if matchSeen}
                  <a
                    href="/match/{data.lastResult.id}?return=dashboard"
                    class="btn btn-ghost btn-sm"
                  >
                    Ver detalles
                  </a>
                {:else}
                  <a
                    href="/match/{data.lastResult.id}?autoplay=1&return=dashboard"
                    class="btn btn-primary"
                  >
                    ▶ Ir a partido
                  </a>
                  <a
                    href="/match/{data.lastResult.id}?skipToEnd=1&return=dashboard"
                    class="btn btn-outline"
                  >
                    ⏭ Solo resultado
                  </a>
                {/if}
              </div>
            </div>
          </div>
        </section>
      {:else}
        <section class="alert alert-success shadow-lg">
          <div class="flex-1">
            <h3 class="font-bold">Semana avanzada al {data.weekDate.display}</h3>
            <p class="text-sm opacity-80">
              Sin partido esta semana — entrenamientos y operaciones de oficina.
            </p>
          </div>
        </section>
      {/if}
    {/if}

    <!-- Newspaper card — auto-generated headlines from this week's state -->
    <section class="card bg-base-100 shadow border-2 border-base-300">
      <div class="card-body py-4">
        <div class="flex items-baseline justify-between border-b border-base-300 pb-2 mb-3">
          <h2 class="font-serif text-2xl font-bold tracking-tight">El Diario TSM</h2>
          <span class="text-xs opacity-50 font-mono">{data.weekDate.display}</span>
        </div>
        <div class="space-y-2">
          {#each transitionHeadlines.slice(0, 4) as h, i}
            <div class="flex gap-3 items-start py-1
                        {i === 0 ? 'font-serif text-lg font-bold leading-tight' : 'text-sm'}">
              <span class="opacity-50 text-xs uppercase tracking-wider mt-1 w-24 flex-shrink-0">
                {tagLabel(h.tag)}
              </span>
              <p class="flex-1">{h.text}</p>
            </div>
            {#if i < 3 && i < transitionHeadlines.length - 1}
              <div class="border-t border-dashed border-base-300"></div>
            {/if}
          {/each}
        </div>
      </div>
    </section>

    <!-- Nodes -->
    {#if nodes.length > 0}
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each nodes as n}
          <div
            class="card bg-base-100 shadow tooltip tooltip-bottom"
            data-tip={nodeTooltip(n.nodeId)}
          >
            <div class="card-body">
              <div class="text-xs uppercase opacity-50 tracking-wide">{n.label}</div>
              <div
                class="text-2xl md:text-3xl font-mono font-semibold {n.isNegative ? 'text-error' : ''}"
              >
                {n.display}
              </div>
              {#if n.subtitle}
                <div class="text-xs opacity-70">{n.subtitle}</div>
              {/if}
              <progress
                class="progress {colorFor(n.progressValue)}"
                value={n.progressValue}
                max="100"
              ></progress>
            </div>
          </div>
        {/each}
      </section>
    {:else}
      <div class="alert alert-info">
        <div class="flex flex-col gap-1">
          <span class="font-semibold">¡Bienvenido, mánager!</span>
          <span class="text-sm opacity-80">
            Aún no has jugado tu primera semana. Pulsa <strong>Avanzar semana</strong> arriba
            para ver tu primer informe — descubrirás qué nodos del juego (forma del equipo,
            ánimo de la afición, etc.) cambian con tus decisiones.
          </span>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Upcoming -->
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Próximos eventos</h2>

          {#if nextFixtures.length === 0 && pendingEvents.length === 0}
            <p class="opacity-60 text-sm">No hay nada agendado. Pretemporada en marcha.</p>
          {/if}

          {#each nextFixtures as f}
            {@const isToday = f.week === data.week}
            <a
              href="/match/{f.id}{isToday ? '?autoplay=1&return=dashboard' : ''}"
              class="flex items-center justify-between p-3 rounded
                     {isToday ? 'bg-primary/20 border-2 border-primary' : 'bg-base-200 hover:bg-base-300'}"
            >
              <div class="flex-1">
                <div class="text-xs opacity-70">
                  {#if isToday}
                    <span class="badge badge-primary badge-sm mr-1">¡HOY!</span>
                  {/if}
                  ⚽ Partido · {f.date.display}
                </div>
                <div class="font-semibold {isToday ? 'text-lg' : ''}">
                  {f.isHome ? '🏠' : '✈️'} vs {f.opponentName}
                  {#if f.opponentPosition !== null}
                    <span class="opacity-60 text-sm font-normal">({f.opponentPosition}º)</span>
                  {/if}
                </div>
              </div>
              <span class="badge badge-primary">Jor {f.matchday}</span>
            </a>
          {/each}

          <!-- Bug P1 fix (playtest 2026-05-21 Pablo): events now route to the
               decision destination, not just /calendar. sponsor_offer →
               /finance#patrocinadores; tv_auction / tv_midseason_offer →
               /finance/tv-rights; default → /calendar. -->
          {#each pendingEvents as e}
            <a
              href={eventDestination(e.type)}
              class="flex items-center justify-between p-3 rounded
                     {e.priority === 'STOP' ? 'bg-error/10 border border-error/30' : 'bg-base-200'}"
            >
              <div>
                <div class="text-xs opacity-60">{eventIcon(e.type)} {e.type} · {e.date.display}</div>
                <div class="font-semibold text-sm">
                  {e.priority === 'STOP' ? 'Decisión pendiente' : 'Aviso'}
                </div>
              </div>
              <span class="badge {e.priority === 'STOP' ? 'badge-error' : 'badge-ghost'}">{e.priority}</span>
            </a>
          {/each}
        </div>
      </section>

      <!-- Staff messages -->
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Mensajes del staff</h2>
          {#if messages.length === 0}
            <p class="opacity-60 text-sm">
              Tu staff aún no ha enviado mensajes. Pasa una semana o contrata más
              especialistas en <a href="/staff" class="link">Staff</a>.
            </p>
          {:else}
            <div class="space-y-3 max-h-96 overflow-y-auto">
              {#each messages as m}
                <div
                  class="alert {m.priority === 'URGENT' ? 'alert-error' : 'alert-info'}
                         {m.tier === 3 ? 'border-l-4 border-l-warning' : ''}"
                >
                  <div>
                    <div class="text-xs uppercase opacity-60">
                      {m.role.replace('_', ' ')} · {m.tier === 1 ? 'Novato' : m.tier === 2 ? 'Experimentado' : 'Élite'} · {m.priority} · sem {m.week}
                    </div>
                    <div class="text-sm">{m.content}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

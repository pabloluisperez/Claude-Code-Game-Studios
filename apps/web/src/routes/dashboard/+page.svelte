<!--
  Dashboard — hero + week summary + cascade nodes + upcoming events + staff
  messages. Anchored on the current in-game date (weekDate).

  Story: MVP UX fixes — dashboard refresh
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { generateHeadlines, weekToDate } from '@smt/shared';
  import AdvanceTransition from '$lib/components/advance-transition.svelte';

  let { data }: { data: PageData } = $props();

  let showTransition = $state(false);
  let advanceFormEl: HTMLFormElement | undefined = $state();

  function handleAdvanceClick(e: Event) {
    e.preventDefault();
    showTransition = true;
  }
  function onTransitionComplete() {
    // Submit the actual form once the 7-day animation finishes.
    advanceFormEl?.requestSubmit();
  }
  function onTransitionCancel() {
    showTransition = false;
  }

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
      position: data.position ?? undefined,
      totalClubs: data.standingsCount > 0 ? data.standingsCount : undefined,
      weeklyCashflow: data.worldState?.weekly_cashflow,
      financialBalance: data.worldState?.financial_balance,
    });
  });

  const nextWeekDateDisplay = $derived.by(() => {
    if (!data.hasPlaythrough) return '';
    return weekToDate(data.week + 1).display;
  });

  interface NodeReading {
    label: string;
    value: number;
    nodeId: string;
  }

  const HEADLINE_NODE_IDS = [
    'financial_balance',
    'fan_momentum',
    'team_fitness',
    'squad_available_pct',
  ] as const;

  const NODE_LABELS: Readonly<Record<string, string>> = {
    financial_balance: 'Balance (€K)',
    fan_momentum: 'Fan momentum',
    team_fitness: 'Fitness equipo',
    squad_available_pct: 'Plantilla disp.',
  };

  const nodes = $derived.by<NodeReading[]>(() => {
    if (!data.hasPlaythrough || !data.worldState) return [];
    return HEADLINE_NODE_IDS.map((id) => ({
      nodeId: id,
      label: NODE_LABELS[id] ?? id,
      value: Math.round(data.worldState?.[id] ?? 0),
    }));
  });

  const messages = $derived(data.hasPlaythrough ? data.messages : []);
  const nextFixtures = $derived(data.hasPlaythrough ? data.nextFixtures : []);
  const pendingEvents = $derived(data.hasPlaythrough ? data.pendingEvents : []);

  function colorFor(value: number): string {
    if (value < 30) return 'progress-error';
    if (value < 70) return 'progress-warning';
    return 'progress-success';
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
    return '•';
  }
</script>

<AdvanceTransition
  open={showTransition}
  fromWeek={data.hasPlaythrough ? data.week : 0}
  headlines={transitionHeadlines}
  msPerDay={1500}
  onComplete={onTransitionComplete}
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
              <span class="font-mono">{data.weekDate.display}</span>
              · semana <span class="font-mono">{data.week}</span>
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
          ></form>
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

    <!-- Week summary (post-advance) -->
    {#if data.justAdvanced}
      <section class="alert alert-success shadow-lg">
        <div class="flex-1">
          <h3 class="font-bold">Semana avanzada al {data.weekDate.display}</h3>
          {#if data.lastResult && data.lastResult.week === data.week}
            <p class="text-sm">
              <span class="badge {outcomeBadge(data.lastResult.outcome)} mr-2">
                {outcomeLabel(data.lastResult.outcome)}
              </span>
              <span class="font-semibold">{data.lastResult.opponentName}</span>
              <span class="font-mono ml-2">
                {data.lastResult.isHome ? `${data.lastResult.myScore}-${data.lastResult.oppScore}` : `${data.lastResult.oppScore}-${data.lastResult.myScore}`}
              </span>
              ({data.lastResult.isHome ? 'casa' : 'fuera'})
            </p>
          {:else}
            <p class="text-sm opacity-80">
              Sin partido esta semana — entrenamientos y operaciones de oficina.
            </p>
          {/if}
        </div>
      </section>
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
              <span class="opacity-50 text-xs uppercase tracking-wider mt-1 w-16 flex-shrink-0">
                {h.tag}
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
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <div class="text-xs uppercase opacity-50 tracking-wide">{n.label}</div>
              <div class="text-3xl font-mono font-semibold">{n.value}</div>
              <progress class="progress {colorFor(n.value)}" value={n.value} max="100"></progress>
            </div>
          </div>
        {/each}
      </section>
    {:else}
      <div class="alert alert-info">
        <span>Esperando primer tick del simulador para mostrar nodos cascada.</span>
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
            <a
              href="/match/{f.id}"
              class="flex items-center justify-between p-3 rounded bg-base-200 hover:bg-base-300"
            >
              <div>
                <div class="text-xs opacity-60">⚽ Partido · {f.date.display}</div>
                <div class="font-semibold">
                  {f.isHome ? '🏠' : '✈️'} vs {f.opponentName}
                </div>
              </div>
              <span class="badge badge-primary">Jor {f.matchday}</span>
            </a>
          {/each}

          {#each pendingEvents as e}
            <a
              href="/calendar"
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
                      {m.role.replace('_', ' ')} · tier {m.tier} · {m.priority} · sem {m.week}
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

<!--
  Calendar — real month-grid centered on "hoy". Each Saturday of the in-game
  week is one cell. Events and fixtures pin to their actual dates.

  Story: MVP UX fixes — visual calendar grid
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';

  let { data }: { data: PageData } = $props();

  type EventRow = Extract<PageData, { hasPlaythrough: true }>['events'][number];
  type FixtureRow = Extract<PageData, { hasPlaythrough: true }>['fixtures'][number];

  let openEventId = $state<string | null>(null);

  // Build a list of "weeks to display": from currentWeek - 4 to currentWeek + 8.
  // Each entry is a Saturday with its events + fixture (if any).
  interface CalendarCell {
    week: number;
    isoDate: string;
    displayDate: string;
    isToday: boolean;
    isPast: boolean;
    events: EventRow[];
    fixture: FixtureRow | null;
  }

  const cells = $derived.by<CalendarCell[]>(() => {
    if (!data.hasPlaythrough) return [];
    const today = data.currentWeek;
    const out: CalendarCell[] = [];
    for (let w = today - 4; w <= today + 8; w++) {
      if (w < 0) continue;
      const week = w;
      const evs = data.events.filter((e) => e.week === week);
      const fx = data.fixtures.find((f) => f.week === week) ?? null;
      const date = evs[0]?.date ?? fx?.date;
      if (!date && evs.length === 0 && !fx) {
        // Synthesize a placeholder if no event/fixture — still show the date.
      }
      // Always synth a date even if no events.
      out.push({
        week,
        isoDate: '',
        displayDate: '',
        isToday: w === today,
        isPast: w < today,
        events: evs,
        fixture: fx,
      });
    }
    return out;
  });

  const openEvent = $derived(
    openEventId && data.hasPlaythrough
      ? data.events.find((e) => e.id === openEventId)
      : null,
  );

  function eventIcon(type: string): string {
    if (type.startsWith('season_'))    return '🗓';
    if (type.startsWith('transfer_'))  return '💼';
    if (type.startsWith('sponsor_'))   return '🤝';
    if (type.startsWith('board_'))     return '🏛';
    if (type.startsWith('scandal'))    return '⚠️';
    return '•';
  }

  function priorityColor(p: string): string {
    if (p === 'STOP')     return 'badge-error';
    if (p === 'ADVISORY') return 'badge-warning';
    return 'badge-ghost';
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Calendario</h1>
    {#if data.hasPlaythrough}
      <p class="opacity-60">
        Hoy: <span class="font-mono">{data.today.display}</span>
        · semana <span class="font-mono">{data.currentWeek}</span>
      </p>
    {/if}
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver el calendario.</span>
    </div>
  {:else}
    <!-- Week-by-week strip, centered on "hoy" -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Semanas — pasado, hoy, futuro</h2>
        <div class="space-y-2 mt-2">
          {#each data.events as _, _i (data.currentWeek)}{/each}
          {#each Array.from({ length: 13 }, (_, i) => data.currentWeek - 4 + i).filter((w) => w >= 0) as week}
            {@const dayEvents = data.events.filter((e) => e.week === week)}
            {@const fixture = data.fixtures.find((f) => f.week === week) ?? null}
            {@const date = dayEvents[0]?.date ?? fixture?.date ?? null}
            {@const isToday = week === data.currentWeek}
            {@const isPast = week < data.currentWeek}
            <div
              class="flex items-stretch gap-3 p-3 rounded transition-all
                     {isToday ? 'bg-primary/15 border-2 border-primary ring-2 ring-primary/30' : ''}
                     {isPast ? 'opacity-50 bg-base-200' : ''}
                     {!isToday && !isPast ? 'bg-base-200' : ''}"
            >
              <div class="flex-shrink-0 w-32 text-center border-r border-base-300 pr-3">
                <div class="font-mono text-xs opacity-60">Sem {week}</div>
                {#if date}
                  <div class="font-mono text-sm font-semibold">{date.display}</div>
                {/if}
                {#if isToday}
                  <div class="badge badge-primary badge-sm mt-1">HOY</div>
                {/if}
              </div>

              <div class="flex-1 space-y-1">
                {#if fixture}
                  <a
                    href="/match/{fixture.id}"
                    class="flex items-center justify-between p-2 rounded bg-base-100 hover:bg-primary/10"
                  >
                    <div>
                      <div class="text-xs opacity-60">⚽ Jornada {fixture.matchday}</div>
                      <div class="font-semibold text-sm">
                        {fixture.isHome ? '🏠' : '✈️'} vs {fixture.opponent}
                      </div>
                    </div>
                    <div class="font-mono text-sm">
                      {#if fixture.status === 'played' && fixture.homeScore !== null && fixture.awayScore !== null}
                        <span class="badge badge-neutral">
                          {fixture.homeScore}-{fixture.awayScore}
                        </span>
                      {:else}
                        <span class="badge badge-ghost">pendiente</span>
                      {/if}
                    </div>
                  </a>
                {/if}

                {#each dayEvents as e}
                  <button
                    class="w-full flex items-center justify-between p-2 rounded text-left
                           {e.priority === 'STOP' && e.status === 'pending' ? 'bg-error/10 border border-error/30 hover:bg-error/20' : 'bg-base-100'}"
                    onclick={() => (openEventId = e.id)}
                    type="button"
                  >
                    <div>
                      <div class="text-xs opacity-60">{eventIcon(e.type)} {e.type}</div>
                      <div class="text-sm">
                        {e.status === 'pending' ? 'Pendiente' : e.status === 'resolved' ? 'Resuelto' : e.status}
                      </div>
                    </div>
                    <span class="badge {priorityColor(e.priority)}">{e.priority}</span>
                  </button>
                {/each}

                {#if !fixture && dayEvents.length === 0}
                  <p class="text-xs opacity-40 italic p-2">Sin eventos esta semana.</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Decision modal -->
    {#if openEvent}
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg">{eventIcon(openEvent.type)} {openEvent.type}</h3>
          <p class="text-sm opacity-70 mt-2">
            {openEvent.date.display} · Estado: <span class="font-mono">{openEvent.status}</span>
          </p>

          {#if openEvent.status === 'pending'}
            <div class="flex flex-col gap-2 mt-4">
              <form method="POST" action="?/decide" use:enhance>
                <input type="hidden" name="eventId" value={openEvent.id} />
                <input type="hidden" name="choice" value="accept" />
                <button class="btn btn-primary btn-block" type="submit">Aceptar</button>
              </form>
              <form method="POST" action="?/decide" use:enhance>
                <input type="hidden" name="eventId" value={openEvent.id} />
                <input type="hidden" name="choice" value="reject" />
                <button class="btn btn-outline btn-block" type="submit">Rechazar</button>
              </form>
            </div>
            <p class="text-xs opacity-60 mt-3">
              La opción por defecto se aplicará pasados 24h si no decides.
            </p>
          {:else}
            <p class="text-sm opacity-80 mt-3">
              Este evento ya fue resuelto.
            </p>
          {/if}

          <div class="modal-action">
            <button class="btn" onclick={() => (openEventId = null)}>Cerrar</button>
          </div>
        </div>
        <div
          class="modal-backdrop"
          role="button"
          tabindex="-1"
          aria-label="Close"
          onclick={() => (openEventId = null)}
          onkeydown={(e) => e.key === 'Escape' && (openEventId = null)}
        ></div>
      </div>
    {/if}
  {/if}
</div>

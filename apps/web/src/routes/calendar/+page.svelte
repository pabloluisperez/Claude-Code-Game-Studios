<!--
  Calendar panel — wired to /calendar/+page.server.ts.

  Story: HUD-UI-007
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const pending = $derived(
    data.hasPlaythrough
      ? data.events.filter((e) => e.priority === 'STOP' && e.status === 'pending')
      : [],
  );

  let openEventId = $state<string | null>(null);
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
    <p class="opacity-60">Eventos pendientes y agendados</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver el calendario.</span>
    </div>
  {:else if data.events.length === 0}
    <div class="alert alert-info">
      <span>No hay eventos programados todavía.</span>
    </div>
  {:else}
    {#if pending.length > 0}
      <section class="card bg-error/10 border border-error/30">
        <div class="card-body">
          <h2 class="card-title text-error">⚠ Decisiones pendientes ({pending.length})</h2>
          <div class="space-y-2">
            {#each pending as e}
              <button
                class="btn btn-block justify-start"
                onclick={() => (openEventId = e.id)}
                type="button"
              >
                <span>{eventIcon(e.type)}</span>
                <span class="font-semibold">Sem {e.week}</span>
                <span>·</span>
                <span>{e.type}</span>
              </button>
            {/each}
          </div>
          <p class="text-xs opacity-70 mt-2">
            No se podrá avanzar la semana hasta resolver las decisiones STOP.
          </p>
        </div>
      </section>
    {/if}

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Línea de tiempo</h2>
        <div class="space-y-1 text-sm">
          {#each data.events as e}
            <div class="flex items-center gap-3 p-2 rounded hover:bg-base-200">
              <div class="font-mono text-xs opacity-60 w-12">S{e.week}</div>
              <span class="text-xl">{eventIcon(e.type)}</span>
              <div class="flex-1">{e.type}</div>
              <span class="badge {priorityColor(e.priority)}">{e.priority}</span>
              <span class="badge badge-outline">{e.status}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    {#if openEvent}
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg">{eventIcon(openEvent.type)} {openEvent.type}</h3>
          <p class="text-sm opacity-70 mt-2">
            Semana <span class="font-mono">{openEvent.week}</span>
          </p>

          <div class="flex flex-col gap-2 mt-4">
            <form method="POST" action="/calendar?/decide">
              <input type="hidden" name="eventId" value={openEvent.id} />
              <input type="hidden" name="choice" value="accept" />
              <button class="btn btn-primary btn-block" type="submit">Aceptar</button>
            </form>
            <form method="POST" action="/calendar?/decide">
              <input type="hidden" name="eventId" value={openEvent.id} />
              <input type="hidden" name="choice" value="decline" />
              <button class="btn btn-outline btn-block" type="submit">Rechazar</button>
            </form>
          </div>

          <p class="text-xs opacity-60 mt-3">
            La opción por defecto se aplicará pasados 24h si no decides.
          </p>

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

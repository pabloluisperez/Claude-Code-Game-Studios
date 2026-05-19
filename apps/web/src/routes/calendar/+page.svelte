<!--
  Calendar panel — 38-week season timeline + pending STOP events + decisions UI.

  Story: HUD-UI-007
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  interface CalendarRow {
    week: number;
    type: string;
    priority: 'STOP' | 'ADVISORY' | 'NOTIFY';
    title: string;
    status: 'pending' | 'resolved' | 'expired';
  }

  const events: CalendarRow[] = [
    { week: 1, type: 'season_start',       priority: 'NOTIFY',  title: 'Inicio de temporada',     status: 'resolved' },
    { week: 6, type: 'sponsor_offer',      priority: 'STOP',    title: 'Oferta de Pueblo Bakery', status: 'pending'  },
    { week: 8, type: 'transfer_offer',     priority: 'STOP',    title: 'Oferta por P. Jiménez',   status: 'pending'  },
    { week: 12, type: 'board_meeting_crisis', priority: 'STOP', title: 'Reunión de board (Crisis)', status: 'pending' },
    { week: 18, type: 'transfer_window_close', priority: 'NOTIFY', title: 'Cierre mercado invernal', status: 'pending' },
  ];

  const pending = $derived(events.filter((e) => e.priority === 'STOP' && e.status === 'pending'));
  const advisory = $derived(events.filter((e) => e.priority === 'ADVISORY'));
  const notify = $derived(events.filter((e) => e.priority === 'NOTIFY'));

  let openEvent = $state<CalendarRow | null>(null);

  function eventIcon(type: string): string {
    if (type.startsWith('season_'))         return '🗓';
    if (type.startsWith('transfer_'))       return '💼';
    if (type.startsWith('sponsor_'))        return '🤝';
    if (type.startsWith('board_'))          return '🏛';
    if (type.startsWith('scandal'))         return '⚠️';
    return '•';
  }

  function priorityColor(p: 'STOP' | 'ADVISORY' | 'NOTIFY'): string {
    if (p === 'STOP') return 'badge-error';
    if (p === 'ADVISORY') return 'badge-warning';
    return 'badge-ghost';
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Calendario</h1>
    <p class="opacity-60">38 semanas · eventos pendientes y agendados</p>
  </header>

  <!-- Pending STOP events -->
  {#if pending.length > 0}
    <section class="card bg-error/10 border border-error/30">
      <div class="card-body">
        <h2 class="card-title text-error">⚠ Decisiones pendientes ({pending.length})</h2>
        <div class="space-y-2">
          {#each pending as e}
            <button
              class="btn btn-block justify-start"
              onclick={() => (openEvent = e)}
              type="button"
            >
              <span>{eventIcon(e.type)}</span>
              <span class="font-semibold">Sem {e.week}</span>
              <span>·</span>
              <span>{e.title}</span>
            </button>
          {/each}
        </div>
        <p class="text-xs opacity-70 mt-2">
          No se podrá avanzar la semana hasta resolver las decisiones STOP.
        </p>
      </div>
    </section>
  {/if}

  <!-- Full event timeline -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Línea de tiempo</h2>
      <div class="space-y-1 text-sm">
        {#each events as e}
          <div class="flex items-center gap-3 p-2 rounded hover:bg-base-200">
            <div class="font-mono text-xs opacity-60 w-12">S{e.week}</div>
            <span class="text-xl">{eventIcon(e.type)}</span>
            <div class="flex-1">{e.title}</div>
            <span class="badge {priorityColor(e.priority)}">{e.priority}</span>
            <span class="badge badge-outline">{e.status}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Decision modal -->
  {#if openEvent}
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="font-bold text-lg">{eventIcon(openEvent.type)} {openEvent.title}</h3>
        <p class="text-sm opacity-70 mt-2">
          Tipo: <span class="font-mono">{openEvent.type}</span> · Semana <span class="font-mono">{openEvent.week}</span>
        </p>

        <!-- Generic decision UI — replaced per variant in production -->
        <div class="flex flex-col gap-2 mt-4">
          <button class="btn btn-primary" type="button">Aceptar</button>
          <button class="btn btn-outline" type="button">Rechazar</button>
          {#if openEvent.type === 'transfer_offer'}
            <button class="btn btn-outline" type="button">Contraoferta</button>
          {/if}
        </div>

        <p class="text-xs opacity-60 mt-3">
          La opción por defecto se aplicará pasados 24h si no decides.
        </p>

        <div class="modal-action">
          <button class="btn" onclick={() => (openEvent = null)}>Cerrar</button>
        </div>
      </div>
      <div
        class="modal-backdrop"
        role="button"
        tabindex="-1"
        aria-label="Close"
        onclick={() => (openEvent = null)}
        onkeydown={(e) => e.key === 'Escape' && (openEvent = null)}
      ></div>
    </div>
  {/if}
</div>

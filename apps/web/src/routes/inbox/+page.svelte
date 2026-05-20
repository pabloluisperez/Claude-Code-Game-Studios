<!--
  Inbox — full timeline of staff messages and calendar events.

  Story: Topbar envelope → inbox
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  let tab = $state<'messages' | 'events'>('messages');

  function priorityClass(p: string): string {
    if (p === 'URGENT') return 'alert-error';
    if (p === 'STOP') return 'alert-error';
    if (p === 'ADVISORY') return 'alert-warning';
    return 'alert-info';
  }

  function tierBadge(t: number): string {
    if (t === 3) return 'badge-warning';
    if (t === 2) return 'badge-info';
    return 'badge-ghost';
  }

  function eventIcon(type: string): string {
    if (type.startsWith('season_')) return '🗓';
    if (type.startsWith('transfer_')) return '💼';
    if (type.startsWith('sponsor_')) return '🤝';
    if (type.startsWith('board_')) return '🏛';
    if (type.startsWith('scandal')) return '⚠️';
    return '•';
  }
</script>

<div class="space-y-6 max-w-4xl mx-auto">
  <header>
    <h1 class="text-2xl font-bold">📨 Bandeja de entrada</h1>
    <p class="opacity-60">Mensajes del staff y eventos de la temporada.</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para tener bandeja.</span>
    </div>
  {:else}
    <div role="tablist" class="tabs tabs-boxed w-fit">
      <button
        role="tab"
        class="tab {tab === 'messages' ? 'tab-active' : ''}"
        onclick={() => (tab = 'messages')}
      >
        Mensajes ({data.messages.length})
      </button>
      <button
        role="tab"
        class="tab {tab === 'events' ? 'tab-active' : ''}"
        onclick={() => (tab = 'events')}
      >
        Eventos ({data.events.length})
      </button>
    </div>

    {#if tab === 'messages'}
      {#if data.messages.length === 0}
        <p class="opacity-60 text-sm">Sin mensajes aún.</p>
      {:else}
        <div class="space-y-2">
          {#each data.messages as m}
            <div class="alert {priorityClass(m.priority)} {!m.isRead ? 'ring-2 ring-primary/30' : ''}">
              <div class="flex-1">
                <div class="flex items-center gap-2 text-xs opacity-70">
                  <span class="badge {tierBadge(m.tier)} badge-sm">Tier {m.tier}</span>
                  <span class="opacity-80">{m.date.display}</span>
                  <span class="opacity-60">· semana {m.week}</span>
                </div>
                <div class="text-sm mt-1">{m.content}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      {#if data.events.length === 0}
        <p class="opacity-60 text-sm">Sin eventos en el calendario aún.</p>
      {:else}
        <div class="space-y-2">
          {#each data.events as e}
            <div class="flex items-start gap-3 p-3 rounded bg-base-200">
              <span class="text-2xl">{eventIcon(e.type)}</span>
              <div class="flex-1">
                <div class="text-xs opacity-60">
                  {e.date.display} · sem {e.week}
                  <span class="badge badge-sm ml-1">{e.priority}</span>
                  <span class="badge badge-sm badge-outline ml-1">{e.status}</span>
                </div>
                <div class="font-semibold text-sm mt-1">{e.type}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

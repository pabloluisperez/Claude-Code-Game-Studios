<!--
  Inbox — compact timeline of staff messages + calendar events.

  Visual rules:
   - Neutral grey background by default.
   - If the row implies action (STOP event, URGENT message): yellow tint.
   - If critical (board_meeting_crisis, scandal, nomina_frozen):
     red background.
   - When action is required, surface a link to the relevant section
     (Calendar, Finance, Squad, Staff).

  Story: Inbox compaction + action links
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { eventDisplay, eventNeedsAction } from '$lib/event-labels';
  let { data }: { data: PageData } = $props();

  let tab = $state<'all' | 'messages' | 'events'>('all');

  /** Action target page for a given event type. */
  function actionUrl(type: string): string | null {
    if (type.startsWith('sponsor_')) return '/finance';
    if (type.startsWith('transfer_')) return '/squad';
    if (type.startsWith('board_')) return '/calendar';
    if (type === 'scandal' || type === 'corruption_caught') return '/calendar';
    if (type === 'nomina_frozen') return '/finance';
    if (type === 'youth_promotion') return '/squad';
    if (type === 'contract_renewal') return '/squad';
    return '/calendar';
  }

  function isCritical(type: string): boolean {
    return [
      'board_meeting_crisis',
      'scandal',
      'corruption_caught',
      'nomina_frozen',
    ].includes(type);
  }

  function messageTone(priority: string): 'neutral' | 'action' | 'critical' {
    if (priority === 'URGENT') return 'action';
    return 'neutral';
  }
  function eventTone(type: string, priority: string, status: string): 'neutral' | 'action' | 'critical' {
    if (status === 'resolved' || status === 'expired') return 'neutral';
    if (isCritical(type)) return 'critical';
    if (eventNeedsAction(type, priority)) return 'action';
    return 'neutral';
  }

  function toneClasses(tone: 'neutral' | 'action' | 'critical'): string {
    if (tone === 'critical') return 'bg-error/10 border-l-4 border-l-error';
    if (tone === 'action')   return 'bg-warning/10 border-l-4 border-l-warning';
    return 'bg-base-200 border-l-4 border-l-transparent';
  }

  /**
   * Tear-off calendar-sheet parts from 'Dom 2 ago 2026' → { dow, day, month }.
   * Bug P14 fix (playtest 2026-05-21 Pablo): 'Las fechas en bandeja de
   * entrada que se vean mas claras, como hoja de calendario'.
   */
  function dateSheet(display: string): { dow: string; day: string; month: string } {
    const parts = display.split(/\s+/);
    return {
      dow: parts[0] ?? '—',
      day: parts[1] ?? '—',
      month: parts[2] ?? '',
    };
  }
</script>

<div class="space-y-4 max-w-4xl mx-auto">
  <header>
    <h1 class="text-2xl font-bold">📨 Bandeja de entrada</h1>
    <p class="opacity-60 text-sm">Histórico de mensajes del staff y eventos.</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para tener bandeja.</span>
    </div>
  {:else}
    {@const unreadCount = data.messages.filter((m) => !m.isRead).length}
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div role="tablist" class="tabs tabs-boxed">
        <button
          role="tab"
          class="tab {tab === 'all' ? 'tab-active' : ''}"
          onclick={() => (tab = 'all')}
        >
          Todo ({data.messages.length + data.events.length})
        </button>
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
      {#if unreadCount > 0}
        <form method="POST" action="?/markAllRead" use:enhance>
          <button type="submit" class="btn btn-xs btn-ghost">
            ✓ Marcar todos leídos ({unreadCount})
          </button>
        </form>
      {/if}
    </div>

    <div class="space-y-1">
      <!-- P14 calendar-sheet date display + P15 stable layout (badge space reserved). -->
      {#if (tab === 'all' || tab === 'messages')}
        {#each data.messages as m}
          {@const tone = messageTone(m.priority)}
          {@const sheet = dateSheet(m.date.display)}
          <form method="POST" action="?/markRead" use:enhance class="contents">
            <input type="hidden" name="id" value={m.id} />
            <button
              type={m.isRead ? 'button' : 'submit'}
              class="flex items-stretch gap-2 px-2 py-1.5 rounded text-xs text-left w-full
                     {toneClasses(tone)}
                     {!m.isRead ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}"
            >
              <!-- Calendar-sheet tear-off -->
              <div class="flex flex-col items-center justify-center w-12 flex-shrink-0
                          bg-base-100/60 rounded border border-base-300/50 px-1 py-0.5">
                <span class="text-[9px] uppercase opacity-60 font-bold leading-none">{sheet.dow}</span>
                <span class="text-base font-bold leading-tight">{sheet.day}</span>
                <span class="text-[9px] uppercase opacity-60 leading-none">{sheet.month}</span>
              </div>
              <span class="opacity-50 text-[10px] uppercase w-8 flex-shrink-0 self-center">S{m.week}</span>
              <span class="flex-1 leading-snug self-center">{m.content}</span>
              <!-- P15: reserve the 'nuevo' badge slot so layout doesn't shift on read. -->
              <span class="w-12 flex-shrink-0 self-center text-right">
                {#if !m.isRead}<span class="badge badge-primary badge-xs">nuevo</span>{/if}
              </span>
            </button>
          </form>
        {/each}
      {/if}

      {#if (tab === 'all' || tab === 'events')}
        {#each data.events as e}
          {@const tone = eventTone(e.type, e.priority, e.status)}
          {@const display = eventDisplay(e.type)}
          {@const needsAction = e.status === 'pending' && eventNeedsAction(e.type, e.priority)}
          {@const sheet = dateSheet(e.date.display)}
          <div class="flex items-stretch gap-2 px-2 py-1.5 rounded text-xs {toneClasses(tone)}">
            <div class="flex flex-col items-center justify-center w-12 flex-shrink-0
                        bg-base-100/60 rounded border border-base-300/50 px-1 py-0.5">
              <span class="text-[9px] uppercase opacity-60 font-bold leading-none">{sheet.dow}</span>
              <span class="text-base font-bold leading-tight">{sheet.day}</span>
              <span class="text-[9px] uppercase opacity-60 leading-none">{sheet.month}</span>
            </div>
            <span class="opacity-50 text-[10px] uppercase w-8 flex-shrink-0 self-center">S{e.week}</span>
            <span class="flex-shrink-0 self-center">{display.icon}</span>
            <span class="flex-1 leading-snug self-center">
              <span class="font-semibold">{display.label}</span>
              {#if e.status !== 'pending'}
                <span class="opacity-60">· {e.status}</span>
              {/if}
            </span>
            <span class="w-12 flex-shrink-0 self-center text-right">
              {#if needsAction}
                <a href={actionUrl(e.type)} class="btn btn-xs btn-warning">Ver</a>
              {/if}
            </span>
          </div>
        {/each}
      {/if}

      {#if data.messages.length === 0 && data.events.length === 0}
        <p class="opacity-60 text-sm">Sin mensajes ni eventos todavía.</p>
      {/if}
    </div>
  {/if}
</div>

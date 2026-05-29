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

  let tab = $state<'all' | 'messages' | 'events' | 'rumores'>('all');

  /** Rumour-mill messages (Sprint 26-NH1) — grouped into their own feed. */
  function isRumor(templateKey: string | null | undefined): boolean {
    return Boolean(templateKey && templateKey.startsWith('rumor:'));
  }
  const rumorCount = $derived(
    data.hasPlaythrough ? data.messages.filter((m) => isRumor(m.templateKey)).length : 0,
  );

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

  /**
   * Bad/negative news (Pablo 2026-05-29: "las que sean malas con letra roja y
   * negrita"). Derived from templateKey so it's robust to copy changes:
   *   - ambient low-bucket messages end in ':0';
   *   - explicit negative surfaces (low stock, expiry, warnings, crisis).
   */
  function isBadMessage(templateKey: string | null | undefined): boolean {
    if (!templateKey) return false;
    return /(:0$|low_stock|stock_low|warning|crisis|frozen|expired|relegat|descenso|scandal)/i.test(
      templateKey,
    );
  }

  function messageTone(priority: string, templateKey?: string | null): 'neutral' | 'action' | 'critical' {
    if (isBadMessage(templateKey)) return 'critical';
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
      <!-- a11y P1-4 (Sprint 11 task 11-3): aria-selected + aria-controls. -->
      <div role="tablist" class="tabs tabs-boxed" aria-label="Bandeja de entrada">
        <button
          role="tab"
          id="tab-inbox-all"
          aria-selected={tab === 'all'}
          aria-controls="tabpanel-inbox"
          class="tab {tab === 'all' ? 'tab-active' : ''}"
          onclick={() => (tab = 'all')}
        >
          Todo ({data.messages.length + data.events.length})
        </button>
        <button
          role="tab"
          id="tab-inbox-messages"
          aria-selected={tab === 'messages'}
          aria-controls="tabpanel-inbox"
          class="tab {tab === 'messages' ? 'tab-active' : ''}"
          onclick={() => (tab = 'messages')}
        >
          Mensajes ({data.messages.length})
        </button>
        <button
          role="tab"
          id="tab-inbox-events"
          aria-selected={tab === 'events'}
          aria-controls="tabpanel-inbox"
          class="tab {tab === 'events' ? 'tab-active' : ''}"
          onclick={() => (tab = 'events')}
        >
          Eventos ({data.events.length})
        </button>
        {#if rumorCount > 0}
          <button
            role="tab"
            id="tab-inbox-rumores"
            aria-selected={tab === 'rumores'}
            aria-controls="tabpanel-inbox"
            class="tab {tab === 'rumores' ? 'tab-active' : ''}"
            onclick={() => (tab = 'rumores')}
          >
            🗞️ Rumores ({rumorCount})
          </button>
        {/if}
      </div>
      {#if unreadCount > 0}
        <form method="POST" action="?/markAllRead" use:enhance>
          <button type="submit" class="btn btn-xs btn-ghost">
            ✓ Marcar todos leídos ({unreadCount})
          </button>
        </form>
      {/if}
    </div>

    <div
      role="tabpanel"
      id="tabpanel-inbox"
      aria-labelledby={tab === 'all' ? 'tab-inbox-all' : tab === 'messages' ? 'tab-inbox-messages' : tab === 'rumores' ? 'tab-inbox-rumores' : 'tab-inbox-events'}
      class="space-y-1"
    >
      <!-- Eventos actuales: pending events boxed at the top so they stand out
           (Pablo 2026-05-29: "en eventos resaltar con un cuadro actuales"). -->
      {#if tab === 'all' || tab === 'events'}
        {@const current = data.events.filter((e) => e.status === 'pending')}
        {#if current.length > 0}
          <div class="rounded-lg border-2 border-primary bg-primary/5 p-3 mb-3 space-y-1.5">
            <h2 class="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1">
              📌 Eventos actuales ({current.length})
            </h2>
            {#each current as e}
              {@const display = eventDisplay(e.type)}
              {@const needsAction = eventNeedsAction(e.type, e.priority)}
              {@const critical = isCritical(e.type)}
              {@const sheet = dateSheet(e.date.display)}
              <div class="flex items-stretch gap-2 px-2 py-1.5 rounded text-xs bg-base-100
                          border-l-4 {critical ? 'border-l-error' : 'border-l-primary'}">
                <div class="flex flex-col items-center justify-center w-12 flex-shrink-0
                            bg-base-200/60 rounded border border-base-300/50 px-1 py-0.5">
                  <span class="text-[9px] uppercase opacity-60 font-bold leading-none">{sheet.dow}</span>
                  <span class="text-base font-bold leading-tight">{sheet.day}</span>
                  <span class="text-[9px] uppercase opacity-60 leading-none">{sheet.month}</span>
                </div>
                <span class="opacity-50 text-[10px] uppercase w-8 flex-shrink-0 self-center">S{e.week}</span>
                <span class="flex-shrink-0 self-center">{display.icon}</span>
                <span class="flex-1 leading-snug self-center {critical ? 'font-bold text-error' : 'font-semibold'}">
                  {display.label}
                </span>
                <span class="w-12 flex-shrink-0 self-center text-right">
                  {#if needsAction}
                    <a href={actionUrl(e.type)} class="btn btn-xs {critical ? 'btn-error' : 'btn-primary'}">Ver</a>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- P14 calendar-sheet date display + P15 stable layout (badge space reserved). -->
      {#if tab === 'all' || tab === 'messages' || tab === 'rumores'}
        {@const visibleMessages = tab === 'rumores' ? data.messages.filter((m) => isRumor(m.templateKey)) : data.messages}
        {#each visibleMessages as m}
          {@const tone = messageTone(m.priority, m.templateKey)}
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
              <span class="flex-1 leading-snug self-center {tone === 'critical' ? 'font-bold text-error' : ''}">{m.content}</span>
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

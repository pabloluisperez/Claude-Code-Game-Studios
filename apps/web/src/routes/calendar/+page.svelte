<!--
  Calendar — real month-grid centered on "hoy". Each Saturday of the in-game
  week is one cell. Events and fixtures pin to their actual dates.

  Story: MVP UX fixes — visual calendar grid
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { eventDisplay, eventNeedsAction } from '$lib/event-labels';
  import { formatEurK } from '$lib/format';
  import { onMount } from 'svelte';

  let { data }: { data: PageData } = $props();

  // Fixtures the user has watched this session — read from sessionStorage
  // so today's match result stays hidden until the user actively replays.
  let seenFixtures = $state<Set<string>>(new Set());
  onMount(() => {
    if (typeof sessionStorage === 'undefined') return;
    const out = new Set<string>();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('tsm-seen-fixture:') && sessionStorage.getItem(k) === '1') {
        out.add(k.slice('tsm-seen-fixture:'.length));
      }
    }
    seenFixtures = out;
  });

  function shouldHideScore(fx: { week: number; id: string }): boolean {
    if (!data.hasPlaythrough) return false;
    if (fx.week !== data.currentWeek) return false;
    return !seenFixtures.has(fx.id);
  }

  type EventRow = Extract<PageData, { hasPlaythrough: true }>['events'][number];
  type FixtureRow = Extract<PageData, { hasPlaythrough: true }>['fixtures'][number];

  let openEventId = $state<string | null>(null);

  const weeksWindow = $derived.by<number[]>(() => {
    if (!data.hasPlaythrough) return [];
    const today = data.currentWeek;
    const out: number[] = [];
    for (let w = today - 4; w <= today + 8; w++) {
      if (w >= 0) out.push(w);
    }
    return out;
  });

  function eventsForWeek(week: number): EventRow[] {
    if (!data.hasPlaythrough) return [];
    // Sprint 12 walkthrough fix (Pablo Part B): events whose precise day
    // equals the current cursor are surfaced in the mid-week marker row
    // instead of the week row — they happen TODAY, not on Sunday.
    return data.events.filter((e) => {
      if (e.week !== week) return false;
      if (!data.hasPlaythrough || data.dayInWeek === 0) return true;
      if (week !== data.currentWeek) return true;
      const eventDay = e.scheduledDayOfSeason ?? e.week * 7;
      return eventDay !== data.currentDayOfSeason;
    });
  }

  function eventsForToday(): EventRow[] {
    if (!data.hasPlaythrough) return [];
    return data.events.filter((e) => {
      const eventDay = e.scheduledDayOfSeason ?? e.week * 7;
      return eventDay === data.currentDayOfSeason;
    });
  }
  function fixtureForWeek(week: number): FixtureRow | null {
    if (!data.hasPlaythrough) return null;
    return data.fixtures.find((f) => f.week === week) ?? null;
  }

  const openEvent = $derived(
    openEventId && data.hasPlaythrough
      ? data.events.find((e) => e.id === openEventId)
      : null,
  );

  function eventIcon(type: string): string {
    return eventDisplay(type).icon;
  }
  function eventLabel(type: string): string {
    return eventDisplay(type).label;
  }
  function eventDescription(type: string): string {
    return eventDisplay(type).description;
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
        Hoy: <span>{data.todayPrecise.displayLong}</span>
        · semana <span class="font-mono">{data.currentWeek}</span>
        {#if data.dayInWeek > 0}
          · <span class="badge badge-warning badge-sm">Mid-week (día {data.dayInWeek + 1} / 7)</span>
        {/if}
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
          {#each weeksWindow as week (week)}
            {@const dayEvents = eventsForWeek(week)}
            {@const fixture = fixtureForWeek(week)}
            {@const date = dayEvents[0]?.date ?? fixture?.date ?? null}
            {@const isMidWeek = data.dayInWeek > 0}
            {@const isCurrentWeek = week === data.currentWeek}
            {@const isToday = isCurrentWeek && !isMidWeek}
            {@const isPast = week < data.currentWeek}
            <!-- Sprint 12 walkthrough fix (Pablo Part B): when mid-week,
                 inject a precise-day marker row BEFORE the next week row
                 (so it sits between week 33 and week 34) showing the
                 actual day + events scheduled for today. -->
            {#if isMidWeek && week === data.currentWeek + 1}
              {@const todayEvents = eventsForToday()}
              <div class="flex items-stretch gap-3 p-3 rounded bg-primary/15 border-2 border-primary ring-2 ring-primary/30">
                <div class="flex-shrink-0 w-32 text-center border-r border-base-300 pr-3">
                  <div class="font-mono text-xs opacity-60">📍 HOY</div>
                  <div class="text-sm font-semibold">{data.todayPrecise.displayLong}</div>
                  <div class="badge badge-primary badge-sm mt-1">Mid-week</div>
                </div>
                <div class="flex-1 space-y-1">
                  {#if todayEvents.length === 0}
                    <p class="text-xs opacity-60 italic p-2">Estás en mitad de la semana {data.currentWeek}. No hay eventos hoy mismo, pero quedan {7 - data.dayInWeek} día(s) por terminar.</p>
                  {:else}
                    {#each todayEvents as e}
                      <button
                        class="w-full flex items-center justify-between p-2 rounded text-left
                               {e.priority === 'STOP' && e.status === 'pending' ? 'bg-error/15 border border-error/40 hover:bg-error/25' : 'bg-base-100'}"
                        onclick={() => (openEventId = e.id)}
                        type="button"
                      >
                        <div>
                          <div class="text-xs opacity-60">{eventIcon(e.type)} {eventLabel(e.type)}</div>
                          <div class="text-sm font-semibold">
                            {e.status === 'pending' ? 'Pendiente — Decisión hoy' : e.status === 'resolved' ? 'Resuelto' : e.status}
                          </div>
                        </div>
                        <span class="badge {priorityColor(e.priority)}">{e.priority}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              </div>
            {/if}
            <div
              class="flex items-stretch gap-3 p-3 rounded transition-all
                     {isToday ? 'bg-primary/15 border-2 border-primary ring-2 ring-primary/30' : ''}
                     {isCurrentWeek && isMidWeek ? 'opacity-60 bg-base-200 border border-dashed border-primary/40' : ''}
                     {isPast ? 'opacity-50 bg-base-200' : ''}
                     {!isCurrentWeek && !isPast ? 'bg-base-200' : ''}"
            >
              <div class="flex-shrink-0 w-32 text-center border-r border-base-300 pr-3">
                <div class="font-mono text-xs opacity-60">Sem {week}</div>
                {#if date}
                  <div class="font-mono text-sm font-semibold">{date.display}</div>
                {/if}
                {#if isToday}
                  <div class="badge badge-primary badge-sm mt-1">HOY</div>
                {:else if isCurrentWeek && isMidWeek}
                  <div class="badge badge-ghost badge-sm mt-1">En curso</div>
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
                      {#if fixture.status === 'played' && fixture.homeScore !== null && fixture.awayScore !== null && !shouldHideScore(fixture)}
                        <span class="badge badge-neutral">
                          {fixture.homeScore}-{fixture.awayScore}
                        </span>
                      {:else if shouldHideScore(fixture)}
                        <span class="badge badge-warning">por jugar</span>
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
                      <div class="text-xs opacity-60">{eventIcon(e.type)} {eventLabel(e.type)}</div>
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
      {@const statusLabel = openEvent.status === 'pending'
        ? 'pendiente'
        : openEvent.status === 'resolved'
        ? 'resuelto'
        : openEvent.status === 'expired'
        ? 'expirado'
        : openEvent.status}
      {@const meta = openEvent.metadata as {
        options?: Record<string, { label: string; description: string }>;
        brand?: string;
        weeklyAmountEurK?: number;
        contractWeeks?: number;
        description?: string;
        // Contract renewal fields (Pablo 2026-05-25)
        kind?: string;
        playerName?: string;
        position?: string;
        age?: number;
        skill?: number;
        form?: number;
        currentSalaryEurK?: number;
        demandedSalaryEurK?: number;
        proposedContractWeeks?: number;
        resolvedOutcome?: string;
        resolvedFinalSalaryEurK?: number;
      } | null}
      {@const isRenewal = meta?.kind === 'contract_renewal'}
      {@const optEntries = (meta?.options
        ? Object.entries(meta.options)
        : isRenewal
        ? [
            ['accept', { label: `Aceptar (€${meta?.demandedSalaryEurK}K/sem)`, description: 'Aceptar las condiciones que pide el jugador.' }],
            ['reject', { label: 'Rechazar', description: 'No le renovamos — termina su contrato y se marcha libre.' }],
          ]
        : [
            ['accept', { label: 'Aceptar', description: 'Aceptar la propuesta tal cual.' }],
            ['reject', { label: 'Rechazar', description: 'Rechazar la propuesta.' }],
          ]) as ReadonlyArray<[string, { label: string; description: string }]>}
      <div class="modal modal-open">
        <div class="modal-box max-w-lg">
          <h3 class="font-bold text-lg">{eventIcon(openEvent.type)} {eventLabel(openEvent.type)}</h3>
          <p class="text-sm opacity-70 mt-2">
            {openEvent.date.display} · Estado: <span class="font-mono">{statusLabel}</span>
          </p>
          <p class="text-sm mt-3 leading-relaxed">{eventDescription(openEvent.type)}</p>

          <!-- Variant-specific context (sponsor amounts, etc.) -->
          {#if meta?.brand}
            <div class="alert alert-info py-2 mt-3 text-sm">
              <div>
                <div class="font-semibold">{meta.brand}</div>
                {#if meta.weeklyAmountEurK}
                  <div class="text-xs">
                    {formatEurK(meta.weeklyAmountEurK)}/sem
                    {#if meta.contractWeeks}· {meta.contractWeeks} semanas{/if}
                  </div>
                {/if}
                {#if meta.description}
                  <div class="text-xs opacity-80 mt-1">{meta.description}</div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Contract renewal context (Pablo 2026-05-25) -->
          {#if isRenewal && meta}
            <div class="alert alert-info py-3 mt-3 text-sm">
              <div class="w-full">
                <div class="font-semibold text-base mb-1">
                  {meta.playerName} <span class="opacity-60 text-xs">({meta.position} · {meta.age} años)</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs mt-2">
                  <div class="bg-base-200/60 rounded p-2">
                    <div class="opacity-60">Skill</div>
                    <div class="font-mono font-bold text-base">{meta.skill ?? '—'}</div>
                  </div>
                  <div class="bg-base-200/60 rounded p-2">
                    <div class="opacity-60">Forma</div>
                    <div class="font-mono font-bold text-base">{meta.form ?? '—'}</div>
                  </div>
                  <div class="bg-base-200/60 rounded p-2">
                    <div class="opacity-60">Duración</div>
                    <div class="font-mono font-bold text-base">{meta.proposedContractWeeks}sem</div>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div class="text-xs opacity-60">Ahora cobra</div>
                    <div class="font-mono font-bold">€{meta.currentSalaryEurK}K/sem</div>
                  </div>
                  <div class="text-xl opacity-40">→</div>
                  <div>
                    <div class="text-xs opacity-60">Pide</div>
                    <div class="font-mono font-bold text-warning">€{meta.demandedSalaryEurK}K/sem</div>
                  </div>
                </div>
                {#if openEvent.status === 'resolved' && meta.resolvedOutcome}
                  <div class="mt-3 p-2 rounded {meta.resolvedOutcome === 'renewed' ? 'bg-success/20' : 'bg-error/20'}">
                    <div class="text-xs font-bold uppercase tracking-wide">
                      {meta.resolvedOutcome === 'renewed' ? '✓ Renovado' : '✗ Se marcha libre'}
                    </div>
                    {#if meta.resolvedOutcome === 'renewed' && meta.resolvedFinalSalaryEurK}
                      <div class="text-sm font-mono mt-1">
                        Nuevo sueldo: €{meta.resolvedFinalSalaryEurK}K/sem · {meta.proposedContractWeeks} semanas
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if openEvent.status === 'pending' && eventNeedsAction(openEvent.type, openEvent.priority)}
            <div class="flex flex-col gap-2 mt-4">
              {#each optEntries as [optKey, opt]}
                <form method="POST" action="?/decide" use:enhance>
                  <input type="hidden" name="eventId" value={openEvent.id} />
                  <input type="hidden" name="choice" value={optKey} />
                  <button
                    class="btn btn-block justify-start text-left {optKey === 'accept' ? 'btn-primary' : 'btn-outline'}"
                    type="submit"
                  >
                    <div class="flex-1">
                      <div class="font-semibold">{opt.label}</div>
                      <div class="text-xs opacity-70 font-normal">{opt.description}</div>
                    </div>
                  </button>
                </form>
              {/each}

              <!-- Counter-offer form for contract renewals (Pablo 2026-05-25) -->
              {#if isRenewal && meta?.demandedSalaryEurK}
                <form method="POST" action="?/decide" use:enhance class="card bg-base-200 p-3 mt-1">
                  <input type="hidden" name="eventId" value={openEvent.id} />
                  <input type="hidden" name="choice" value="counter" />
                  <div class="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">
                    💬 Contraoferta
                  </div>
                  <p class="text-xs opacity-70 mb-2">
                    Si ofrecés ≥ €{meta.demandedSalaryEurK}K/sem acepta. Entre el 70% y 100% del pedido (≥ €{Math.round(meta.demandedSalaryEurK * 0.7)}K),
                    se la juega — puede aceptar o marcharse. Menos del 70% lo rechaza seguro.
                  </p>
                  <div class="flex items-center gap-2">
                    <span class="text-sm">€</span>
                    <input
                      type="number"
                      name="counterSalaryEurK"
                      class="input input-sm input-bordered w-24"
                      min="1"
                      max={meta.demandedSalaryEurK * 2}
                      value={Math.round((meta.currentSalaryEurK ?? 0) + ((meta.demandedSalaryEurK ?? 0) - (meta.currentSalaryEurK ?? 0)) / 2)}
                      required
                    />
                    <span class="text-sm opacity-70">K/sem</span>
                    <button type="submit" class="btn btn-sm btn-warning ml-auto">
                      Enviar contraoferta
                    </button>
                  </div>
                </form>
              {/if}
            </div>
            <p class="text-xs opacity-60 mt-3">
              {isRenewal ? 'Si rechazás o no decidís, el jugador acaba contrato y se va libre.' : 'La opción por defecto se aplicará pasados 24h si no decides.'}
            </p>
          {:else if openEvent.status === 'pending'}
            <p class="text-xs opacity-60 mt-3 italic">
              Aviso del calendario — es lo que hay, no requiere decisión.
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

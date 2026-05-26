<!--
  Squad panel + training intensity button group (5 buckets).

  Story: HUD-UI-003 + MVP UX (training intensity)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { describeTraits } from '@smt/shared';
  import Avatar from '$lib/components/avatar.svelte';
  import BucketGroup from '$lib/components/bucket-group.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type SortKey =
    | 'lastName' | 'position' | 'skill'
    | 'velocidad' | 'resistencia' | 'agresividad' | 'calidad'
    | 'form' | 'morale' | 'fitness';
  let sortKey = $state<SortKey>('skill');
  let sortDir = $state<'asc' | 'desc'>('desc');
  /** Set of selected positions. Empty OR all = show all. */
  let posFilter = $state<Set<string>>(new Set());
  let selected = $state<(typeof data.players)[number] | null>(null);

  // Position labels in Spanish (display only — DB keeps internal codes).
  const POS_LABEL: Readonly<Record<string, string>> = {
    GK: 'POR',
    DEF: 'DEF',
    MID: 'MED',
    FWD: 'DEL',
  };
  function posLabel(p: string): string {
    return POS_LABEL[p] ?? p;
  }

  type IntensityBucket = 'descanso' | 'suave' | 'normal' | 'fuerte' | 'brutal';
  interface BucketDef {
    id: IntensityBucket;
    label: string;
    index: number;
    danger: 'good' | 'warn' | 'bad' | undefined;
    hint: string;
  }
  const BUCKETS: readonly BucketDef[] = [
    { id: 'descanso', label: 'Descanso', index: 10, danger: 'warn', hint: 'Fitness se recupera pero pierdes ritmo competitivo.' },
    { id: 'suave', label: 'Suave', index: 30, danger: undefined, hint: 'Carga ligera. Conservador y seguro.' },
    { id: 'normal', label: 'Normal', index: 50, danger: 'good', hint: 'Equilibrio óptimo entre forma y descanso.' },
    { id: 'fuerte', label: 'Fuerte', index: 70, danger: undefined, hint: 'Sube el rendimiento, sube ligeramente el riesgo de lesión.' },
    { id: 'brutal', label: 'Brutal', index: 90, danger: 'bad', hint: 'Sobreentrenamiento — el equipo llega fundido al partido.' },
  ];

  const currentBucket = $derived.by<IntensityBucket>(() => {
    if (!data.hasPlaythrough) return 'normal';
    return (
      BUCKETS.reduce((best, b) =>
        Math.abs(b.index - data.trainingIntensity) < Math.abs(best.index - data.trainingIntensity) ? b : best,
      ).id
    );
  });

  let pendingBucket = $state<IntensityBucket>('normal');
  let intensityFormEl: HTMLFormElement | undefined = $state();

  // Keep pendingBucket in sync with the persisted value when data refreshes.
  $effect(() => {
    pendingBucket = currentBucket;
  });

  // When the user picks a different bucket, submit the form automatically.
  $effect(() => {
    if (
      data.hasPlaythrough &&
      pendingBucket !== currentBucket &&
      intensityFormEl
    ) {
      intensityFormEl.requestSubmit();
    }
  });

  function dangerColor(d: BucketDef['danger']): string {
    if (d === 'good') return 'btn-success';
    if (d === 'warn') return 'btn-warning';
    if (d === 'bad') return 'btn-error';
    return '';
  }

  // Playtest PT-1 fix (Pablo 2026-05-21 Sprint 12): when sorting by
  // position, respect the football ordering (POR → DEF → MED → DEL)
  // instead of alphabetical. Other sort keys keep the generic comparator.
  const POSITION_ORDER: Readonly<Record<string, number>> = {
    GK: 0,
    DEF: 1,
    MID: 2,
    FWD: 3,
  };

  const sorted = $derived.by(() => {
    const allPositions = posFilter.size === 0 || posFilter.size >= 4;
    const filtered = data.players.filter(
      (p) => allPositions || posFilter.has(p.position),
    );
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'position') {
        const ao = POSITION_ORDER[a.position] ?? 99;
        const bo = POSITION_ORDER[b.position] ?? 99;
        return (ao - bo) * dir;
      }
      const av = a[sortKey] as string | number | null;
      const bv = b[sortKey] as string | number | null;
      if (av === null || bv === null) return 0;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = 'desc';
    }
  }

  // Pablo 2026-05-25 individual training: count assigned players to enforce cap.
  const trainingAssignedCount = $derived(
    data.hasPlaythrough ? data.players.filter((p) => p.trainingFocus != null).length : 0,
  );
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Plantilla</h1>
    <p class="opacity-60">
      {data.players.length} jugadores · filtrar por posición
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para gestionar tu plantilla.</span>
    </div>
  {:else}
    <!-- Training intensity button group -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Intensidad de entrenamiento</h2>
        <p class="text-sm opacity-70">
          Aplica a toda la plantilla esta semana. Se activará al pulsar
          <em>Avanzar semana</em>.
        </p>

        {#if form?.ok && form.bucket}
          <div class="alert alert-success py-2 mt-1">
            <span class="text-sm">Cambio guardado: {form.bucket}.</span>
          </div>
        {/if}

        <form
          method="POST"
          action="?/setIntensity"
          use:enhance
          class="mt-2"
          bind:this={intensityFormEl}
        >
          <input type="hidden" name="bucket" bind:value={pendingBucket} />
          <BucketGroup
            options={BUCKETS.map((b) => ({ id: b.id, label: b.label, danger: b.danger }))}
            ariaLabel="Intensidad de entrenamiento"
            bind:value={pendingBucket}
          />
        </form>

        <p class="text-xs opacity-70 mt-2">
          {BUCKETS.find((b) => b.id === currentBucket)?.hint ?? ''}
        </p>
      </div>
    </section>

    {#if data.players.length === 0}
      <div class="alert alert-warning">
        <span>El club no tiene jugadores registrados. Esperando seeding inicial.</span>
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs opacity-70 uppercase">Filtrar por posición</span>
        <div class="join">
          {#each ['GK', 'DEF', 'MID', 'FWD'] as p}
            {@const isActive = posFilter.has(p)}
            <button
              type="button"
              class="join-item btn btn-sm {isActive ? 'btn-primary' : 'btn-outline'}"
              onclick={() => {
                const next = new Set(posFilter);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                posFilter = next;
              }}
            >
              {posLabel(p)}
            </button>
          {/each}
          <button
            type="button"
            class="join-item btn btn-sm btn-ghost"
            onclick={() => (posFilter = new Set())}
          >
            Todas
          </button>
        </div>
        <span class="text-xs opacity-60">
          {sorted.length} jugador{sorted.length === 1 ? '' : 'es'}
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra table-sm">
          <thead>
            <tr class="text-xs">
              <th class="cursor-pointer" onclick={() => toggleSort('lastName')}>Jugador</th>
              <th class="cursor-pointer" onclick={() => toggleSort('position')}>Pos</th>
              <th class="cursor-pointer text-right border-l border-base-300" onclick={() => toggleSort('skill')}>OVR</th>
              <!-- Atributos base -->
              <th class="cursor-pointer text-right" title="Velocidad" onclick={() => toggleSort('velocidad')}>VEL</th>
              <th class="cursor-pointer text-right" title="Resistencia" onclick={() => toggleSort('resistencia')}>RES</th>
              <th class="cursor-pointer text-right" title="Agresividad" onclick={() => toggleSort('agresividad')}>AGR</th>
              <th class="cursor-pointer text-right" title="Calidad" onclick={() => toggleSort('calidad')}>CAL</th>
              <!-- Estado dinámico -->
              <th class="cursor-pointer text-right border-l border-base-300" title="Forma" onclick={() => toggleSort('form')}>FOR</th>
              <th class="cursor-pointer text-right" title="Moral" onclick={() => toggleSort('morale')}>MOR</th>
              <th class="cursor-pointer text-right" title="Fitness" onclick={() => toggleSort('fitness')}>FIT</th>
              <th class="border-l border-base-300" title="Entrenamiento individual">
                Entrena
                {#if data.fitnessCoach}
                  <span class="block text-xs opacity-60 font-normal">
                    {trainingAssignedCount}/{data.trainingCap}
                  </span>
                {/if}
              </th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as p}
              {@const suspended = (p.suspendedMatchesRemaining ?? 0) > 0}
              {@const injured = p.availability === 'injured' || (p.injuredUntilWeek != null && p.injuredUntilWeek > data.currentWeek)}
              {@const yellowsNearLimit = (p.yellowCardsSeason ?? 0) >= 4 && !suspended}
              <tr class="hover cursor-pointer text-sm {suspended || injured ? 'opacity-60 bg-error/5' : ''}" onclick={() => (selected = p)}>
                <td class="font-semibold">
                  <div class="flex items-center gap-2">
                    <Avatar seed={`player:${p.id}:${p.firstName}${p.lastName}`} size={28} />
                    <span class="truncate">{p.firstName} {p.lastName}</span>
                    {#if suspended}
                      <!-- Sprint 13 task 13-1: badge "Suspendido N partidos · Vuelve JX" -->
                      <span
                        class="badge badge-error badge-sm gap-1"
                        title="Sancionado — no puede jugar {p.suspendedMatchesRemaining} partido(s). Vuelve en jornada {data.currentWeek + (p.suspendedMatchesRemaining ?? 0)}."
                      >
                        🚫 {p.suspendedMatchesRemaining}
                      </span>
                    {/if}
                    {#if injured}
                      {@const weeksLeft = (p.injuredUntilWeek ?? 0) - data.currentWeek}
                      <span
                        class="badge badge-warning badge-sm gap-1"
                        title={p.injuredUntilWeek ? `Lesionado · vuelve en jornada ${p.injuredUntilWeek}` : 'Lesionado'}
                      >
                        🤕 {weeksLeft > 0 ? `${weeksLeft}sem` : 'Lesionado'}
                      </span>
                    {/if}
                    {#if yellowsNearLimit && !injured}
                      <span
                        class="badge badge-warning badge-sm gap-1"
                        title="{p.yellowCardsSeason} amarillas esta temporada. A las 5 → 1 partido de sanción."
                      >
                        🟨 {p.yellowCardsSeason}
                      </span>
                    {/if}
                    {#if p.transferListed}
                      <span class="badge badge-success badge-sm gap-1" title="Jugador transferible — abierto a ofertas">
                        💰 Transferible
                      </span>
                    {/if}
                    {#if p.contractEndWeek - data.currentWeek <= 0}
                      <span class="badge badge-error badge-sm" title="Contrato expirado">⛔ Expirado</span>
                    {:else if p.contractEndWeek - data.currentWeek <= 8}
                      <span
                        class="badge badge-warning badge-sm gap-1"
                        title="Contrato termina en {p.contractEndWeek - data.currentWeek} semanas. Considerá renovar."
                      >
                        📝 {p.contractEndWeek - data.currentWeek}sem
                      </span>
                    {/if}
                  </div>
                </td>
                <td><span class="badge badge-outline badge-sm">{posLabel(p.position)}</span></td>
                <td class="text-right font-mono font-bold border-l border-base-300">{p.skill}</td>
                <td class="text-right font-mono opacity-90">{p.velocidad}</td>
                <td class="text-right font-mono opacity-90">{p.resistencia}</td>
                <td class="text-right font-mono opacity-90">{p.agresividad}</td>
                <td class="text-right font-mono opacity-90">{p.calidad}</td>
                <td class="text-right font-mono opacity-70 border-l border-base-300">{p.form}</td>
                <td class="text-right font-mono opacity-70">{p.morale}</td>
                <td class="text-right font-mono opacity-70">{p.fitness}</td>
                <td class="border-l border-base-300" onclick={(e) => e.stopPropagation()}>
                  <form method="POST" action="?/setTrainingFocus" use:enhance>
                    <input type="hidden" name="playerId" value={p.id} />
                    <select
                      name="focus"
                      class="select select-xs select-bordered w-full max-w-[140px]"
                      value={p.trainingFocus ?? ''}
                      disabled={!data.fitnessCoach || (!p.trainingFocus && trainingAssignedCount >= data.trainingCap)}
                      onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
                      title={!data.fitnessCoach ? 'Contrata un preparador físico para activar entrenamientos individuales' : (!p.trainingFocus && trainingAssignedCount >= data.trainingCap ? `Cap ${data.trainingCap} alcanzado` : '')}
                    >
                      <option value="">—</option>
                      <option value="velocidad">🏃 VEL</option>
                      <option value="resistencia">💪 RES</option>
                      <option value="agresividad">🔥 AGR</option>
                      <option value="calidad">⚽ CAL</option>
                    </select>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if selected}
        {@const traits = describeTraits((selected.traits as string[]) ?? [])}
        {@const coreAttrs = [
          { label: 'Velocidad', value: selected.velocidad, hint: 'Pace y contraataques' },
          { label: 'Resistencia', value: selected.resistencia, hint: 'Aguanta el partido' },
          { label: 'Agresividad', value: selected.agresividad, hint: 'Más entradas, más tarjetas' },
          { label: 'Calidad', value: selected.calidad, hint: 'Pase, remate, regate' },
        ]}
        <div class="modal modal-open">
          <div class="modal-box max-w-2xl">
            <div class="flex gap-4 items-center">
              <Avatar seed={`player:${selected.id}:${selected.firstName}${selected.lastName}`} size={88} framed />
              <div class="flex-1">
                <h3 class="font-bold text-lg">{selected.firstName} {selected.lastName}</h3>
                <p class="opacity-60 text-sm">{posLabel(selected.position)} · {selected.nationality}</p>
                <div class="mt-1">
                  <span class="badge badge-primary badge-lg">Overall {selected.skill}</span>
                </div>
              </div>
            </div>

            {#if traits.length > 0}
              <div class="flex flex-wrap gap-2 mt-3">
                {#each traits as t}
                  <div
                    class="badge gap-1
                           {t.tone === 'positive' ? 'badge-success' : t.tone === 'negative' ? 'badge-error' : 'badge-ghost'}"
                    title={t.description}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </div>
                {/each}
              </div>
              <div class="text-xs opacity-60 mt-1">
                {traits.map((t) => t.description).join(' · ')}
              </div>
            {/if}

            <!-- 4 main attributes -->
            <div class="mt-4">
              <div class="text-xs uppercase opacity-60 mb-2">Atributos principales</div>
              <div class="grid grid-cols-2 gap-3">
                {#each coreAttrs as a}
                  <div class="bg-base-200 rounded p-2">
                    <div class="flex justify-between items-baseline">
                      <div class="font-semibold text-sm">{a.label}</div>
                      <div class="font-mono text-lg">{a.value}</div>
                    </div>
                    <progress
                      class="progress {a.value >= 75 ? 'progress-success' : a.value >= 50 ? 'progress-primary' : a.value >= 30 ? 'progress-warning' : 'progress-error'}"
                      value={a.value}
                      max="100"
                    ></progress>
                    <div class="text-xs opacity-50 mt-1">{a.hint}</div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Dynamic state -->
            <div class="mt-4">
              <div class="text-xs uppercase opacity-60 mb-2">Estado</div>
              <div class="grid grid-cols-3 gap-3">
                <div class="text-center">
                  <div class="text-xs opacity-60">Forma</div>
                  <div class="font-mono text-xl">{selected.form}</div>
                </div>
                <div class="text-center">
                  <div class="text-xs opacity-60">Moral</div>
                  <div class="font-mono text-xl">{selected.morale}</div>
                </div>
                <div class="text-center">
                  <div class="text-xs opacity-60">Fitness</div>
                  <div class="font-mono text-xl">{selected.fitness}</div>
                </div>
              </div>
            </div>

            <div class="modal-action flex-wrap gap-2">
              <form method="POST" action="?/toggleSale" use:enhance>
                <input type="hidden" name="playerId" value={selected.id} />
                <input type="hidden" name="listed" value={selected.transferListed ? 'false' : 'true'} />
                <button
                  type="submit"
                  class={selected.transferListed ? 'btn btn-warning' : 'btn btn-success'}
                >
                  {selected.transferListed ? '✗ Quitar transferible' : '💰 Jugador transferible'}
                </button>
              </form>
              <button class="btn" onclick={() => (selected = null)}>Cerrar</button>
            </div>
          </div>
          <div
            class="modal-backdrop"
            role="button"
            tabindex="-1"
            aria-label="Close"
            onclick={() => (selected = null)}
            onkeydown={(e) => e.key === 'Escape' && (selected = null)}
          ></div>
        </div>
      {/if}
    {/if}
  {/if}
</div>

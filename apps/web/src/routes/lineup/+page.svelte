<script lang="ts">
  /**
   * /lineup — manual XI selection.
   *
   * Tabla agrupada por posición. Checkbox por jugador con contador 11/11.
   * Validación cliente-side (1 GK mínimo, máximo 11) + server confirma.
   * Pablo 2026-05-25.
   */
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Initialize from saved lineup.
  let selectedIds: Set<string> = $state(new Set(data.startingLineupIds));
  let formation: string = $state(data.preferredFormation);

  // Position quotas per formation (informational — server validates only XI count + 1 GK).
  const QUOTAS: Record<string, { GK: number; DEF: number; MID: number; FWD: number }> = {
    '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
    '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3 },
    '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
    '5-3-2': { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  };

  function posLabel(p: string): string {
    return p === 'GK' ? 'Portero' : p === 'DEF' ? 'Defensa' : p === 'MID' ? 'Centrocampista' : 'Delantero';
  }

  function isAvailable(p: { suspendedMatchesRemaining: number | null; injuredUntilWeek: number | null }): boolean {
    if ((p.suspendedMatchesRemaining ?? 0) > 0) return false;
    if (p.injuredUntilWeek && data.hasPlaythrough && p.injuredUntilWeek > (data.currentWeek ?? 0)) return false;
    return true;
  }

  type RosterPlayer = (typeof data.players)[number];
  let groups = $derived.by(() => {
    const g: Record<string, RosterPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    if (data.hasPlaythrough) {
      for (const p of data.players) {
        const bucket = g[p.position];
        if (bucket) bucket.push(p);
      }
    }
    return g;
  });

  let selectedCount = $derived(selectedIds.size);
  let gkSelected = $derived(
    data.hasPlaythrough
      ? data.players.filter((p) => p.position === 'GK' && selectedIds.has(p.id)).length
      : 0,
  );
  let counts = $derived.by(() => {
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    if (data.hasPlaythrough) {
      for (const p of data.players) {
        if (selectedIds.has(p.id)) c[p.position as 'GK' | 'DEF' | 'MID' | 'FWD']++;
      }
    }
    return c;
  });
  let quota = $derived(QUOTAS[formation] ?? QUOTAS['4-4-2']);

  let canSave = $derived(selectedCount === 11 && gkSelected >= 1);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 11) next.add(id);
    selectedIds = next;
  }

  function autoFill() {
    // Auto-pick: best 1 GK + DEF/MID/FWD per quota by skill, only available players.
    if (!data.hasPlaythrough) return;
    const next = new Set<string>();
    const q = QUOTAS[formation] ?? QUOTAS['4-4-2'];
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const candidates = data.players
        .filter((p) => p.position === pos && isAvailable(p))
        .sort((a, b) => b.skill - a.skill)
        .slice(0, q[pos]);
      for (const c of candidates) next.add(c.id);
    }
    selectedIds = next;
  }

  function clearAll() {
    selectedIds = new Set();
  }
</script>

<svelte:head>
  <title>XI titular — SMT</title>
</svelte:head>

<div class="container mx-auto p-4 max-w-6xl">
  <header class="mb-6">
    <h1 class="text-3xl font-bold">XI titular</h1>
    <p class="text-base-content/70 mt-1">
      Elegí los 11 que salen de inicio. Los suplentes recuperan condición física más rápido;
      los titulares pierden forma física pero ganan moral si ganan el partido.
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-warning">
      <span>No tienes carrera activa. Vuelve al menú principal y crea un club.</span>
    </div>
  {:else}
    <!-- Status bar -->
    <div class="card bg-base-200 mb-4">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="stat-block text-center">
              <div class="text-3xl font-bold {selectedCount === 11 ? 'text-success' : 'text-warning'}">
                {selectedCount}/11
              </div>
              <div class="text-xs opacity-70">jugadores</div>
            </div>
            <div class="divider divider-horizontal"></div>
            <div class="flex gap-2 text-sm">
              <span class="badge {counts.GK >= 1 ? 'badge-success' : 'badge-error'}">
                GK {counts.GK}/{quota.GK}
              </span>
              <span class="badge badge-outline">
                DEF {counts.DEF}/{quota.DEF}
              </span>
              <span class="badge badge-outline">
                MID {counts.MID}/{quota.MID}
              </span>
              <span class="badge badge-outline">
                FWD {counts.FWD}/{quota.FWD}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-sm font-medium flex items-center gap-2">
              Formación:
              <select bind:value={formation} class="select select-sm select-bordered">
                <option value="4-4-2">4-4-2</option>
                <option value="4-3-3">4-3-3</option>
                <option value="3-5-2">3-5-2</option>
                <option value="5-3-2">5-3-2</option>
              </select>
            </label>

            <button type="button" class="btn btn-sm btn-outline" onclick={autoFill}>
              Auto (mejores por skill)
            </button>
            <button type="button" class="btn btn-sm btn-ghost" onclick={clearAll}>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>

    {#if form && 'error' in form && form.error}
      <div class="alert alert-error mb-4">
        <span>{form.error}</span>
      </div>
    {/if}
    {#if form && 'ok' in form && form.ok && 'count' in form}
      <div class="alert alert-success mb-4">
        <span>XI guardado ({form.count} jugadores · {form.formation}).</span>
      </div>
    {/if}
    {#if form && 'ok' in form && form.ok && 'cleared' in form}
      <div class="alert alert-info mb-4">
        <span>XI manual eliminado. Se usará el auto-pick por skill.</span>
      </div>
    {/if}

    <!-- Roster grouped by position -->
    <form method="POST" action="?/save" use:enhance class="space-y-4">
      <input type="hidden" name="formation" value={formation} />

      {#each ['GK', 'DEF', 'MID', 'FWD'] as pos (pos)}
        {@const list = groups[pos] ?? []}
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <h2 class="card-title text-lg flex items-center gap-2">
              <span>{posLabel(pos)}</span>
              <span class="badge badge-outline badge-sm">{list.length}</span>
              <span class="text-sm opacity-60 ml-2">recomendado: {quota[pos as 'GK' | 'DEF' | 'MID' | 'FWD']}</span>
            </h2>
            {#if list.length === 0}
              <p class="text-sm opacity-50 italic">No hay jugadores en esta posición.</p>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th class="w-12">XI</th>
                      <th>Nombre</th>
                      <th class="text-right">Skill</th>
                      <th class="text-right">Fit</th>
                      <th class="text-right">Mor</th>
                      <th class="text-right">For</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each list as p (p.id)}
                      {@const checked = selectedIds.has(p.id)}
                      {@const avail = isAvailable(p)}
                      <tr class={checked ? 'bg-success/10' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            class="checkbox checkbox-sm checkbox-success"
                            {checked}
                            disabled={!avail || (!checked && selectedCount >= 11)}
                            onchange={() => toggle(p.id)}
                          />
                          {#if checked}
                            <input type="hidden" name="starterIds" value={p.id} />
                          {/if}
                        </td>
                        <td>
                          <div class="font-medium">{p.firstName} {p.lastName}</div>
                        </td>
                        <td class="text-right font-mono font-bold">{p.skill}</td>
                        <td class="text-right font-mono opacity-80">{p.fitness}</td>
                        <td class="text-right font-mono opacity-80">{p.morale}</td>
                        <td class="text-right font-mono opacity-80">{p.form}</td>
                        <td>
                          {#if (p.suspendedMatchesRemaining ?? 0) > 0}
                            <span class="badge badge-error badge-sm">Sancionado</span>
                          {:else if p.injuredUntilWeek && data.currentWeek && p.injuredUntilWeek > data.currentWeek}
                            <span class="badge badge-warning badge-sm">Lesionado</span>
                          {:else}
                            <span class="badge badge-success badge-sm">Disponible</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      <div class="flex justify-end gap-2 sticky bottom-4 bg-base-100/95 p-4 rounded-lg shadow-lg border border-base-300 backdrop-blur">
        <button
          type="submit"
          formaction="?/clear"
          class="btn btn-ghost"
        >
          Volver a auto-pick
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          disabled={!canSave}
        >
          Guardar XI ({selectedCount}/11)
        </button>
      </div>
    </form>
  {/if}
</div>

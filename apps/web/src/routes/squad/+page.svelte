<!--
  Squad panel — wired to apps/web/src/routes/squad/+page.server.ts.

  Story: HUD-UI-003
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  type SortKey = 'lastName' | 'position' | 'skill' | 'form' | 'morale' | 'fitness';
  let sortKey = $state<SortKey>('skill');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let filterPos = $state<'all' | 'GK' | 'DEF' | 'MID' | 'FWD'>('all');
  let selected = $state<(typeof data.players)[number] | null>(null);

  const sorted = $derived.by(() => {
    const filtered = data.players.filter(
      (p) => filterPos === 'all' || p.position === filterPos,
    );
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
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
  {:else if data.players.length === 0}
    <div class="alert alert-warning">
      <span>El club no tiene jugadores registrados. Esperando seeding inicial.</span>
    </div>
  {:else}
    <div class="flex flex-wrap gap-2">
      <select class="select select-bordered select-sm" bind:value={filterPos}>
        <option value="all">Todas posiciones</option>
        <option value="GK">Porteros</option>
        <option value="DEF">Defensas</option>
        <option value="MID">Mediocentros</option>
        <option value="FWD">Delanteros</option>
      </select>
    </div>

    <div class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th class="cursor-pointer" onclick={() => toggleSort('lastName')}>Nombre</th>
            <th class="cursor-pointer" onclick={() => toggleSort('position')}>Pos</th>
            <th class="cursor-pointer text-right" onclick={() => toggleSort('skill')}>Skill</th>
            <th class="cursor-pointer text-right" onclick={() => toggleSort('form')}>Forma</th>
            <th class="cursor-pointer text-right" onclick={() => toggleSort('morale')}>Moral</th>
            <th class="cursor-pointer text-right" onclick={() => toggleSort('fitness')}>Fitness</th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as p}
            <tr class="hover cursor-pointer" onclick={() => (selected = p)}>
              <td class="font-semibold">{p.firstName} {p.lastName}</td>
              <td><span class="badge badge-outline">{p.position}</span></td>
              <td class="text-right font-mono">{p.skill}</td>
              <td class="text-right font-mono">{p.form}</td>
              <td class="text-right font-mono">{p.morale}</td>
              <td class="text-right font-mono">{p.fitness}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if selected}
      <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
          <h3 class="font-bold text-lg">{selected.firstName} {selected.lastName}</h3>
          <p class="opacity-60 text-sm">{selected.position} · {selected.nationality}</p>

          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div class="text-xs opacity-60">Skill</div>
              <div class="font-mono text-2xl">{selected.skill}</div>
            </div>
            <div>
              <div class="text-xs opacity-60">Forma</div>
              <div class="font-mono text-2xl">{selected.form}</div>
            </div>
            <div>
              <div class="text-xs opacity-60">Moral</div>
              <div class="font-mono text-2xl">{selected.morale}</div>
            </div>
            <div>
              <div class="text-xs opacity-60">Fitness</div>
              <div class="font-mono text-2xl">{selected.fitness}</div>
            </div>
          </div>

          <div class="modal-action">
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
</div>

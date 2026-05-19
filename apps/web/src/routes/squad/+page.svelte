<!--
  Squad panel — sortable table (25 players) + per-player detail modal.

  Story: HUD-UI-003
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  interface PlayerRow {
    id: string;
    name: string;
    position: 'GK' | 'DEF' | 'MID' | 'FWD';
    skill: number;
    form: number;
    morale: number;
    fitness: number;
    availability: 'available' | 'injured' | 'suspended';
    salaryEurK: number;
    contractEndWeek: number;
    currentWeek: number;
    recentRatings: number[];
  }

  // Sample data — real load via $lib/api or page load.
  const players: PlayerRow[] = [
    { id: '1', name: 'D. Reyes',     position: 'GK',  skill: 72, form: 68, morale: 70, fitness: 90, availability: 'available', salaryEurK: 4, contractEndWeek: 60, currentWeek: 8, recentRatings: [70, 72, 68, 75, 70] },
    { id: '2', name: 'C. Marín',     position: 'DEF', skill: 70, form: 65, morale: 60, fitness: 85, availability: 'available', salaryEurK: 3, contractEndWeek: 14, currentWeek: 8, recentRatings: [70, 60, 65, 70, 65] },
    { id: '3', name: 'M. Iglesias',  position: 'DEF', skill: 68, form: 70, morale: 80, fitness: 88, availability: 'injured',   salaryEurK: 3, contractEndWeek: 110, currentWeek: 8, recentRatings: [72, 70, 70, 68, 70] },
    { id: '4', name: 'A. Romero',    position: 'MID', skill: 75, form: 78, morale: 75, fitness: 92, availability: 'available', salaryEurK: 5, contractEndWeek: 105, currentWeek: 8, recentRatings: [78, 80, 75, 78, 80] },
    { id: '5', name: 'P. Jiménez',   position: 'FWD', skill: 78, form: 82, morale: 88, fitness: 90, availability: 'available', salaryEurK: 6, contractEndWeek: 55, currentWeek: 8, recentRatings: [82, 85, 80, 82, 85] },
  ];

  type SortKey = 'name' | 'position' | 'skill' | 'form' | 'morale' | 'fitness' | 'salaryEurK';
  let sortKey = $state<SortKey>('skill');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let filterPos = $state<'all' | 'GK' | 'DEF' | 'MID' | 'FWD'>('all');
  let filterAvail = $state<'all' | 'available' | 'injured' | 'suspended'>('all');
  let selected = $state<PlayerRow | null>(null);

  const sorted = $derived.by(() => {
    const filtered = players.filter(
      (p) =>
        (filterPos === 'all' || p.position === filterPos) &&
        (filterAvail === 'all' || p.availability === filterAvail),
    );
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
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

  function availabilityBadge(a: PlayerRow['availability']): string {
    if (a === 'available') return 'badge-success';
    if (a === 'injured') return 'badge-error';
    return 'badge-warning';
  }

  function contractRenewalWarning(p: PlayerRow): boolean {
    return p.contractEndWeek - p.currentWeek <= 8;
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Plantilla</h1>
    <p class="opacity-60">25 jugadores · filtrar por posición o estado</p>
  </header>

  <!-- Filters -->
  <div class="flex flex-wrap gap-2">
    <select class="select select-bordered select-sm" bind:value={filterPos}>
      <option value="all">Todas posiciones</option>
      <option value="GK">Porteros</option>
      <option value="DEF">Defensas</option>
      <option value="MID">Mediocentros</option>
      <option value="FWD">Delanteros</option>
    </select>
    <select class="select select-bordered select-sm" bind:value={filterAvail}>
      <option value="all">Todos los estados</option>
      <option value="available">Disponibles</option>
      <option value="injured">Lesionados</option>
      <option value="suspended">Suspendidos</option>
    </select>
  </div>

  <!-- Table -->
  <div class="overflow-x-auto">
    <table class="table table-zebra">
      <thead>
        <tr>
          <th class="cursor-pointer" onclick={() => toggleSort('name')}>Nombre</th>
          <th class="cursor-pointer" onclick={() => toggleSort('position')}>Pos</th>
          <th class="cursor-pointer text-right" onclick={() => toggleSort('skill')}>Skill</th>
          <th class="cursor-pointer text-right" onclick={() => toggleSort('form')}>Forma</th>
          <th class="cursor-pointer text-right" onclick={() => toggleSort('morale')}>Moral</th>
          <th class="cursor-pointer text-right" onclick={() => toggleSort('fitness')}>Fitness</th>
          <th>Estado</th>
          <th class="cursor-pointer text-right" onclick={() => toggleSort('salaryEurK')}>Salario</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as p}
          <tr class="hover cursor-pointer" onclick={() => (selected = p)}>
            <td class="font-semibold">{p.name}</td>
            <td><span class="badge badge-outline">{p.position}</span></td>
            <td class="text-right font-mono">{p.skill}</td>
            <td class="text-right font-mono">{p.form}</td>
            <td class="text-right font-mono">{p.morale}</td>
            <td class="text-right font-mono">{p.fitness}</td>
            <td>
              <span class="badge {availabilityBadge(p.availability)}">{p.availability}</span>
              {#if contractRenewalWarning(p)}
                <span class="badge badge-warning ml-1">Renovación</span>
              {/if}
            </td>
            <td class="text-right font-mono">{p.salaryEurK} €K</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Player detail modal -->
  {#if selected}
    <div class="modal modal-open">
      <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg">{selected.name}</h3>
        <p class="opacity-60 text-sm">{selected.position} · {selected.availability}</p>

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

        <div class="mt-4">
          <div class="text-xs opacity-60 mb-1">Últimos 5 partidos</div>
          <div class="flex gap-1 items-end h-12">
            {#each selected.recentRatings as r}
              <div
                class="flex-1 bg-primary opacity-70 rounded-t"
                style="height: {(r / 100) * 100}%"
                title={String(r)}
              ></div>
            {/each}
          </div>
        </div>

        <div class="mt-4 text-sm opacity-70">
          <div>Salario: <span class="font-mono">{selected.salaryEurK} €K/sem</span></div>
          <div>
            Contrato hasta semana <span class="font-mono">{selected.contractEndWeek}</span>
            {#if contractRenewalWarning(selected)}
              <span class="badge badge-warning ml-1">≤ 8 semanas</span>
            {/if}
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
</div>

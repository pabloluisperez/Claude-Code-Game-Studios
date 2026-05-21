<!--
  /stadium — close-up del estadio con UI de reformas (v1.1 Sprint 22+).

  Pablo decision 2026-05-21: la sección Estadio muestra el edificio en grande.
  El catálogo concreto de reformas (capacity upgrade, pitch upgrade, training
  facility, etc.) se especifica en `design/gdd/stadium-upgrades.md` (TBD
  Sprint 23) y se renderiza aquí como cards de compra.

  Para v1.1 launch sólo mostramos:
    - Métricas actuales del estadio (capacidad, césped, infrastructure)
    - Vista placeholder grande del estadio (centered)
    - Lista de reformas posibles (UI lock — disabled hasta que el sistema
      de upgrades esté implementado server-side)
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function tierLabel(t: 1 | 2 | 3 | 4): string {
    return ['', 'Pueblo Olvidado', 'Club Emergente', 'Club Establecido', 'Imperio Local'][t];
  }

  function pitchLabel(p: string): string {
    return {
      dry: 'Tierra seca',
      patchy: 'Parches de césped',
      healthy: 'Césped completo',
      pristine: 'Césped premium',
    }[p] ?? p;
  }

  // Placeholder catalog — replaced by stadium-upgrades.md schema in Sprint 23.
  const upgrades = [
    {
      id: 'pitch-upgrade',
      icon: '🌱',
      title: 'Mejorar el césped',
      description: 'Aumenta infrastructure_level +10. El estado del campo influye en partidos en casa.',
      cost: 75_000,
      enabled: false,
    },
    {
      id: 'stand-upgrade',
      icon: '🏟',
      title: 'Ampliar gradas',
      description: 'Aumenta capacidad +50%. Más ingresos por entradas en partidos llenos.',
      cost: 250_000,
      enabled: false,
    },
    {
      id: 'training-facility',
      icon: '💪',
      title: 'Centro de entrenamiento',
      description: 'Mejora el desarrollo de jugadores jóvenes y la recuperación física tras partidos.',
      cost: 180_000,
      enabled: false,
    },
    {
      id: 'youth-academy',
      icon: '🎓',
      title: 'Cantera juvenil',
      description: 'Aumenta la probabilidad de producir un canterano cada temporada.',
      cost: 200_000,
      enabled: false,
    },
    {
      id: 'lighting',
      icon: '💡',
      title: 'Iluminación nocturna',
      description: 'Permite jugar partidos nocturnos. Ingreso TV ligeramente mayor.',
      cost: 120_000,
      enabled: false,
    },
  ];

  function formatEur(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} M€`;
    if (amount >= 1_000) return `${Math.round(amount / 1_000)} k€`;
    return `${amount} €`;
  }
</script>

<svelte:head>
  <title>Estadio · Total Soccer Manager</title>
</svelte:head>

<article class="max-w-5xl mx-auto py-6">
  <header class="flex items-baseline justify-between flex-wrap gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-bold">Estadio de {data.club?.name ?? 'mi club'}</h1>
      {#if data.stadium}
        <p class="opacity-70 text-sm">
          Tier {data.stadium.tier} — {tierLabel(data.stadium.tier)} · Capacidad
          <span class="font-mono">{data.stadium.capacity.toLocaleString('es-ES')}</span>
        </p>
      {/if}
    </div>
    <a href="/city" class="btn btn-ghost btn-sm">
      🗺 Ver ciudad completa
    </a>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      No tienes una carrera activa. <a href="/game" class="link">Crea una</a> para ver el estadio.
    </div>
  {:else if data.stadium}
    <!-- Stadium hero card -->
    <section class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Capacidad</h2>
            <p class="text-2xl font-bold font-mono">
              {data.stadium.capacity.toLocaleString('es-ES')}
            </p>
            <p class="text-xs opacity-50">asientos</p>
          </div>
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Estado del campo</h2>
            <p class="text-lg font-semibold">{pitchLabel(data.stadium.pitchSurface)}</p>
            <p class="text-xs opacity-50">
              Infrastructure level: <span class="font-mono">{data.stadium.infrastructureLevel}/100</span>
            </p>
          </div>
          <div>
            <h2 class="text-sm uppercase opacity-60 mb-1">Presupuesto disponible</h2>
            <p class="text-2xl font-bold font-mono">{formatEur(data.stadium.budget)}</p>
            <p class="text-xs opacity-50">para reformas</p>
          </div>
        </div>

        <!-- Placeholder visual del estadio en grande -->
        <div class="mt-6 rounded bg-gradient-to-b from-base-200 to-base-300 p-12 text-center">
          <div class="text-9xl mb-2" aria-hidden="true">🏟</div>
          <p class="text-sm opacity-60">
            Vista isométrica del estadio en grande (Sprint 23 — placeholder).
            <br />
            Aquí se renderizará el close-up con el modelo completo de tu estadio.
          </p>
        </div>
      </div>
    </section>

    <!-- Reformas catalog -->
    <section aria-labelledby="upgrades-h">
      <h2 id="upgrades-h" class="text-xl font-bold mb-3">Reformas disponibles</h2>
      <p class="text-sm opacity-70 mb-4">
        Cada reforma cuesta tiempo y dinero. El sistema completo se desbloquea en
        próximas versiones. Por ahora puedes ver el catálogo.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each upgrades as upgrade (upgrade.id)}
          <article class="card bg-base-100 shadow border border-base-300">
            <div class="card-body">
              <div class="flex items-start gap-3">
                <span class="text-3xl" aria-hidden="true">{upgrade.icon}</span>
                <div class="flex-1">
                  <h3 class="card-title text-base">{upgrade.title}</h3>
                  <p class="text-sm opacity-80 mt-1">{upgrade.description}</p>
                </div>
              </div>
              <div class="card-actions justify-between items-center mt-4">
                <span class="font-mono text-sm">{formatEur(upgrade.cost)}</span>
                <button
                  class="btn btn-primary btn-sm"
                  disabled={!upgrade.enabled || data.stadium.budget < upgrade.cost}
                  aria-disabled={!upgrade.enabled || data.stadium.budget < upgrade.cost}
                  title={!upgrade.enabled ? 'Próximamente — Sprint 23' : ''}
                >
                  {upgrade.enabled ? 'Comprar' : 'Próximamente'}
                </button>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</article>

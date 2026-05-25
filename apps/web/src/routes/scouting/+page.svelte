<!--
  /scouting — v1.1 minimal slice.
  Story SCOUTING-MARKET-004 (combined service + UI for v1.1 viable cut).

  Renders the visible player pool with per-row scout / deep-scout actions.
  Offer/auction flow deferred to v1.2+.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const POSITION_LABELS: Record<string, string> = {
    GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL',
  };

  const TIER_LABEL: Record<0 | 1 | 2 | 3, string> = {
    0: 'Sin info',
    1: 'Básico',
    2: 'Estimado',
    3: 'Detallado',
  };

  function tierBadge(t: 0 | 1 | 2 | 3): string {
    return t >= 3 ? 'badge-success' : t === 2 ? 'badge-info' : t === 1 ? 'badge-warning' : 'badge-ghost';
  }
</script>

<svelte:head>
  <title>Scouting · Total Soccer Manager</title>
</svelte:head>

<article class="max-w-6xl mx-auto py-6 space-y-4">
  <header>
    <h1 class="text-2xl font-bold">Mercado de Fichajes</h1>
    <p class="opacity-70 text-sm">
      Paga para descubrir información sobre jugadores. Cuanto más profundo el
      reporte, más fiable la valoración. Los fichajes llegan en v1.2 — esta
      es la primera entrega visible.
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      Necesitas una carrera activa para ver el mercado.
    </div>
  {:else if data.pool.length === 0}
    <div class="alert alert-info">
      El pool está vacío todavía. Espera a la próxima ventana o sube tu
      <em>scouting_network_level</em> con un Director de Scouting.
    </div>
  {:else}
    {#if form?.action === 'scout' && 'actionId' in form}
      {@const f = form as unknown as { costPaid?: number }}
      <div class="alert alert-success">
        Scouting completado — se cobraron <span class="font-mono">{f.costPaid ?? 0} k€</span>.
      </div>
    {/if}
    {#if form?.action === 'scout' && form.error}
      <div class="alert alert-error">
        Error: <span class="font-mono">{String(form.error)}</span>
      </div>
    {/if}

    <p class="text-xs opacity-60">{data.pool.length} jugadores visibles · click "Scout" para revelar más.</p>

    <div class="overflow-x-auto">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos.</th>
            <th>Club</th>
            <th>Info</th>
            <th class="text-right">Datos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.pool as p (p.id)}
            <tr>
              <td class="font-semibold">{p.name}</td>
              <td>{POSITION_LABELS[p.position] ?? p.position}</td>
              <td class="opacity-70">{p.clubName ?? '—'}</td>
              <td>
                <span class="badge badge-sm {tierBadge(p.visibilityTier)}">{TIER_LABEL[p.visibilityTier]}</span>
              </td>
              <td class="text-right text-xs font-mono">
                {#if p.visibilityTier >= 3}
                  OVR <strong>{p.ovrExact}</strong> · {p.transferValueExact} k€ · forma {p.recentForm}
                {:else if p.visibilityTier >= 2}
                  OVR ~{p.ovrEstimate} · ~{p.transferValueEstimate} k€ · ánimo {p.moraleBand}
                {:else if p.visibilityTier >= 1}
                  OVR {p.ovrBand}
                {:else}
                  —
                {/if}
              </td>
              <td>
                <div class="flex gap-1">
                  {#if p.visibilityTier < 2}
                    <form method="POST" action="?/scout" use:enhance>
                      <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="actionType" value="scout" />
                      <button type="submit" class="btn btn-xs btn-outline">Scout (5 k€)</button>
                    </form>
                  {/if}
                  {#if p.visibilityTier < 3}
                    <form method="POST" action="?/scout" use:enhance>
                      <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="actionType" value="deep_scout" />
                      <button type="submit" class="btn btn-xs btn-primary">Deep (15 k€)</button>
                    </form>
                  {/if}
                  {#if p.visibilityTier === 3}
                    <span class="text-xs opacity-50 italic">completo</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="text-center text-xs opacity-50 mt-6 italic">
      v1.1: solo scout actions. Las ofertas + AI club rotation llegan en v1.2.
    </p>
  {/if}
</article>

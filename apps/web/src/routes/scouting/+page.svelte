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

  // Offer modal state
  let offerPlayerId = $state<string | null>(null);
  let offerFee = $state(0);
  let offerWage = $state(5);
  let offerContractWeeks = $state(52);

  function closeOffer(): void {
    offerPlayerId = null;
  }

  $effect(() => {
    if (form?.action === 'offer' && 'kind' in (form ?? {})) {
      // Close modal on response
      offerPlayerId = null;
    }
  });

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
    {#if form?.action === 'offer' && 'kind' in (form ?? {})}
      {@const f = form as unknown as { kind: string; counterOfferEurK?: number; reason?: string; feeEurK?: number; finalWageEurKWeek?: number }}
      {#if f.kind === 'accepted'}
        <div class="alert alert-success">
          ✅ Oferta aceptada — fee {f.feeEurK ?? 0} k€ + sueldo {f.finalWageEurKWeek ?? 0} k€/sem
        </div>
      {:else if f.kind === 'counter'}
        <div class="alert alert-warning">
          🤝 Contraoferta del club vendedor: <span class="font-mono">{f.counterOfferEurK} k€</span>. Hace una nueva oferta si te interesa.
        </div>
      {:else if f.kind === 'rejected'}
        <div class="alert alert-error">
          ❌ Oferta rechazada ({f.reason === 'wage_low' ? 'el jugador pidió más sueldo' : 'lejos del valor de mercado'})
        </div>
      {/if}
    {/if}
    {#if form?.action === 'offer' && form.error && !('kind' in (form ?? {}))}
      <div class="alert alert-error">
        Error en oferta: <span class="font-mono">{String(form.error)}</span>
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
                <div class="flex gap-1 items-center">
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
                  <button
                    type="button"
                    class="btn btn-xs btn-success"
                    onclick={() => { offerPlayerId = p.id; offerFee = p.transferValueEstimate ?? p.transferValueExact ?? 100; offerWage = 5; }}
                  >
                    Ofertar
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="text-center text-xs opacity-50 mt-6 italic">
      v1.2: ofertas con F2 (free agent) + F3 (AI auction). Counter-offer cycle iterativo en v1.3.
    </p>
  {/if}

  <!-- Offer modal -->
  {#if offerPlayerId}
    {@const p = data.pool.find((x) => x.id === offerPlayerId)}
    {#if p}
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div class="card bg-base-100 shadow-xl max-w-md w-full">
          <div class="card-body">
            <h3 class="card-title">Hacer oferta por {p.name}</h3>
            <p class="text-xs opacity-70">{p.position} · {p.clubName ?? 'agente libre'}</p>
            <form method="POST" action="?/offer" use:enhance>
              <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
              <input type="hidden" name="playerId" value={p.id} />

              {#if p.contractStatus !== 'free_agent'}
                <label class="form-control w-full mt-3">
                  <span class="label-text">Fee (k€)</span>
                  <input type="number" name="feeEurK" bind:value={offerFee} min="0" class="input input-bordered input-sm" />
                </label>
              {:else}
                <input type="hidden" name="feeEurK" value="0" />
                <p class="text-xs mt-2 italic">Agente libre — no se paga fee, sólo sueldo.</p>
              {/if}

              <label class="form-control w-full mt-2">
                <span class="label-text">Sueldo semanal (k€)</span>
                <input type="number" name="wageOfferEurKWeek" bind:value={offerWage} min="0" class="input input-bordered input-sm" />
              </label>

              <label class="form-control w-full mt-2">
                <span class="label-text">Duración contrato (semanas)</span>
                <input type="number" name="contractWeeks" bind:value={offerContractWeeks} min="1" max="260" class="input input-bordered input-sm" />
              </label>

              <p class="text-xs opacity-60 mt-2">
                Compromiso total: <span class="font-mono">{offerFee + offerWage * offerContractWeeks} k€</span>
              </p>

              <div class="card-actions justify-end mt-4">
                <button type="button" class="btn btn-ghost" onclick={closeOffer}>Cancelar</button>
                <button type="submit" class="btn btn-success">Enviar oferta</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</article>

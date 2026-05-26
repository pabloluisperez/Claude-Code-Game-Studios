<script lang="ts">
  /**
   * /clubs/[clubId] — vista del roster de otro club.
   * Pablo 2026-05-26: 'poder ver otros equipos y sus jugadores, incluso
   * hacerles ofertas suculentas aunque no estén en venta'.
   */
  import { enhance } from '$app/forms';
  import Avatar from '$lib/components/avatar.svelte';
  import ClubShield from '$lib/components/club-shield.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Offer modal state
  let offerPlayerId = $state<string | null>(null);
  let offerFee = $state(50);
  let offerWage = $state(5);
  let offerContractWeeks = $state(52);

  // Outcome toast
  let toast = $state<{ kind: string; msg: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function showToast(kind: string, msg: string): void {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { kind, msg };
    toastTimer = setTimeout(() => { toast = null; }, 4500);
  }

  function posLabel(p: string): string {
    return p === 'GK' ? 'POR' : p === 'DEF' ? 'DEF' : p === 'MID' ? 'MED' : 'DEL';
  }

  function divisionLabel(d: string): string {
    return {
      fifth: 'Quinta',
      fourth: 'Cuarta',
      third: 'Tercera',
      second: 'Segunda',
      first: 'Primera',
    }[d] ?? d;
  }

  type RosterEntry = Extract<PageData, { hasPlaythrough: true }>['roster'][number];
  function openOffer(p: RosterEntry) {
    if (!data.hasPlaythrough || data.isOwnClub) return;
    offerPlayerId = p.id;
    // Suggest sensible defaults: 80 €K fee for not-listed, 30 €K for listed.
    offerFee = p.transferListed ? 30 : 80;
    offerWage = 5;
    offerContractWeeks = 52;
  }
</script>

<svelte:head>
  <title>{data.hasPlaythrough && data.club ? data.club.name : 'Club'} · Total Soccer Manager</title>
</svelte:head>

<div class="container mx-auto p-4 max-w-5xl">
  {#if !data.hasPlaythrough}
    <div class="alert alert-info">No hay carrera activa.</div>
  {:else if data.club}
    <!-- Header -->
    <header class="card bg-base-200 mb-4">
      <div class="card-body p-4 flex flex-row items-center gap-4">
        <div class="flex-shrink-0">
          <ClubShield
            name={data.club.name}
            primaryColor={data.club.kitPrimaryColor}
            secondaryColor={data.club.kitSecondaryColor}
            size={64}
          />
        </div>
        <div class="flex-1">
          <h1 class="text-2xl font-bold">{data.club.name}</h1>
          <p class="text-sm opacity-70">
            {data.club.city} · {divisionLabel(data.club.division)} División ·
            Prestigio <span class="font-mono">{data.club.prestige}</span> ·
            Ciudad tier <span class="font-mono">{data.club.cityTier}</span>
          </p>
          {#if data.isOwnClub}
            <span class="badge badge-primary mt-2">Tu club</span>
          {/if}
        </div>
      </div>
    </header>

    <!-- Roster table -->
    <section class="card bg-base-100 shadow">
      <div class="card-body p-4">
        <h2 class="card-title text-lg mb-3">
          Plantilla
          {#if !data.isOwnClub}
            <span class="badge badge-ghost badge-sm">📊 vista parcial</span>
          {/if}
        </h2>

        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="text-xs">
                <th>Jugador</th>
                <th>Pos</th>
                <th class="text-right">Edad</th>
                <th class="text-right">Skill / Banda</th>
                <th class="text-right">Contrato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each data.roster as p (p.id)}
                <tr class="hover">
                  <td>
                    <div class="flex items-center gap-2">
                      <Avatar seed={`player:${p.id}:${p.firstName}${p.lastName}`} size={28} />
                      <span class="font-medium">{p.firstName} {p.lastName}</span>
                      {#if p.transferListed}
                        <span class="badge badge-success badge-sm">💰 Transferible</span>
                      {/if}
                    </div>
                  </td>
                  <td><span class="badge badge-outline badge-sm">{posLabel(p.position)}</span></td>
                  <td class="text-right font-mono">{p.age}</td>
                  <td class="text-right font-mono">
                    {#if p.skill !== null}
                      <span class="font-bold">{p.skill}</span>
                    {:else}
                      <span class="opacity-70">{p.skillBand}</span>
                    {/if}
                  </td>
                  <td class="text-right font-mono text-xs">
                    {#if p.contractEndWeek - data.currentWeek > 0}
                      {p.contractEndWeek - data.currentWeek}sem
                    {:else}
                      <span class="text-error">expirado</span>
                    {/if}
                  </td>
                  <td>
                    {#if !data.isOwnClub}
                      {@const isOpenMarket = p.contractStatus === 'free_agent' || (p.contractEndWeek - data.currentWeek <= 8)}
                      {@const canOffer = isOpenMarket || (data.scoutTier ?? 0) > 0}
                      <button
                        type="button"
                        class="btn btn-xs {canOffer ? 'btn-primary' : 'btn-disabled'}"
                        onclick={() => canOffer && openOffer(p)}
                        disabled={!canOffer}
                        title={!canOffer ? 'Necesitas un Director de Scouting para ofertar a jugadores de otros clubes' : ''}
                      >
                        💸 Ofertar
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if !data.isOwnClub}
          <p class="text-xs opacity-60 mt-3 italic">
            Skill exacto y salario ocultos. Para ver datos detallados, hacé scouting desde /scouting.
            {#if (data.scoutTier ?? 0) > 0}
              Tu Director de Scouting (tier {data.scoutTier}) consigue {data.scoutTier === 3 ? '~15%' : data.scoutTier === 2 ? '~8%' : '0%'} de descuento sobre lo que pide el club.
            {:else}
              ⚠️ Sin Director de Scouting no podés ofertar por jugadores con contrato activo de otros clubes — solo agentes libres y jugadores en últimos 8 sem de contrato.
            {/if}
          </p>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Toast -->
  {#if toast}
    <div class="toast toast-end z-50">
      <div class="alert alert-{toast.kind}">
        <span>{toast.msg}</span>
      </div>
    </div>
  {/if}

  <!-- Offer modal -->
  {#if offerPlayerId && data.hasPlaythrough}
    {@const p = data.roster.find((x) => x.id === offerPlayerId)}
    {#if p}
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div class="card bg-base-100 shadow-xl max-w-md w-full">
          <div class="card-body">
            <h3 class="card-title">Ofertar por {p.firstName} {p.lastName}</h3>
            <p class="text-xs opacity-70">
              {posLabel(p.position)} · {p.age} años
              {#if p.transferListed}
                <span class="badge badge-success badge-sm ml-2">💰 Transferible</span>
              {:else}
                <span class="badge badge-warning badge-sm ml-2">⚠️ No transferible (oferta suculenta)</span>
              {/if}
            </p>

            <form
              method="POST"
              action="?/offer"
              use:enhance={() => {
                return async ({ update, result }) => {
                  await update({ reset: false });
                  if (result.type === 'success') {
                    const body = (result.data ?? {}) as { kind?: string; counterOfferEurK?: number; reason?: string; feeEurK?: number; finalWageEurKWeek?: number };
                    if (body.kind === 'accepted') {
                      showToast('success', `✅ Oferta aceptada — fee ${body.feeEurK ?? 0} k€ + sueldo ${body.finalWageEurKWeek ?? 0} k€/sem`);
                    } else if (body.kind === 'counter') {
                      showToast('warning', `🤝 Contraoferta: ${body.counterOfferEurK} k€`);
                    } else if (body.kind === 'rejected') {
                      showToast('error', `❌ Oferta rechazada (${body.reason === 'wage_low' ? 'sueldo bajo' : 'lejos del valor de mercado'})`);
                    } else {
                      showToast('info', 'Oferta enviada.');
                    }
                    offerPlayerId = null;
                  } else if (result.type === 'failure') {
                    const err = (result.data as { error?: string })?.error ?? 'desconocido';
                    showToast('error', `Error al enviar oferta: ${err}`);
                  }
                };
              }}
            >
              <input type="hidden" name="playerId" value={p.id} />

              <label class="form-control w-full mt-3">
                <span class="label-text">Fee (k€)</span>
                <input type="number" name="feeEurK" bind:value={offerFee} min="0" class="input input-bordered input-sm" />
              </label>

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
                · Buffer requerido: <span class="font-mono">{offerFee + offerWage * 4} k€</span>
              </p>

              <div class="card-actions justify-end mt-4">
                <button type="button" class="btn btn-ghost" onclick={() => (offerPlayerId = null)}>
                  Cancelar
                </button>
                <button type="submit" class="btn btn-success">Enviar oferta</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

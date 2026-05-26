<!--
  /scouting — v1.2 (Sprint 25-26).
  Player pool with tier visibility + scout/deep-scout actions + offer flow +
  client filters + sortable columns + comparator modal on player-name click
  + incoming offers panel for transfer-listed players.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import Avatar from '$lib/components/avatar.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // ── Offer modal state ──────────────────────────────────────────────────
  let offerPlayerId = $state<string | null>(null);
  let offerFee = $state(0);
  let offerWage = $state(5);
  let offerContractWeeks = $state(52);

  // ── Compare modal state ────────────────────────────────────────────────
  let comparePlayerId = $state<string | null>(null);
  const comparePlayer = $derived(comparePlayerId ? data.pool.find((p) => p.id === comparePlayerId) ?? null : null);
  const sameRosterPlayers = $derived(
    comparePlayer
      ? (data.ownRoster ?? [])
          .filter((p) => p.position === comparePlayer.position)
          .sort((a, b) => b.skill - a.skill)
      : [],
  );

  // ── Filter / search state ──────────────────────────────────────────────
  let searchTerm = $state('');
  let filterPosition = $state<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD'>('ALL');
  let filterTier = $state<'ALL' | '0' | '1' | '2' | '3'>('ALL');
  let filterContract = $state<'ALL' | 'in_contract' | 'expiring' | 'free_agent'>('ALL');

  // ── Sort state ─────────────────────────────────────────────────────────
  type SortKey = 'name' | 'position' | 'club' | 'tier' | 'ovr' | 'value';
  let sortKey = $state<SortKey>('tier');
  let sortDir = $state<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
  }
  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  function ovrOf(p: { ovrExact?: number; ovrEstimate?: number; ovrBand?: string }): number {
    if (p.ovrExact !== undefined) return p.ovrExact;
    if (p.ovrEstimate !== undefined) return p.ovrEstimate;
    if (p.ovrBand) {
      const lo = parseInt(p.ovrBand.split('-')[0] ?? '0', 10);
      return lo || 0;
    }
    return 0;
  }
  function valueOf(p: { transferValueExact?: number; transferValueEstimate?: number }): number {
    return p.transferValueExact ?? p.transferValueEstimate ?? 0;
  }

  const filteredPool = $derived(
    data.pool
      .filter((p) => {
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filterPosition !== 'ALL' && p.position !== filterPosition) return false;
        if (filterTier !== 'ALL' && String(p.visibilityTier) !== filterTier) return false;
        if (filterContract !== 'ALL' && p.contractStatus !== filterContract) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        switch (sortKey) {
          case 'name': return a.name.localeCompare(b.name) * dir;
          case 'position': return (a.position ?? '').localeCompare(b.position ?? '') * dir;
          case 'club': return (a.clubName ?? '').localeCompare(b.clubName ?? '') * dir;
          case 'tier': return (a.visibilityTier - b.visibilityTier) * dir;
          case 'ovr': return (ovrOf(a) - ovrOf(b)) * dir;
          case 'value': return (valueOf(a) - valueOf(b)) * dir;
        }
      }),
  );

  const POSITION_LABELS: Record<string, string> = {
    GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL',
  };
  const TIER_LABEL: Record<0 | 1 | 2 | 3, string> = {
    0: 'Sin info', 1: 'Básico', 2: 'Estimado', 3: 'Detallado',
  };
  function tierBadge(t: 0 | 1 | 2 | 3): string {
    return t >= 3 ? 'badge-success' : t === 2 ? 'badge-info' : t === 1 ? 'badge-warning' : 'badge-ghost';
  }

  function closeOffer(): void { offerPlayerId = null; }

  // Pablo 2026-05-26: after sending offer, give feedback + close modal.
  // Toast holds 4s so the user sees the outcome even after modal closes.
  let lastOutcomeToast = $state<{ kind: string; msg: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function showToast(kind: string, msg: string) {
    if (toastTimer) clearTimeout(toastTimer);
    lastOutcomeToast = { kind, msg };
    toastTimer = setTimeout(() => { lastOutcomeToast = null; }, 4500);
  }
</script>

<svelte:head>
  <title>Scouting · Total Soccer Manager</title>
</svelte:head>

<article class="max-w-6xl mx-auto py-6 space-y-4">
  <header>
    <h1 class="text-2xl font-bold">Mercado de Fichajes</h1>
    <p class="opacity-70 text-sm">
      Paga para descubrir información sobre jugadores. Click en el nombre (con scout
      hecho) para comparar con tu plantilla. Tus jugadores marcados como
      transferibles reciben ofertas automáticas.
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">Necesitas una carrera activa para ver el mercado.</div>
  {:else}
    <!-- Incoming offers panel -->
    {#if (data.incomingOffers ?? []).length > 0}
      <section aria-labelledby="incoming-h" class="card bg-base-100 shadow border-2 border-success/40">
        <div class="card-body py-4">
          <h2 id="incoming-h" class="card-title text-base">💰 Ofertas recibidas por tus jugadores ({data.incomingOffers!.length})</h2>
          <div class="overflow-x-auto mt-2">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Jugador</th><th>Pos.</th><th>OVR</th><th>Club ofertante</th>
                  <th class="text-right">Fee</th><th></th>
                </tr>
              </thead>
              <tbody>
                {#each data.incomingOffers! as o (o.offerId)}
                  <tr>
                    <td class="font-semibold">{o.playerFirstName} {o.playerLastName}</td>
                    <td>{POSITION_LABELS[o.playerPosition] ?? o.playerPosition}</td>
                    <td class="font-mono">{o.playerSkill}</td>
                    <td>{o.buyerClubName}</td>
                    <td class="text-right font-mono font-semibold">{o.feeEurK} k€</td>
                    <td>
                      <div class="flex gap-1">
                        <form method="POST" action="?/respondOffer" use:enhance>
                          <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                          <input type="hidden" name="offerId" value={o.offerId} />
                          <input type="hidden" name="responseAction" value="accept" />
                          <button type="submit" class="btn btn-xs btn-success">Aceptar</button>
                        </form>
                        <form method="POST" action="?/respondOffer" use:enhance>
                          <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                          <input type="hidden" name="offerId" value={o.offerId} />
                          <input type="hidden" name="responseAction" value="reject" />
                          <button type="submit" class="btn btn-xs btn-ghost">Rechazar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    {/if}

    <!-- Form-result alerts -->
    {#if form?.action === 'respondOffer'}
      {#if 'status' in (form ?? {})}
        {@const f = form as unknown as { status: string; feeEurK?: number }}
        <div class="alert {f.status === 'accepted' ? 'alert-success' : 'alert-info'}">
          {#if f.status === 'accepted'}
            ✅ Oferta aceptada — recibiste {f.feeEurK} k€. El jugador ha sido transferido.
          {:else}
            ❌ Oferta rechazada. Volverá a recibir ofertas en próximas semanas si sigue transferible.
          {/if}
        </div>
      {:else if form.error}
        <div class="alert alert-error">Error: {String(form.error)}</div>
      {/if}
    {/if}
    {#if form?.action === 'scout' && 'actionId' in form}
      {@const f = form as unknown as { costPaid?: number }}
      <div class="alert alert-success">Scouting completado — se cobraron <span class="font-mono">{f.costPaid ?? 0} k€</span>.</div>
    {/if}
    {#if form?.action === 'scout' && form.error}
      <div class="alert alert-error">Error: <span class="font-mono">{String(form.error)}</span></div>
    {/if}
    {#if form?.action === 'offer' && 'kind' in (form ?? {})}
      {@const f = form as unknown as { kind: string; counterOfferEurK?: number; reason?: string; feeEurK?: number; finalWageEurKWeek?: number }}
      {#if f.kind === 'accepted'}
        <div class="alert alert-success">✅ Oferta aceptada — fee {f.feeEurK ?? 0} k€ + sueldo {f.finalWageEurKWeek ?? 0} k€/sem</div>
      {:else if f.kind === 'counter'}
        <div class="alert alert-warning">🤝 Contraoferta: <span class="font-mono">{f.counterOfferEurK} k€</span>.</div>
      {:else if f.kind === 'rejected'}
        <div class="alert alert-error">❌ Oferta rechazada ({f.reason === 'wage_low' ? 'sueldo bajo' : 'lejos del valor de mercado'})</div>
      {/if}
    {/if}

    {#if data.pool.length === 0}
      <div class="alert alert-info">El pool está vacío todavía.</div>
    {:else}
      <p class="text-xs opacity-60">{filteredPool.length} de {data.pool.length} jugadores · click "Scout" para revelar más, click en nombre (tras scout) para comparar.</p>

      <!-- Filters bar -->
      <div class="flex gap-2 flex-wrap items-center text-sm mb-3">
        <input type="text" placeholder="Buscar por nombre…" bind:value={searchTerm} class="input input-bordered input-sm w-40" />
        <select bind:value={filterPosition} class="select select-bordered select-sm">
          <option value="ALL">Todas posiciones</option>
          <option value="GK">Portero</option><option value="DEF">Defensa</option>
          <option value="MID">Mediocampo</option><option value="FWD">Delantero</option>
        </select>
        <select bind:value={filterTier} class="select select-bordered select-sm">
          <option value="ALL">Todo nivel info</option>
          <option value="0">Sin info</option><option value="1">Básico</option>
          <option value="2">Estimado</option><option value="3">Detallado</option>
        </select>
        <select bind:value={filterContract} class="select select-bordered select-sm">
          <option value="ALL">Cualquier contrato</option>
          <option value="in_contract">Con contrato</option>
          <option value="expiring">Termina contrato</option>
          <option value="free_agent">Agente libre</option>
        </select>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => { searchTerm = ''; filterPosition = 'ALL'; filterTier = 'ALL'; filterContract = 'ALL'; }}>Limpiar</button>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th><button type="button" class="hover:underline" onclick={() => toggleSort('name')}>Jugador {sortIcon('name')}</button></th>
              <th><button type="button" class="hover:underline" onclick={() => toggleSort('position')}>Pos. {sortIcon('position')}</button></th>
              <th><button type="button" class="hover:underline" onclick={() => toggleSort('club')}>Club {sortIcon('club')}</button></th>
              <th><button type="button" class="hover:underline" onclick={() => toggleSort('tier')}>Info {sortIcon('tier')}</button></th>
              <th class="text-right">
                <button type="button" class="hover:underline" onclick={() => toggleSort('ovr')}>OVR {sortIcon('ovr')}</button>
                {' / '}
                <button type="button" class="hover:underline" onclick={() => toggleSort('value')}>Valor {sortIcon('value')}</button>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredPool as p (p.id)}
              <tr>
                <td class="font-semibold">
                  <div class="flex items-center gap-2">
                    <Avatar seed={`scout:${p.id}:${p.name}`} size={28} />
                    {#if p.visibilityTier >= 2}
                      <button
                        type="button"
                        class="truncate link link-hover text-left"
                        onclick={() => { comparePlayerId = p.id; }}
                        title="Comparar con tu plantilla"
                      >
                        {p.name}
                      </button>
                    {:else}
                      <span class="truncate opacity-90" title="Necesitas hacer scout para comparar">{p.name}</span>
                    {/if}
                  </div>
                </td>
                <td>{POSITION_LABELS[p.position] ?? p.position}</td>
                <td class="opacity-70">{p.clubName ?? '—'}</td>
                <td><span class="badge badge-sm {tierBadge(p.visibilityTier)}">{TIER_LABEL[p.visibilityTier]}</span></td>
                <td class="text-right text-xs font-mono">
                  {#if p.visibilityTier >= 3}
                    OVR <strong>{p.ovrExact}</strong> · {p.transferValueExact} k€ · forma {p.recentForm}
                  {:else if p.visibilityTier >= 2}
                    OVR ~{p.ovrEstimate} · ~{p.transferValueEstimate} k€
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
                        <button type="submit" class="btn btn-xs btn-outline">Scout</button>
                      </form>
                    {/if}
                    {#if p.visibilityTier < 3}
                      <form method="POST" action="?/scout" use:enhance>
                        <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="actionType" value="deep_scout" />
                        <button type="submit" class="btn btn-xs btn-primary">Deep</button>
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
    {/if}
  {/if}

  <!-- Compare modal (own roster at same position) — polished v2 -->
  {#if comparePlayer}
    {@const candidateOvr = comparePlayer.ovrExact ?? comparePlayer.ovrEstimate ?? 0}
    {@const bestOwn = sameRosterPlayers[0]}
    {@const isUpgrade = bestOwn ? candidateOvr > bestOwn.skill : true}
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="card bg-base-100 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div class="card-body">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="card-title text-xl">Comparativa de fichaje</h3>
              <p class="opacity-60 text-sm">
                {POSITION_LABELS[comparePlayer.position] ?? comparePlayer.position} ·
                {comparePlayer.contractStatus === 'free_agent' ? 'Agente libre' : comparePlayer.clubName ?? '—'}
              </p>
            </div>
            <button type="button" class="btn btn-sm btn-ghost btn-circle" onclick={() => { comparePlayerId = null; }} aria-label="Cerrar">✕</button>
          </div>

          <!-- Candidate hero -->
          <div class="card bg-gradient-to-br from-success/15 to-success/5 border-2 border-success/40 mt-3">
            <div class="card-body py-4">
              <div class="flex items-center gap-4 flex-wrap">
                <Avatar seed={`scout:${comparePlayer.id}:${comparePlayer.name}`} size={72} framed />
                <div class="flex-1 min-w-[180px]">
                  <p class="text-xs uppercase opacity-60 font-semibold">Candidato</p>
                  <h4 class="text-2xl font-bold">{comparePlayer.name}</h4>
                  <div class="flex gap-3 flex-wrap mt-1 text-xs opacity-80">
                    <span>📊 OVR <strong class="font-mono text-base">{candidateOvr || '?'}</strong></span>
                    {#if comparePlayer.transferValueExact !== undefined || comparePlayer.transferValueEstimate !== undefined}
                      <span>💶 ~{comparePlayer.transferValueExact ?? comparePlayer.transferValueEstimate} k€</span>
                    {/if}
                    {#if comparePlayer.moraleExact !== undefined}
                      <span>😊 {comparePlayer.moraleExact}</span>
                    {:else if comparePlayer.moraleBand}
                      <span>😊 {comparePlayer.moraleBand}</span>
                    {/if}
                    {#if comparePlayer.fitnessExact !== undefined}
                      <span>🏃 {comparePlayer.fitnessExact}</span>
                    {/if}
                    {#if comparePlayer.recentForm !== undefined}
                      <span>📈 Forma {comparePlayer.recentForm}</span>
                    {/if}
                  </div>
                </div>
                {#if bestOwn}
                  <div class="text-right">
                    <span class={isUpgrade ? 'badge badge-success badge-lg' : 'badge badge-warning badge-lg'}>
                      {isUpgrade ? '⬆ Mejora' : '⬇ Por debajo'}
                    </span>
                    <p class="text-xs opacity-60 mt-1">vs. tu mejor</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Own roster -->
          <p class="text-xs uppercase opacity-60 font-semibold mt-4 mb-1">Tu plantilla en esta posición</p>
          {#if sameRosterPlayers.length === 0}
            <div class="alert alert-warning">
              No tienes jugadores en posición <strong>{POSITION_LABELS[comparePlayer.position] ?? comparePlayer.position}</strong>. Este fichaje cubre un hueco.
            </div>
          {:else}
            <div class="space-y-2">
              {#each sameRosterPlayers as own (own.id)}
                {@const diff = candidateOvr - own.skill}
                {@const sign = diff > 0 ? '+' : ''}
                <div class="flex items-center gap-3 p-2 rounded bg-base-200">
                  <Avatar seed={`player:${own.id}:${own.firstName}${own.lastName}`} size={40} />
                  <div class="flex-1">
                    <p class="font-semibold">{own.firstName} {own.lastName}</p>
                    <p class="text-xs opacity-60">{POSITION_LABELS[own.position] ?? own.position}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-mono text-lg">{own.skill}</p>
                    <p class="text-xs {diff > 0 ? 'text-success' : diff < 0 ? 'text-error' : 'opacity-60'}">
                      {sign}{diff} OVR
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="card-actions justify-end mt-4 gap-2">
            <button type="button" class="btn btn-ghost" onclick={() => { comparePlayerId = null; }}>Cerrar</button>
            <button
              type="button"
              class="btn btn-success"
              onclick={() => {
                offerPlayerId = comparePlayer!.id;
                offerFee = comparePlayer!.transferValueEstimate ?? comparePlayer!.transferValueExact ?? 100;
                offerWage = 5;
                comparePlayerId = null;
              }}
            >
              💰 Ofertar por este jugador
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Toast (offer feedback) -->
  {#if lastOutcomeToast}
    <div class="toast toast-end z-50">
      <div class="alert alert-{lastOutcomeToast.kind === 'warning' ? 'warning' : lastOutcomeToast.kind === 'error' ? 'error' : lastOutcomeToast.kind === 'success' ? 'success' : 'info'}">
        <span>{lastOutcomeToast.msg}</span>
      </div>
    </div>
  {/if}

  <!-- Offer modal -->
  {#if offerPlayerId}
    {@const p = data.pool.find((x) => x.id === offerPlayerId)}
    {#if p}
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div class="card bg-base-100 shadow-xl max-w-md w-full">
          <div class="card-body">
            <h3 class="card-title">Hacer oferta por {p.name}</h3>
            <p class="text-xs opacity-70">
              {p.position} · {p.clubName ?? 'agente libre'}
              {#if p.contractStatus === 'expiring'}
                <span class="badge badge-warning badge-sm ml-2">📋 Pre-contrato (contrato expira)</span>
              {:else if p.contractStatus === 'free_agent'}
                <span class="badge badge-info badge-sm ml-2">🆓 Agente libre</span>
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
                    closeOffer();
                  } else if (result.type === 'failure') {
                    const err = (result.data as { error?: string })?.error ?? 'desconocido';
                    showToast('error', `Error al enviar oferta: ${err}`);
                  }
                };
              }}
            >
              <input type="hidden" name="clubId" value={data.club?.id ?? ''} />
              <input type="hidden" name="playerId" value={p.id} />

              {#if p.contractStatus === 'in_contract'}
                <label class="form-control w-full mt-3">
                  <span class="label-text">Fee (k€)</span>
                  <input type="number" name="feeEurK" bind:value={offerFee} min="0" class="input input-bordered input-sm" />
                </label>
              {:else}
                <input type="hidden" name="feeEurK" value="0" />
                <p class="text-xs mt-2 italic">
                  {#if p.contractStatus === 'free_agent'}
                    🆓 Agente libre — no se paga fee, sólo sueldo.
                  {:else}
                    📋 Pre-contrato — el contrato expira pronto, podés ficharlo sin fee (negociación al estilo Bosman).
                  {/if}
                </p>
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
                Compromiso total: <span class="font-mono">{(p.contractStatus === 'in_contract' ? offerFee : 0) + offerWage * offerContractWeeks} k€</span> ·
                Buffer requerido: <span class="font-mono">{(p.contractStatus === 'in_contract' ? offerFee : 0) + offerWage * 4} k€</span> (fee + 4 sem)
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

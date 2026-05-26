<!--
  TV Rights — passive contract panel + tv_auction / tv_midseason_offer resolution.

  Per design/ux/tv-rights.md.

  Story: TVR-011 (UI)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  import type {
    TVAuctionPayload,
    TVDurationSeasons,
    TVMidseasonOfferPayload,
    TVTier,
  } from '@smt/shared';
  import { formatEurK } from '$lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Selection state for the tv_auction modal (one offer at a time).
  let selectedOffer = $state<{ tier: TVTier; durationSeasons: TVDurationSeasons } | null>(
    null,
  );
  let confirmRejectOpen = $state(false);
  let pendingRejectEventId = $state<string | null>(null);
  let rejectFormEl: HTMLFormElement | undefined = $state();

  const TIER_LABEL: Record<TVTier, string> = {
    LOCAL: 'Canal Local',
    REGIONAL: 'Canal Regional',
    NACIONAL: 'Canal Nacional',
  };

  function formatRate(eurK: number): string {
    return `${formatEurK(eurK)}/sem`;
  }

  function formatYearOfContract(seasonInContract: number, durationSeasons: number): string {
    return durationSeasons > 1 ? `Año ${seasonInContract} de ${durationSeasons}` : '';
  }

  function isSelected(tier: TVTier, dur: TVDurationSeasons): boolean {
    return selectedOffer?.tier === tier && selectedOffer?.durationSeasons === dur;
  }

  function selectOffer(tier: TVTier, dur: TVDurationSeasons): void {
    selectedOffer = { tier, durationSeasons: dur };
  }

  function askRejectConfirm(eventId: string): void {
    pendingRejectEventId = eventId;
    confirmRejectOpen = true;
  }

  function submitReject(): void {
    rejectFormEl?.requestSubmit();
  }

  function isAuctionPayload(
    p: TVAuctionPayload | TVMidseasonOfferPayload,
  ): p is TVAuctionPayload {
    return p.type === 'tv_auction';
  }

  function isMidseasonPayload(
    p: TVAuctionPayload | TVMidseasonOfferPayload,
  ): p is TVMidseasonOfferPayload {
    return p.type === 'tv_midseason_offer';
  }

  // Weeks-remaining helper for the active contract panel.
  function weeksRemainingThisSeason(currentWeek: number): number {
    return Math.max(0, 38 - currentWeek);
  }
</script>

<svelte:head>
  <title>Derechos de televisión — Cascada FC</title>
</svelte:head>

<section class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Finanzas</h1>
    <p class="opacity-60">Balance, ingresos, gastos y patrocinadores del club</p>
  </header>

  <!--
    P9 fix (playtest 2026-05-21 Pablo): TV rights page used to lose the
    finance tabs entirely, leaving only a '← Finanzas' back link. Now we
    mirror the finance tab bar here, with the 4 sibling tabs all linking
    via plain hrefs (each tab is its own route or ?tab= URL param).
  -->

  {#if !data.hasPlaythrough}
    <div class="alert">
      <span>Inicia o carga una carrera para gestionar los derechos de TV.</span>
    </div>
  {:else}
    <!-- ── Contract panel (passive) ───────────────────────────────────────── -->
    <article class="card bg-base-200 shadow">
      <div class="card-body">
        {#if data.contract}
          <div class="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <h2 class="text-2xl font-semibold">{TIER_LABEL[data.contract.tier]}</h2>
              {#if data.contract.durationSeasons > 1}
                <span class="badge badge-outline mt-1">
                  {formatYearOfContract(data.contract.seasonInContract, data.contract.durationSeasons)}
                </span>
              {/if}
            </div>
            <div class="text-3xl font-bold tabular-nums">
              {formatRate(data.contract.weeklyRateEurK)}
            </div>
          </div>
          <div class="text-sm text-base-content/70 mt-2">
            División al firmar: <span class="font-medium">{data.contract.divisionAtSigning === 'D1' ? 'Primera' : 'Segunda'}</span>
            · {weeksRemainingThisSeason(data.currentWeek)} semanas restantes esta temporada
          </div>
          <div class="text-xs text-base-content/60 mt-2">
            {#if data.contract.seasonInContract < data.contract.durationSeasons}
              Próximo evento: este año no hay sobre (contrato multi-año vigente).
            {:else}
              Próximo evento: subasta nueva al inicio de la próxima temporada.
            {/if}
          </div>
        {:else if data.cancelledThisSeason}
          <h2 class="text-lg font-semibold text-warning">
            Contrato cancelado por escrutinio mediático
          </h2>
          <p class="text-sm text-base-content/70">
            Tu contrato anterior ({TIER_LABEL[data.cancelledThisSeason.tier]}) fue cancelado.
            {#if data.pendingTVEvents.some((e) => e.type === 'tv_midseason_offer')}
              <span class="badge badge-warning ml-1">Oferta de reemplazo disponible abajo</span>
            {:else}
              El club opera sin ingresos TV hasta fin de temporada.
            {/if}
          </p>
        {:else}
          <h2 class="text-lg font-semibold">Sin contrato TV esta temporada</h2>
          <p class="text-sm text-base-content/70">
            El club opera sin ingresos por televisión esta temporada.
            {#if data.pendingTVEvents.length === 0}
              La próxima subasta llegará al inicio de la siguiente temporada.
            {/if}
          </p>
        {/if}
      </div>
    </article>

    <!-- ── Form result feedback ──────────────────────────────────────────── -->
    {#if form && 'ok' in form && form.ok}
      {#if 'signed' in form && form.signed}
        <div class="alert alert-success">
          <div>
            Firmado {TIER_LABEL[form.signed.tier as TVTier]} ({form.signed.durationSeasons === 1
              ? '1 temporada'
              : `${form.signed.durationSeasons} temporadas`}) · {formatRate(form.signed.weeklyRateEurK)}
            {#if form.signed.xpGranted > 0}
              · +{form.signed.xpGranted} XP a Acumen Financiero (próximo tick)
            {/if}
          </div>
        </div>
      {:else if 'rejected' in form && form.rejected}
        <div class="alert alert-info">
          <div>
            Rechazo registrado · Fidelidad afición: {form.rejected.fanLoyaltyBefore} →
            {form.rejected.fanLoyaltyAfter} (+{form.rejected.delta})
          </div>
        </div>
      {/if}
    {/if}
    {#if form && 'error' in form && form.error}
      <div class="alert alert-error">
        <div>{form.error}</div>
      </div>
    {/if}

    <!-- ── Pending tv_auction events ─────────────────────────────────────── -->
    {#each data.pendingTVEvents as event (event.id)}
      {#if isAuctionPayload(event.payload)}
        <article class="card bg-base-100 border-2 border-primary shadow-lg">
          <div class="card-body">
            <header class="flex items-baseline justify-between flex-wrap gap-2">
              <h2 class="card-title">Subasta de Derechos de TV — Temporada {event.payload.season}</h2>
              <span class="badge badge-primary">Decisión requerida</span>
            </header>
            <p class="text-sm text-base-content/70">
              Tienes <span class="font-medium">{event.payload.offers.length}</span>
              {event.payload.offers.length === 1 ? 'sobre' : 'sobres'} este año:
            </p>

            <form method="POST" action="?/sign" use:enhance class="space-y-4">
              <input type="hidden" name="eventId" value={event.id} />

              {#each event.payload.offers as offer (offer.tier)}
                <fieldset
                  class="border border-base-300 rounded-lg p-3 space-y-2"
                  aria-labelledby="offer-{event.id}-{offer.tier}-title"
                >
                  <legend id="offer-{event.id}-{offer.tier}-title" class="font-semibold px-1">
                    {TIER_LABEL[offer.tier]}
                  </legend>
                  <p class="text-xs text-base-content/60">
                    Escrutinio: {offer.durationOptions[0]?.corruptionDeltaPerWeek > 0 ? '+' : ''}{offer
                      .durationOptions[0]?.corruptionDeltaPerWeek}/sem
                    ({offer.durationOptions[0]?.corruptionAccumSeason > 0 ? '+' : ''}{offer
                      .durationOptions[0]?.corruptionAccumSeason}/temporada)
                  </p>
                  <div class="space-y-1">
                    {#each offer.durationOptions as opt (opt.durationSeasons)}
                      <label
                        class="flex items-center gap-2 p-2 rounded hover:bg-base-200 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="selection"
                          class="radio radio-primary"
                          checked={isSelected(offer.tier, opt.durationSeasons)}
                          onchange={() => selectOffer(offer.tier, opt.durationSeasons)}
                        />
                        <span class="flex-1">
                          {opt.durationSeasons === 1
                            ? '1 temporada'
                            : `${opt.durationSeasons} temporadas`}
                          — <span class="font-semibold tabular-nums">{formatRate(opt.weeklyRateEurK)}</span>
                          {#if opt.durationSeasons > 1}
                            <span class="text-xs text-base-content/60">
                              ({opt.durationSeasons === 2 ? '+5%' : '+10%'})
                            </span>
                          {/if}
                        </span>
                        {#if opt.riskFlag === 'NACIONAL_3YR'}
                          <span
                            class="badge badge-error badge-sm gap-1"
                            title="Tu nivel de escrutinio hará que este contrato se cancele en la Temporada 2."
                          >
                            ⚠️ Riesgo Alto
                          </span>
                        {:else if opt.riskFlag === 'REGIONAL_2YR'}
                          <span
                            class="badge badge-warning badge-sm gap-1"
                            title="Tu nivel de escrutinio llevará al contrato a cancelarse al final de la Temporada 2."
                          >
                            ⚠️ Riesgo
                          </span>
                        {/if}
                      </label>
                    {/each}
                  </div>
                </fieldset>
              {/each}

              <!-- Hidden inputs mirror the selected radio for form submission. -->
              <input type="hidden" name="tier" value={selectedOffer?.tier ?? ''} />
              <input
                type="hidden"
                name="durationSeasons"
                value={selectedOffer?.durationSeasons?.toString() ?? ''}
              />

              <div class="flex flex-wrap gap-2 justify-end pt-2">
                <button
                  type="button"
                  class="btn btn-ghost"
                  onclick={() => askRejectConfirm(event.id)}
                >
                  Rechazar todo
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  disabled={selectedOffer === null}
                >
                  Firmar selección
                </button>
              </div>
              <p class="text-xs text-base-content/60 text-right">
                Rechazar otorga +10 fidelidad de afición (cap 50; actual: {data.managerFanLoyalty}).
              </p>
            </form>
          </div>
        </article>
      {:else if isMidseasonPayload(event.payload)}
        <article class="card bg-base-100 border-2 border-warning shadow-lg">
          <div class="card-body">
            <header class="flex items-baseline justify-between flex-wrap gap-2">
              <h2 class="card-title">Oferta de reemplazo — Sem {event.week}</h2>
              <span class="badge badge-warning">Decisión requerida</span>
            </header>
            <p class="text-sm text-base-content/70">
              Tu contrato anterior ({TIER_LABEL[event.payload.cancelledTier]}) fue cancelado por
              escrutinio mediático. Te ofrecen un sustituto:
            </p>
            <div class="bg-base-200 p-3 rounded text-lg font-semibold tabular-nums">
              {TIER_LABEL[event.payload.offer.tier]} —
              {formatRate(event.payload.offer.weeklyRateEurK)} ·
              {event.payload.offer.weeksRemaining} semanas
            </div>

            <div class="flex flex-wrap gap-2 justify-end pt-2">
              <button
                type="button"
                class="btn btn-ghost"
                onclick={() => askRejectConfirm(event.id)}
              >
                Rechazar
              </button>
              <form
                method="POST"
                action="?/sign"
                use:enhance
                class="inline-block"
              >
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="tier" value={event.payload.offer.tier} />
                <input type="hidden" name="durationSeasons" value="1" />
                <button type="submit" class="btn btn-warning">Firmar reemplazo</button>
              </form>
            </div>
            <p class="text-xs text-base-content/60 text-right">
              Rechazar otorga +10 fidelidad de afición (actual: {data.managerFanLoyalty}; cap 50).
            </p>
          </div>
        </article>
      {/if}
    {/each}

    <!-- ── Hidden reject form (triggered after confirm) ─────────────────── -->
    {#if pendingRejectEventId}
      <form
        method="POST"
        action="?/reject"
        use:enhance
        bind:this={rejectFormEl}
        class="hidden"
      >
        <input type="hidden" name="eventId" value={pendingRejectEventId} />
      </form>
    {/if}
  {/if}
</section>

<ConfirmDialog
  bind:open={confirmRejectOpen}
  title="Rechazar oferta de TV"
  message="¿Confirmas? El club no recibirá ingresos TV hasta el siguiente reset. La afición valorará la postura anti-comercial (+10 fidelidad, cap 50)."
  confirmLabel="Rechazar"
  dangerous={false}
  onConfirm={submitReject}
/>

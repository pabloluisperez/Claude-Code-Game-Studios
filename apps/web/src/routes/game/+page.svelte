<!--
  Onboarding hub — list existing careers + create new career form.

  Story: Onboarding (HUD-UI follow-up)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>Mis carreras — Cascada FC</title>
</svelte:head>

<div class="space-y-6 max-w-3xl mx-auto">
  <header>
    <h1 class="text-2xl font-bold">Mis carreras</h1>
    <p class="opacity-60">Selecciona una partida o comienza una nueva.</p>
  </header>

  {#if data.careers.length > 0}
    <section class="space-y-3">
      <h2 class="text-lg font-semibold">Carreras activas</h2>
      {#each data.careers as c}
        <a
          href="/dashboard"
          class="card bg-base-100 shadow hover:bg-base-200 transition-colors block"
        >
          <div class="card-body flex-row items-center justify-between">
            <div>
              <div class="font-bold text-lg">{c.clubName}</div>
              <div class="text-sm opacity-60">{c.city}</div>
            </div>
            <div class="text-right">
              <div class="text-xs opacity-50 uppercase">Semana</div>
              <div class="font-mono text-2xl">{c.currentWeek}</div>
            </div>
          </div>
        </a>
      {/each}
    </section>
  {/if}

  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">
        {data.careers.length === 0 ? 'Crear mi primera carrera' : 'Nueva carrera'}
      </h2>
      <p class="opacity-70 text-sm">
        Te asignamos un club modesto en Quinta División. Generamos una plantilla
        de 25 jugadores y un staff inicial. Tu objetivo: ascender, crecer la
        afición y construir un legado.
      </p>

      {#if form?.error}
        <div class="alert alert-error mt-3">
          <span>{form.error}</span>
        </div>
      {/if}

      <form
        method="POST"
        action="?/create"
        class="space-y-3 mt-3"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <label class="form-control">
          <span class="label-text">Tu nombre como mánager</span>
          <input
            class="input input-bordered"
            type="text"
            name="managerName"
            placeholder="Pep Cascada, Mireia Reyes, ..."
            required
            minlength="2"
            maxlength="50"
            disabled={submitting}
          />
        </label>

        <label class="form-control">
          <span class="label-text">Nombre del club</span>
          <input
            class="input input-bordered"
            type="text"
            name="clubName"
            placeholder="CD Pueblo, Real Cascada, ..."
            required
            minlength="2"
            maxlength="50"
            disabled={submitting}
          />
        </label>

        <label class="form-control">
          <span class="label-text">Ciudad</span>
          <input
            class="input input-bordered"
            type="text"
            name="city"
            placeholder="Cascada"
            required
            minlength="2"
            maxlength="50"
            disabled={submitting}
          />
        </label>

        <button class="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {#if submitting}
            <span class="loading loading-spinner loading-sm"></span>
            Creando…
          {:else}
            Comenzar carrera
          {/if}
        </button>
      </form>
    </div>
  </section>
</div>

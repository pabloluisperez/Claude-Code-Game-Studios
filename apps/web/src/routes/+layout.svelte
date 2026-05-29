<!--
  Root layout — top bar + sidebar + main content slot.
  Mobile breakpoint: 768px (sidebar collapses to hamburger).

  Story: HUD-UI-001
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  import Sidebar from '$lib/components/sidebar.svelte';
  import Topbar from '$lib/components/topbar.svelte';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  let sidebarOpen = $state(false);

  // Hide chrome on login/signup/landing
  const showChrome = $derived(
    data.user !== null && !$page.url.pathname.startsWith('/login') && !$page.url.pathname.startsWith('/signup'),
  );

  // Polish walkthrough fix (Pablo, post-Sprint-11): sidebar lives off the
  // active playthrough (Dashboard, Squad, Staff, etc. all assume one exists).
  // On /game (the playthrough selector) and any route reached without an
  // active playthrough, the sidebar has no anchor and clutters the UI.
  // Show chrome (topbar) but skip the side nav in that state.
  const showSidebar = $derived(
    data.activePlaythrough !== null &&
      !$page.url.pathname.startsWith('/game'),
  );

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
</script>

{#if showChrome}
  <div class="min-h-screen flex flex-col">
    <!-- a11y P2-1 (Sprint 12 task 12-3): skip-link al main content.
         Visualmente oculto hasta recibir focus; con Tab desde el inicio
         de la página se ve y permite saltar la navegación. -->
    <a href="#main-content" class="skip-link">Saltar al contenido</a>
    <Topbar
      user={data.user}
      week={data.activePlaythrough?.weekInSeason ?? 0}
      dateDisplay={data.activePlaythrough?.date?.display}
      dateDisplayLong={data.activePlaythrough?.date?.displayLong}
      balanceEurK={data.activePlaythrough?.balanceEurK ?? null}
      inboxUnread={data.badges?.inboxUnread ?? 0}
      showSidebarToggle={showSidebar}
      onToggleSidebar={toggleSidebar}
      isPreseason={data.activePlaythrough?.isPreseason ?? false}
      matchday={data.activePlaythrough?.matchday ?? null}
      seasonNumber={data.activePlaythrough?.seasonNumber ?? 1}
    />
    <div class="flex flex-1">
      {#if showSidebar}
        <Sidebar
          bind:open={sidebarOpen}
          badges={data.badges}
          clubInfo={data.activePlaythrough
            ? {
                name: data.activePlaythrough.clubName ?? '—',
                division: data.activePlaythrough.clubDivision ?? 'fifth',
                position: data.activePlaythrough.standingsPosition ?? null,
                record: data.activePlaythrough.standingsRecord ?? null,
                balanceEurK: data.activePlaythrough.balanceEurK ?? null,
                currentWeek: data.activePlaythrough.weekInSeason ?? data.activePlaythrough.currentWeek,
                seasonNumber: data.activePlaythrough.seasonNumber ?? 1,
                kitPrimaryColor: data.activePlaythrough.kitPrimaryColor,
                kitSecondaryColor: data.activePlaythrough.kitSecondaryColor,
              }
            : null}
        />
      {/if}
      <!-- Pablo 2026-05-29: la columna principal coge todo el hueco (sin
           max-w-7xl/centrado) y menos padding vertical (menos scroll). -->
      <main id="main-content" class="flex-1 min-w-0 px-4 py-4">
        {@render children()}
      </main>
    </div>
    <footer class="footer footer-center bg-base-200 text-base-content/70 p-4 text-xs">
      <nav class="grid grid-flow-col gap-4">
        <a href="/terms" class="link link-hover">Términos de Servicio</a>
        <a href="/privacy" class="link link-hover">Privacidad</a>
      </nav>
    </footer>
  </div>
{:else}
  <a href="#main-content" class="skip-link">Saltar al contenido</a>
  <nav class="navbar bg-base-200 px-4">
    <div class="flex-1">
      <a href="/" class="btn btn-ghost text-xl font-bold">Total Soccer Manager</a>
    </div>
    <div class="flex-none gap-2">
      {#if data.user}
        <span class="text-sm opacity-70">{data.user.username}</span>
        <form method="POST" action="/logout">
          <button class="btn btn-ghost btn-sm" type="submit">Logout</button>
        </form>
      {:else}
        <a href="/login" class="btn btn-ghost btn-sm">Login</a>
        <a href="/signup" class="btn btn-primary btn-sm">Sign up</a>
      {/if}
    </div>
  </nav>
  <main id="main-content" class="container mx-auto px-4 py-8">
    {@render children()}
  </main>
  <footer class="footer footer-center bg-base-200 text-base-content/70 p-4 text-xs">
    <nav class="grid grid-flow-col gap-4">
      <a href="/terms" class="link link-hover">Términos de Servicio</a>
      <a href="/privacy" class="link link-hover">Privacidad</a>
    </nav>
  </footer>
{/if}

<style>
  /* a11y P2-1: skip-link visualmente oculto hasta recibir focus.
     Standard sr-only pattern: posicionado fuera del viewport (top: -40px)
     y traído al foco con :focus-visible. */
  :global(.skip-link) {
    position: absolute;
    top: -40px;
    left: 0;
    background: hsl(var(--p));
    color: hsl(var(--pc));
    padding: 0.5rem 1rem;
    z-index: 100;
    text-decoration: none;
    font-weight: 600;
    border-radius: 0 0 0.5rem 0;
    transition: top 0.15s ease-out;
  }
  :global(.skip-link:focus),
  :global(.skip-link:focus-visible) {
    top: 0;
  }
</style>

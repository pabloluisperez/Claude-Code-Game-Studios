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

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
</script>

{#if showChrome}
  <div class="min-h-screen flex flex-col">
    <Topbar
      user={data.user}
      week={data.activePlaythrough?.currentWeek ?? 0}
      dateDisplay={data.activePlaythrough?.date?.display}
      balanceEurK={data.activePlaythrough?.balanceEurK ?? null}
      inboxUnread={data.badges?.inboxUnread ?? 0}
      onToggleSidebar={toggleSidebar}
    />
    <div class="flex flex-1">
      <Sidebar bind:open={sidebarOpen} badges={data.badges} />
      <main class="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {@render children()}
      </main>
    </div>
  </div>
{:else}
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
  <main class="container mx-auto px-4 py-8">
    {@render children()}
  </main>
{/if}

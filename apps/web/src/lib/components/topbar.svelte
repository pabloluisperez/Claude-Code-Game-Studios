<!--
  Top bar — club name + in-game date + hamburger toggle.

  Story: HUD-UI-001 + MVP UX fixes (real dates)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  interface Props {
    user: { username: string } | null;
    week?: number;
    dateDisplay?: string | undefined;
    onToggleSidebar?: () => void;
  }
  let { user, week = 0, dateDisplay, onToggleSidebar }: Props = $props();
</script>

<nav class="navbar bg-base-200 px-4 sticky top-0 z-10 border-b border-base-300">
  <div class="md:hidden mr-2">
    <button
      class="btn btn-ghost btn-sm"
      aria-label="Toggle sidebar"
      onclick={onToggleSidebar}
    >
      ☰
    </button>
  </div>

  <div class="flex-1">
    <a href="/dashboard" class="btn btn-ghost text-xl font-bold">Cascada FC</a>
  </div>

  <div class="flex-none gap-4 items-center">
    {#if dateDisplay}
      <div class="hidden sm:flex flex-col items-end text-xs leading-tight">
        <span class="opacity-50">Hoy</span>
        <span class="font-mono font-semibold">{dateDisplay}</span>
      </div>
    {/if}
    <div class="hidden md:flex flex-col items-end text-xs leading-tight">
      <span class="opacity-50">Semana</span>
      <span class="font-mono font-semibold">{week}</span>
    </div>
    {#if user}
      <span class="text-sm opacity-70 hidden lg:inline">{user.username}</span>
      <form method="POST" action="/logout">
        <button class="btn btn-ghost btn-sm" type="submit">Salir</button>
      </form>
    {:else}
      <a href="/login" class="btn btn-ghost btn-sm">Login</a>
      <a href="/signup" class="btn btn-primary btn-sm">Sign up</a>
    {/if}
  </div>
</nav>

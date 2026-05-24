<!--
  Top bar — club name + in-game date + balance + hamburger toggle.

  Story: HUD-UI-001 (layout shell, balance added 2026-05-21 overnight per audit)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import { formatEurCompact } from '$lib/format';

  interface Props {
    user: { username: string } | null;
    week?: number;
    dateDisplay?: string | undefined;
    /**
     * Sprint 12 walkthrough (Pablo Part B): long-form date for the topbar,
     * e.g. "Miércoles 24 de marzo de 2027". Falls back to `dateDisplay`
     * (short form) when undefined for backward compat.
     */
    dateDisplayLong?: string | undefined;
    balanceEurK?: number | null;
    inboxUnread?: number;
    showSidebarToggle?: boolean;
    onToggleSidebar?: () => void;
  }
  let {
    user,
    week = 0,
    dateDisplay,
    dateDisplayLong,
    balanceEurK = null,
    inboxUnread = 0,
    showSidebarToggle = true,
    onToggleSidebar,
  }: Props = $props();

  // Color-tier the balance for at-a-glance read.
  // < 0 → red ("debt"); 0..50 €K → warning yellow; > 50 €K → neutral.
  // Tuning informed by economy.md F5 (CRITICAL ≈ 3 weeks of costs ≈ ~50 €K for D2).
  const balanceClass = $derived.by(() => {
    if (balanceEurK === null) return 'opacity-50';
    if (balanceEurK < 0) return 'text-error font-bold';
    if (balanceEurK < 50) return 'text-warning';
    return '';
  });

  // a11y P1-6 (Sprint 11 task 11-3): non-color signal for distress states.
  // Reduced-color or screen-reader users get an icon prefix + explicit ARIA
  // label so the "negative balance" semantic survives without color.
  //   < 0  → ⚠ + "Balance crítico"  (negative balance, immediate attention)
  //   0–50 → ⚠ + "Balance bajo"     (warning tier)
  //   > 50 → no icon                (healthy)
  const balanceIcon = $derived.by(() => {
    if (balanceEurK === null || balanceEurK > 50) return '';
    return '⚠';
  });
  const balanceAriaLabel = $derived.by(() => {
    if (balanceEurK === null) return 'Ver finanzas';
    const compact = formatEurCompact(balanceEurK);
    if (balanceEurK < 0) return `Balance crítico: ${compact}. Ver finanzas.`;
    if (balanceEurK < 50) return `Balance bajo: ${compact}. Ver finanzas.`;
    return 'Ver finanzas';
  });
</script>

<nav class="navbar bg-base-200 px-4 sticky top-0 z-10 border-b border-base-300">
  {#if showSidebarToggle}
    <div class="md:hidden mr-2">
      <button
        class="btn btn-ghost btn-sm"
        aria-label="Toggle sidebar"
        onclick={onToggleSidebar}
      >
        ☰
      </button>
    </div>
  {/if}

  <div class="flex-1">
    <a href="/dashboard" class="btn btn-ghost text-xl font-bold">Total Soccer Manager</a>
  </div>

  <div class="flex-none gap-4 items-center">
    {#if dateDisplay}
      <div class="hidden sm:flex flex-col items-end text-xs leading-tight">
        <span class="opacity-50">Hoy</span>
        <span class="font-semibold">{dateDisplayLong ?? dateDisplay}</span>
      </div>
    {/if}
    <div class="hidden md:flex flex-col items-end text-xs leading-tight">
      <span class="opacity-50">{week === 0 ? '' : 'Semana'}</span>
      <span class="font-mono font-semibold">{week === 0 ? 'Pretemporada' : week}</span>
    </div>
    {#if balanceEurK !== null}
      <a
        href="/finance"
        class="hidden sm:flex flex-col items-end text-xs leading-tight no-underline hover:opacity-80"
        aria-label={balanceAriaLabel}
      >
        <span class="opacity-50">Balance</span>
        <span class="font-mono font-semibold {balanceClass}">
          {#if balanceIcon}<span aria-hidden="true" class="mr-0.5">{balanceIcon}</span>{/if}{formatEurCompact(balanceEurK)}
        </span>
      </a>
    {/if}
    {#if user}
      <a href="/inbox" class="btn btn-ghost btn-sm indicator" aria-label="Bandeja de entrada">
        {#if inboxUnread > 0}
          <span class="indicator-item badge badge-error badge-sm animate-pulse">
            {inboxUnread}
          </span>
        {/if}
        <span class="text-xl">📨</span>
      </a>
      <!-- Polish walkthrough fix (Pablo, post-Sprint-11): username becomes a
           dropdown with explicit "Cambiar partida" → /game. Previously the
           only way to reach /game was via the URL bar. -->
      <div class="dropdown dropdown-end">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          aria-label="Menú de usuario"
          aria-haspopup="menu"
        >
          <span class="hidden lg:inline">{user.username}</span>
          <span class="text-lg lg:hidden">👤</span>
        </button>
        <ul
          class="dropdown-content menu menu-sm bg-base-100 rounded-box z-20 mt-2 w-52 p-2 shadow border border-base-300"
          role="menu"
        >
          <li role="none">
            <a href="/game" role="menuitem">🎮 Cambiar partida</a>
          </li>
          <li role="none">
            <form method="POST" action="/logout" class="contents">
              <button type="submit" role="menuitem" class="w-full text-left">
                🚪 Salir
              </button>
            </form>
          </li>
        </ul>
      </div>
    {:else}
      <a href="/login" class="btn btn-ghost btn-sm">Login</a>
      <a href="/signup" class="btn btn-primary btn-sm">Sign up</a>
    {/if}
  </div>
</nav>

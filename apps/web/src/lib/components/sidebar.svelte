<!--
  Sidebar nav — links to all hud-ui pages + per-link notification dots.

  Story: HUD-UI-001 + MVP UX fixes (badges)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    open: boolean;
    badges: { pendingStops: number; unreadUrgent: number } | null | undefined;
  }
  let { open = $bindable(), badges }: Props = $props();

  // dotFor returns the count to display next to a nav link, or 0 for no badge.
  function dotFor(href: string): number {
    if (!badges) return 0;
    if (href === '/calendar') return badges.pendingStops;
    if (href === '/dashboard') return badges.unreadUrgent;
    return 0;
  }

  const links = [
    { href: '/dashboard',  icon: '📊', label: 'Dashboard' },
    { href: '/squad',      icon: '👥', label: 'Plantilla' },
    { href: '/staff',      icon: '🧑‍💼', label: 'Staff' },
    { href: '/finance',    icon: '💰', label: 'Finanzas' },
    { href: '/league',     icon: '🏆', label: 'Liga' },
    { href: '/calendar',   icon: '📅', label: 'Calendario' },
    { href: '/manager',    icon: '🧠', label: 'Mánager' },
  ] as const;
</script>

<aside
  class="bg-base-200 w-64 h-screen sticky top-0 transition-transform duration-200 z-20
         md:translate-x-0 {open ? 'translate-x-0' : '-translate-x-full'}
         md:relative absolute"
>
  <div class="p-4 border-b border-base-300">
    <div class="text-xs uppercase opacity-50 tracking-wide">Cascada FC</div>
    <div class="text-sm font-semibold">Manager dashboard</div>
  </div>
  <ul class="menu p-2 gap-1">
    {#each links as link}
      {@const dot = dotFor(link.href)}
      <li>
        <a
          href={link.href}
          class:active={$page.url.pathname.startsWith(link.href)}
        >
          <span class="text-lg">{link.icon}</span>
          <span class="flex-1">{link.label}</span>
          {#if dot > 0}
            <span class="badge badge-error badge-sm animate-pulse">{dot}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
</aside>

<!--
  Sidebar nav — links to all hud-ui pages.
  Mobile (<768px): collapses behind a hamburger button in the top bar.

  Story: HUD-UI-001
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    open: boolean;
  }
  let { open = $bindable() }: Props = $props();

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
      <li>
        <a
          href={link.href}
          class:active={$page.url.pathname.startsWith(link.href)}
        >
          <span class="text-lg">{link.icon}</span>
          <span>{link.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</aside>

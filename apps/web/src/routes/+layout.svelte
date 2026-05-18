<script lang="ts">
  import '../app.css';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<nav class="navbar bg-base-200 px-4">
  <div class="flex-1">
    <a href="/" class="btn btn-ghost text-xl font-bold">Cascada FC</a>
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

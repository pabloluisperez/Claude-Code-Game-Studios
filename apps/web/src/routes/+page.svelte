<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Total Soccer Manager — Football Manager</title>
</svelte:head>

<div class="hero min-h-[60vh]">
  <div class="hero-content text-center">
    <div class="max-w-xl">
      <h1 class="text-5xl font-bold">Total Soccer Manager</h1>
      <p class="py-6 text-lg opacity-80">
        Take a club from dirt pitch to Champions. Every decision ripples through the world.
      </p>
      {#if data.user}
        <a href="/game" class="btn btn-primary btn-lg">Continue Managing</a>
      {:else}
        <a href="/signup" class="btn btn-primary btn-lg mr-2">Get Started</a>
        <a href="/login" class="btn btn-ghost btn-lg">Sign in</a>
      {/if}
    </div>
  </div>
</div>

<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
  let loading = $state(false);
</script>

<svelte:head>
  <title>Sign In — Cascada FC</title>
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center">
  <div class="card bg-base-200 w-full max-w-sm shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl">Sign In</h2>

      {#if form?.error}
        <div role="alert" class="alert alert-error">
          <span>{form.error}</span>
        </div>
      {/if}

      <form
        method="POST"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            loading = false;
            await update();
          };
        }}
      >
        <div class="form-control mb-2">
          <label class="label" for="email"><span class="label-text">Email</span></label>
          <input id="email" name="email" type="email" class="input input-bordered" required />
        </div>

        <div class="form-control mb-4">
          <label class="label" for="password"><span class="label-text">Password</span></label>
          <input
            id="password"
            name="password"
            type="password"
            class="input input-bordered"
            required
          />
        </div>

        <button type="submit" class="btn btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p class="text-center text-sm">
        No account? <a href="/signup" class="link link-primary">Sign up</a>
      </p>
    </div>
  </div>
</div>

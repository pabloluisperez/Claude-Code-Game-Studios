<script lang="ts">
  import { clsx } from 'clsx';

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    class: className = '',
    onclick,
    children
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'error';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    onclick?: () => void;
    children?: import('svelte').Snippet;
  } = $props();

  const classes = $derived(
    clsx(
      'btn',
      variant === 'primary' && 'btn-primary',
      variant === 'secondary' && 'btn-secondary',
      variant === 'ghost' && 'btn-ghost',
      variant === 'error' && 'btn-error',
      size === 'sm' && 'btn-sm',
      size === 'lg' && 'btn-lg',
      loading && 'loading',
      className
    )
  );
</script>

<button {type} class={classes} disabled={disabled || loading} {onclick}>
  {@render children?.()}
</button>

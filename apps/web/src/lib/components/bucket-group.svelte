<!--
  BucketGroup — categorical button-group with danger zones.

  Ported from the prototype's `.bucket-group` CSS pattern. Pure
  presentation; emits `change` via two-way `bind:value`.

  Use this for any 3-5 option categorical decision (training intensity,
  formation aggressiveness, ticket bands, etc).

  Story: Library extraction — BucketGroup
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  interface Option {
    id: string;
    label: string;
    /** Optional tone: 'good' | 'warn' | 'bad' — drives the active colour. */
    danger?: 'good' | 'warn' | 'bad';
  }

  interface Props {
    options: readonly Option[];
    value: string;
    ariaLabel?: string;
  }

  let { options, value = $bindable(), ariaLabel = 'Selector' }: Props = $props();

  function selectOption(id: string) {
    value = id;
  }

  function toneClass(opt: Option, isActive: boolean): string {
    if (!isActive) return '';
    if (opt.danger === 'good') return 'is-good';
    if (opt.danger === 'warn') return 'is-warn';
    if (opt.danger === 'bad') return 'is-bad';
    return 'is-active';
  }
</script>

<div class="bucket-group" role="radiogroup" aria-label={ariaLabel}>
  {#each options as opt}
    {@const active = opt.id === value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      class="bucket-btn {toneClass(opt, active)}"
      onclick={() => selectOption(opt.id)}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .bucket-group {
    display: inline-flex;
    gap: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid rgba(120, 120, 130, 0.35);
    flex-wrap: nowrap;
  }
  .bucket-btn {
    flex: 1 1 auto;
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    border: 0;
    border-right: 1px solid rgba(120, 120, 130, 0.25);
    padding: 0.5rem 0.85rem;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.05s ease;
  }
  .bucket-btn:last-child { border-right: 0; }
  .bucket-btn:hover { background: rgba(255, 255, 255, 0.1); }
  .bucket-btn:active { transform: translateY(1px); }
  .bucket-btn.is-active { background: hsl(220, 80%, 50%); color: white; }
  .bucket-btn.is-good   { background: hsl(140, 65%, 40%); color: white; }
  .bucket-btn.is-warn   { background: hsl(40, 90%, 50%);  color: #1a1a1a; }
  .bucket-btn.is-bad    { background: hsl(0, 75%, 50%);   color: white; }
</style>

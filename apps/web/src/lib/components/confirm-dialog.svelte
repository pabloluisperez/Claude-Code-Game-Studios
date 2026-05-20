<!--
  ConfirmDialog — reusable confirmation modal.

  Usage:
    <ConfirmDialog
      bind:open
      title="Despedir a Marta"
      message="Su contrato se cancelará esta semana. ¿Estás seguro?"
      confirmLabel="Despedir"
      dangerous
      onConfirm={() => formEl?.requestSubmit()}
    />

  Story: Confirmation modals
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    dangerous?: boolean;
    onConfirm: () => void;
  }

  let {
    open = $bindable(),
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    dangerous = false,
    onConfirm,
  }: Props = $props();

  function handleConfirm() {
    open = false;
    onConfirm();
  }
  function handleCancel() {
    open = false;
  }
</script>

{#if open}
  <div class="modal modal-open" role="dialog" aria-modal="true">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg">{title}</h3>
      <p class="text-sm mt-2 leading-relaxed">{message}</p>
      <div class="modal-action">
        <button class="btn btn-ghost" type="button" onclick={handleCancel}>
          {cancelLabel}
        </button>
        <button
          class="btn {dangerous ? 'btn-error' : 'btn-primary'}"
          type="button"
          onclick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
    <div
      class="modal-backdrop"
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={handleCancel}
      onkeydown={(e) => e.key === 'Escape' && handleCancel()}
    ></div>
  </div>
{/if}

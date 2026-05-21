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
  A11y (Sprint 11 task 11-3): P1-1 focus trap + P1-2 focus return.
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

  // a11y P1-1 + P1-2 (Sprint 11 task 11-3):
  //   - Capture the element that had focus when the dialog opens.
  //   - When the dialog mounts, move focus inside (to the cancel button).
  //   - On close (confirm OR cancel), return focus to the original opener.
  let openerEl: HTMLElement | null = null;
  let cancelBtnEl = $state<HTMLButtonElement | null>(null);
  let confirmBtnEl = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (open) {
      if (typeof document !== 'undefined') {
        openerEl = document.activeElement as HTMLElement | null;
      }
      // Move focus into the dialog on the next microtask so the elements
      // are mounted. Default focus on the *cancel* button (least-destructive).
      queueMicrotask(() => cancelBtnEl?.focus());
    }
  });

  function returnFocus(): void {
    // Defer one microtask so {#if open} unmounts the dialog before we move
    // focus back; otherwise the focus stays trapped inside an unmounted node.
    queueMicrotask(() => openerEl?.focus());
  }

  function handleConfirm(): void {
    open = false;
    returnFocus();
    onConfirm();
  }
  function handleCancel(): void {
    open = false;
    returnFocus();
  }

  // a11y P1-1: focus trap. When Tab reaches the last focusable element and
  // user presses Tab forward → wrap to first. Shift+Tab from first → wrap
  // to last. Implementation cycles between cancel and confirm because the
  // dialog only contains those two interactive elements.
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      handleCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    if (!cancelBtnEl || !confirmBtnEl) return;

    const focused = document.activeElement;
    if (e.shiftKey) {
      if (focused === cancelBtnEl) {
        e.preventDefault();
        confirmBtnEl.focus();
      }
    } else {
      if (focused === confirmBtnEl) {
        e.preventDefault();
        cancelBtnEl.focus();
      }
    }
  }
</script>

{#if open}
  <!-- a11y P0-2 + P0-3 fix (production/qa/a11y-audit-2026-05-21.md):
       aria-labelledby links the dialog to its title; the keydown handler on
       the dialog root catches both ESC and the Tab focus-trap cycle. -->
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    tabindex="-1"
    onkeydown={handleKeyDown}
  >
    <div class="modal-box max-w-md">
      <h3 id="confirm-dialog-title" class="font-bold text-lg">{title}</h3>
      <p class="text-sm mt-2 leading-relaxed">{message}</p>
      <div class="modal-action">
        <button
          bind:this={cancelBtnEl}
          class="btn btn-ghost"
          type="button"
          onclick={handleCancel}
        >
          {cancelLabel}
        </button>
        <button
          bind:this={confirmBtnEl}
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
      aria-label="Cerrar diálogo"
      onclick={handleCancel}
      onkeydown={(e) => e.key === 'Escape' && handleCancel()}
    ></div>
  </div>
{/if}

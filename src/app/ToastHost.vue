<script setup lang="ts">
// Toast UI is owned by Vue. `toastState` stays the fact source because TS
// adapters (ReceiveFlow, exportParcel, AppShell) still publish notifications;
// this component only projects those facts into Reka's toast semantics.
// Reka timers are disabled: `toastState` already owns duration, including the
// sticky `duration: 0` case.
import { ToastAction, ToastDescription, ToastProvider, ToastRoot, ToastViewport } from "reka-ui";
import { toastState, type Toast } from "@/core/state";

defineProps<{ view: { toasts: Toast[] } }>();

function onAction(toast: Toast): void {
  toast.action?.onClick();
  toastState.remove(toast.id);
}
</script>

<template>
  <ToastProvider label="Уведомления" :duration="0">
    <ToastViewport class="toast-viewport" label="Уведомления">
      <ToastRoot
        v-for="toast in view.toasts"
        :key="toast.id"
        class="toast toast-enter"
        :data-toast-type="toast.type"
        :duration="0"
        @update:open="(open: boolean) => !open && toastState.remove(toast.id)"
      >
        <ToastDescription class="toast__message">{{ toast.message }}</ToastDescription>
        <ToastAction
          v-if="toast.action"
          class="toast-action"
          :alt-text="toast.action.label"
          :data-toast-id="toast.id"
          :close-on-click="false"
          @click="onAction(toast)"
        >
          {{ toast.action.label }}
        </ToastAction>
      </ToastRoot>
    </ToastViewport>
  </ToastProvider>
</template>

<style scoped>
:global(#toastContainer) {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  right: 12px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
  max-width: calc(100vw - 24px);
}

.toast-viewport {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 360px;
  padding: 0.625rem 1rem;
  border-left: 4px solid rgb(255 255 255 / 0.35);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px rgb(42 29 39 / 0.22);
  color: white;
  font-size: 14px;
  font-weight: 500;
  pointer-events: auto;
  animation: toast-slide-in 0.2s ease-out;
}

.toast[data-toast-type="error"] {
  background: var(--color-negative);
}

.toast[data-toast-type="warn"] {
  background: var(--color-warning);
}

.toast[data-toast-type="info"],
.toast[data-toast-type="success"] {
  background: var(--color-positive);
}

.toast__message {
  min-width: 0;
}

.toast-action {
  flex: none;
  padding: 0.15rem 0.4rem;
  border: 1px solid rgb(255 255 255 / 0.5);
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>

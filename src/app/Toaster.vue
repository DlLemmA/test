<script setup lang="ts">
// Reka owns the toast list, timers and dismissal. `toastState` is only the
// imperative entry point for callers outside components; this component just
// projects the manager's facts into the app's toast markup.
import { ToastAction, ToastDescription, ToastRoot, ToastViewport, useToastManager } from "reka-ui";
import type { ToastData } from "@/core/state";

const { toasts } = useToastManager<ToastData>();
</script>

<template>
  <ToastRoot
    v-for="toast in toasts"
    :key="toast.id"
    class="toast"
    :toast="toast"
    :data-toast-type="toast.data?.type"
  >
    <ToastDescription class="toast__message" />
    <ToastAction v-if="toast.actionProps" class="toast-action" :data-toast-id="toast.id" />
  </ToastRoot>
  <ToastViewport class="toast-viewport" label="Уведомления" />
</template>

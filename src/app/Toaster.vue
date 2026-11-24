<script setup lang="ts">
// Reka owns the toast list, timers and dismissal. `toastState` is only the
// imperative entry point for callers outside components; this component just
// projects the manager's facts into the app's toast markup.
import { ToastAction, ToastDescription, ToastRoot, ToastViewport, useToastManager } from "reka-ui";
import type { ToastType } from "@/core/state";
import AppIcon from "@/features/shared/ui/AppIcon.vue";

const { toasts } = useToastManager<{ type: ToastType }>();

const TYPE_ICONS = {
  info: "info",
  success: "checkCircle",
  warn: "alertTriangle",
  error: "xCircle",
} as const;

type ToastIcon = (typeof TYPE_ICONS)[keyof typeof TYPE_ICONS];

function iconFor(type: ToastType | undefined): ToastIcon {
  return TYPE_ICONS[type ?? "info"];
}
</script>

<template>
  <ToastRoot
    v-for="toast in toasts"
    :key="toast.id"
    class="toast"
    :toast="toast"
    :data-toast-type="toast.data?.type"
  >
    <AppIcon class="toast__icon" :name="iconFor(toast.data?.type)" />
    <ToastDescription class="toast__message" />
    <ToastAction v-if="toast.actionProps" class="toast-action" :data-toast-id="toast.id" />
  </ToastRoot>
  <ToastViewport class="toast-viewport" label="Уведомления" />
</template>

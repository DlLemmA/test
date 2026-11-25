<script setup lang="ts">
// Vue adapter for the app-level sheet contract: title + content + close.
// Reka owns focus, Escape, outside-press, scroll lock and swipe.
import { useTemplateRef } from "vue";
import {
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** Scoped selector for the field that should open the iOS keyboard. */
    initialFocus?: string;
    role?: "dialog" | "alertdialog";
  }>(),
  { initialFocus: undefined, role: "dialog" },
);
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const content = useTemplateRef<HTMLElement>("content");

/** Reka's default focus lands on the close button; focus the first field instead. */
function onOpenAutoFocus(event: Event): void {
  if (!props.initialFocus) return;
  const target = content.value?.querySelector<HTMLElement>(props.initialFocus);
  if (!target) return;
  event.preventDefault();
  target.focus();
}
</script>

<template>
  <DrawerRoot :open="open" @update:open="emit('update:open', $event)">
    <DrawerPortal>
      <DrawerOverlay class="app-drawer-overlay" />
      <DrawerContent class="app-drawer-content" :role="role" @open-auto-focus="onOpenAutoFocus">
        <DrawerHandle class="drawer-handle" />
        <div class="drawer-header">
          <DrawerTitle>{{ title }}</DrawerTitle>
          <DrawerClose class="drawer-close" aria-label="Закрыть">
            <AppIcon name="x" />
          </DrawerClose>
        </div>
        <div ref="content" class="drawer-content">
          <slot />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>

<style scoped>
.app-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(42 29 39 / 0.45);
}

.app-drawer-overlay[data-state="open"] {
  animation: app-drawer-fade-in 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-drawer-overlay[data-state="closed"] {
  animation: app-drawer-fade-out 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-drawer-content {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: 100%;
  max-width: 620px;
  max-height: 92dvh;
  margin: 0 auto;
  padding-inline: 1rem;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  background: var(--color-paper);
  border-radius: 1.25rem 1.25rem 0 0;
  box-shadow: 0 -8px 32px rgb(42 29 39 / 0.16);
  transform: translateY(var(--drawer-swipe-movement-y, 0px));
  transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
}

.app-drawer-content[data-state="open"] {
  animation: app-drawer-slide-in 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-drawer-content[data-state="closed"] {
  animation: app-drawer-slide-out 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-drawer-content[data-swiping] {
  transition-duration: 0ms;
}

@keyframes app-drawer-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes app-drawer-fade-out {
  to {
    opacity: 0;
  }
}

@keyframes app-drawer-slide-in {
  from {
    translate: 0 100%;
  }
}

@keyframes app-drawer-slide-out {
  to {
    translate: 0 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-drawer-overlay,
  .app-drawer-content {
    animation: none;
    transition: none;
  }
}
</style>

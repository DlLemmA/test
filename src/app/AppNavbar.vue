<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { AppRoute } from "./router";

const route = useRoute();
const TAB_ROUTES = ["parcels", "add", "people"] as const;

const activeRoute = computed<AppRoute>(() => {
  const name = route.name as AppRoute;
  if (name === "parcel") return "parcels";
  if (name === "customer") return "people";
  return name ?? "parcels";
});

const activeIndex = computed(() => {
  const index = TAB_ROUTES.indexOf(activeRoute.value as (typeof TAB_ROUTES)[number]);
  return index < 0 ? 0 : index;
});
</script>

<template>
  <div class="bottombar-wrap">
    <div class="bottombar-shadow" aria-hidden="true"></div>
    <nav id="bottombar" class="bottombar" aria-label="Основная навигация">
      <span
        class="bottombar-active"
        :style="{ '--active-index': activeIndex }"
        aria-hidden="true"
      ></span>
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'parcels' }"
        :to="{ name: 'parcels' }"
        :aria-current="activeRoute === 'parcels' ? 'page' : undefined"
      >
        <AppIcon name="package" />
        <span>Посылки</span>
      </RouterLink>
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'add' }"
        :to="{ name: 'add' }"
        :aria-current="activeRoute === 'add' ? 'page' : undefined"
      >
        <AppIcon name="plus" />
        <span>Создать</span>
      </RouterLink>
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'people' }"
        :to="{ name: 'people' }"
        :aria-current="activeRoute === 'people' ? 'page' : undefined"
      >
        <AppIcon name="users" />
        <span>Заказчики</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* Bottom bar — floating glass dock */
/* Safari clips an outer box-shadow on an element with backdrop-filter, and a
   shadow on an ancestor can break the blur, so it lives on a sibling layer. */
.bottombar-wrap {
  position: fixed;
  left: max(12px, env(safe-area-inset-left, 0px));
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: max(10px, env(safe-area-inset-bottom, 0px));
  z-index: 30;
  max-width: 42rem;
  margin-inline: auto;
  /* Safari repaints a fixed backdrop-filter layer while the page scrolls.
     Keep the dock on its own compositing layer so it does not flicker/jump. */
  transform: translateZ(0);
  will-change: transform;
}
.bottombar-shadow {
  position: absolute;
  inset: 0;
  border-radius: 26px;
  box-shadow:
    0 10px 30px rgb(42 29 39 / 0.12),
    0 2px 6px rgb(42 29 39 / 0.06);
  pointer-events: none;
}
.bottombar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid rgb(253 251 246 / 0.78);
  border-radius: 26px;
  background: rgb(253 251 246 / 0.86);
  background: linear-gradient(to bottom in oklab, rgb(253 251 246 / 0.92), rgb(247 244 237 / 0.86));
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.95),
    inset 0 -1px 0 rgb(216 27 96 / 0.08);
}
/* One pill slides behind the labels. Keeping it below the links avoids the
   tap-target repaint that came from restyling the active anchor itself. */
.bottombar-active {
  position: absolute;
  z-index: 0;
  top: 6px;
  bottom: 6px;
  left: 8px;
  inline-size: calc((100% - 16px) / 3);
  border-radius: 18px;
  background: var(--color-accent-soft);
  box-shadow:
    inset 0 0 0 1px rgb(216 27 96 / 0.18),
    0 1px 2px rgb(42 29 39 / 0.05);
  transform: translateX(calc(var(--active-index, 0) * 100%));
  pointer-events: none;
}
/* Opaque fallback where translucency is unavailable */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .bottombar {
    background: var(--color-paper);
  }
}
.bottombar-item {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-block-size: 44px;
  min-inline-size: 44px;
  padding: 6px 2px 5px;
  background: none;
  border: 0;
  border-radius: 18px;
  color: var(--color-ink-soft);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
/* Shape + surface, not color alone, marks the current tab */
.bottombar-item.active {
  color: var(--color-accent-strong);
}
/* The SVG is injected by AppIcon via v-html, so it carries no scope attribute. */
.bottombar-item.active :deep(.icon) {
  color: var(--color-accent);
}
.bottombar-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.bottombar-item :deep(.icon) {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .bottombar-active {
    transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .bottombar-item {
    transition:
      background-color 150ms ease-out,
      color 150ms ease-out,
      scale 150ms ease-out;
  }
  .bottombar-item:active {
    scale: 0.97;
  }
}

@media (forced-colors: active) {
  .bottombar-shadow {
    box-shadow: none;
  }
  .bottombar {
    background: Canvas;
    border-color: CanvasText;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .bottombar-active {
    border: 2px solid Highlight;
    background: Canvas;
    box-shadow: none;
  }
}
</style>

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

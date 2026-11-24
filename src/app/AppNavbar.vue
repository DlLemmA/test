<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { AppRoute } from "./router";

const route = useRoute();
const activeRoute = computed<AppRoute>(() => {
  const name = route.name as AppRoute;
  if (name === "parcel") return "parcels";
  if (name === "customer") return "people";
  return name ?? "parcels";
});

function onTabClick(): void {
  navigator.vibrate?.(10);
}
</script>

<template>
  <div class="bottombar-wrap">
    <div class="bottombar-shadow" aria-hidden="true"></div>
    <nav id="bottombar" class="bottombar" aria-label="Основная навигация">
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'parcels' }"
        :to="{ name: 'parcels' }"
        :aria-current="activeRoute === 'parcels' ? 'page' : undefined"
        @click="onTabClick"
      >
        <AppIcon name="package" />
        <span>Посылки</span>
      </RouterLink>
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'add' }"
        :to="{ name: 'add' }"
        :aria-current="activeRoute === 'add' ? 'page' : undefined"
        @click="onTabClick"
      >
        <AppIcon name="plus" />
        <span>Создать</span>
      </RouterLink>
      <RouterLink
        class="bottombar-item"
        :class="{ active: activeRoute === 'people' }"
        :to="{ name: 'people' }"
        :aria-current="activeRoute === 'people' ? 'page' : undefined"
        @click="onTabClick"
      >
        <AppIcon name="users" />
        <span>Заказчики</span>
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ToastProvider } from "reka-ui";
import { onScopeDispose, useTemplateRef, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { authReady, authSession } from "@/core/auth";
import { toastManager } from "@/core/state";
import AppHeader from "./AppHeader.vue";
import AppNavbar from "./AppNavbar.vue";
import { rememberMainScroll } from "./scroll";
import SignInView from "./SignInView.vue";
import { dbReady } from "./startup";
import Toaster from "./Toaster.vue";

const router = useRouter();
const route = useRoute();
const mainContent = useTemplateRef<HTMLElement>("mainContent");

function onMainScroll(): void {
  if (mainContent.value) rememberMainScroll(route.fullPath, mainContent.value.scrollTop);
}

watch(
  mainContent,
  (element, previous) => {
    previous?.removeEventListener("scroll", onMainScroll);
    element?.addEventListener("scroll", onMainScroll, { passive: true });
  },
  { immediate: true },
);
onScopeDispose(() => mainContent.value?.removeEventListener("scroll", onMainScroll));

watch(authSession, (session) => {
  if (!session && route.name !== "sign-in") {
    void router.replace({ name: "sign-in" });
  } else if (session && route.name === "sign-in") {
    const next = route.query.next;
    const target =
      typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/parcels";
    void router.replace(target);
  }
});
</script>

<template>
  <ToastProvider label="Уведомления" :toast-manager="toastManager">
    <div v-if="!authReady" class="auth-loading">Проверяем доступ…</div>
    <SignInView v-else-if="!authSession" />
    <div v-else-if="!dbReady" class="auth-loading">Загружаем данные…</div>

    <div v-else class="app-shell">
      <AppHeader />

      <main id="main-content" ref="mainContent" class="app-main">
        <div id="panel-container" class="view-panel" tabindex="-1">
          <RouterView />
        </div>
      </main>

      <AppNavbar />
    </div>

    <!-- Reka's viewport owns the live region; adding one here announces twice. -->
    <div id="toastContainer">
      <Toaster />
    </div>
  </ToastProvider>
</template>

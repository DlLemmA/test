<script setup lang="ts">
import { ToastProvider } from "reka-ui";
import { watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { authReady, authSession } from "@/core/auth";
import { toastManager } from "@/core/state";
import AppHeader from "./AppHeader.vue";
import AppNavbar from "./AppNavbar.vue";
import SignInView from "./SignInView.vue";
import { dbReady } from "./startup";
import Toaster from "./Toaster.vue";

const router = useRouter();
const route = useRoute();

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

      <main id="main-content" class="flex-1 px-4 pb-28 overflow-y-auto">
        <div id="panel-container" class="view-panel" tabindex="-1">
          <RouterView />
        </div>
      </main>

      <AppNavbar />
    </div>

    <div id="toastContainer" role="status" aria-live="polite">
      <Toaster />
    </div>
  </ToastProvider>
</template>

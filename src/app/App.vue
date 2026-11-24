<script setup lang="ts">
import { ToastProvider } from "reka-ui";
import { RouterView, useRouter } from "vue-router";
import { toastManager } from "@/core/state";
import AppHeader from "./AppHeader.vue";
import AppNavbar from "./AppNavbar.vue";
import type { AppRoute } from "./router";
import { dbReady } from "./startup";
import Toaster from "./Toaster.vue";

const router = useRouter();

function go(target: AppRoute): void {
  void router.push({ name: target });
}
</script>

<template>
  <ToastProvider label="Уведомления" :toast-manager="toastManager">
    <div v-if="dbReady" class="app-shell">
      <AppHeader @imported="go('parcels')" />

      <main id="main-content" class="flex-1 px-4 pb-28 overflow-y-auto">
        <div id="panel-container" style="view-transition-name: panel-root">
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

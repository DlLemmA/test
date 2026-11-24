// ============================================
// Application Entry Point — startup only.
// ============================================

import { createApp } from "vue";
import { authReady, authSession, initAuth, isTestSession, signOut } from "@/core/auth";
import { assertWorkspaceMember, refreshCache } from "@/core/cache";
import { toastState } from "@/core/state";
import { installTestSeam } from "@/core/testSeam";
import App from "./App.vue";
import { appRouter } from "./router";
import { dbReady } from "./startup";

installTestSeam();

async function init(): Promise<void> {
  try {
    await initAuth();
    if (authSession.value) {
      if (!isTestSession()) {
        await assertWorkspaceMember();
        await refreshCache();
      }
      dbReady.value = true;
    }
  } catch (err) {
    console.error("Failed to initialize app:", err);
    toastState.add({
      message: "Ошибка инициализации: " + (err instanceof Error ? err.message : String(err)),
      type: "error",
    });
    // A session without workspace membership (or an unreachable cache) must not
    // leave the shell stuck in "Загружаем данные…". Clear it and offer sign-in.
    if (authSession.value) {
      try {
        await signOut();
      } catch {
        authSession.value = null;
      }
    }
    authReady.value = true;
  }

  const app = createApp(App);
  app.use(appRouter);
  app.mount("#app");
  await appRouter.isReady();
  console.log("App initialized");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

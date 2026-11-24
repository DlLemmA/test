// ============================================
// Application Entry Point — startup only.
// ============================================

import { createApp } from "vue";
import { db } from "@/core/database";
import {
  ITEM_STATUSES,
  PARCEL_STATUSES,
  PAYMENT_TYPES,
  UNITS,
  replaceAll,
  type DbSnapshot,
} from "@/core/dbSchema";
import { toastState } from "@/core/state";
import App from "./App.vue";
import { appRouter } from "./router";
import { dbReady } from "./startup";

// ---- Initialize ----
async function init(): Promise<void> {
  try {
    await db.open();
    dbReady.value = true;
  } catch (err) {
    console.error("Failed to initialize app:", err);
    toastState.add({
      message: "Ошибка инициализации: " + (err instanceof Error ? err.message : String(err)),
      type: "error",
    });
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

// Export for debugging and e2e fixtures. The schema seam lets fixtures replace
// all tables atomically without duplicating storage strings or JSON codecs.
declare global {
  interface Window {
    appDb: typeof db;
    appSchema: {
      parcelStatus: typeof PARCEL_STATUSES;
      itemStatus: typeof ITEM_STATUSES;
      paymentType: typeof PAYMENT_TYPES;
      unit: typeof UNITS;
      replaceAll(snapshot: DbSnapshot): Promise<void>;
    };
  }
}
window.appDb = db;
window.appSchema = {
  parcelStatus: PARCEL_STATUSES,
  itemStatus: ITEM_STATUSES,
  paymentType: PAYMENT_TYPES,
  unit: UNITS,
  replaceAll: (snapshot) => replaceAll(db, snapshot),
};

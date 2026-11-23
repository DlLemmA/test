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
import { createListenerScope } from "@/core/listeners";
import { toastState } from "@/core/state";
import { mountAppShell } from "./AppShell";
import { appRouter } from "./router";
import { mountToastHost } from "./toastRendering";

// ---- Initialize ----
async function init(): Promise<void> {
  try {
    await db.open();

    // vue-router starts on install. This app owns the router for the whole
    // session, so disposing a view cannot reset navigation state.
    const routerHost = createApp({ name: "RouterHost", render: () => null });
    routerHost.use(appRouter);
    routerHost.mount(document.createElement("div"));

    const scope = createListenerScope();
    const toastContainer = document.getElementById("toastContainer");
    if (toastContainer) mountToastHost(toastContainer);
    await mountAppShell(scope);

    console.log("App initialized");
  } catch (err) {
    console.error("Failed to initialize app:", err);
    toastState.add({
      message: "Ошибка инициализации: " + (err instanceof Error ? err.message : String(err)),
      type: "error",
    });
  }
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

// ============================================
// Application Entry Point — startup only.
// ============================================

import { db } from "@/core/database";
import {
  ITEM_STATUSES,
  PARCEL_STATUSES,
  PAYMENT_TYPES,
  UNITS,
  replaceAll,
  type DbSnapshot,
} from "@/core/dbSchema";
import { createListenerScope, type ListenerScope } from "@/core/listeners";
import { toastState } from "@/core/state";
import { esc } from "@/core/utils";
import { mountAppShell } from "./AppShell";

// ---- Toast Rendering ----
function setupToastRendering(scope: ListenerScope): void {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  toastState.subscribe((toasts) => {
    container.innerHTML = toasts
      .map(
        (t) => `
      <div class="toast toast-enter" style="background-color: ${toastColor(t.type)}">
        ${esc(t.message)}
        ${t.action ? `<button class="toast-action">${esc(t.action.label)}</button>` : ""}
      </div>
    `,
      )
      .join("");

    container.querySelectorAll(".toast-action").forEach((btn, idx) => {
      const toast = toasts[idx];
      if (toast?.action) {
        scope.on(btn, "click", () => {
          toast.action!.onClick();
          toastState.remove(toast.id);
        });
      }
    });
  });
}

function toastColor(type: string): string {
  switch (type) {
    case "error":
      return "#b42318";
    case "warn":
      return "#92400e";
    case "success":
      return "#0f7b5a";
    default:
      return "#0f7b5a";
  }
}

// ---- Initialize ----
async function init(): Promise<void> {
  try {
    await db.open();

    const scope = createListenerScope();
    setupToastRendering(scope);
    mountAppShell(scope);

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

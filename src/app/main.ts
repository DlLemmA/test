// ============================================
// Application Entry Point
// ============================================

import { db } from "@/core/database";
import { renderParcelListView } from "@/features/parcels/ParcelListView";
import { renderParcelDetailView } from "@/features/parcels/ParcelDetailView";
import { renderParcelAddView } from "@/features/parcels/ParcelAddView";
import { renderCustomersView } from "@/features/customers/CustomersView";
import { renderCustomerDetailView } from "@/features/customers/CustomerDetailView";
import { seedDemo } from "@/core/demo-seed";
import { router, initRouterFromHash } from "@/core/state";
import { uiState } from "@/core/state";
import { toastState } from "@/core/state";
import { modalStateAPI } from "@/core/state";
import { scannerStateAPI } from "@/core/state";
import { on } from "@/core/listeners";
import { I, esc, t } from "@/core/utils";
import { CUSTOMER_FORMS } from "@/features/customers/ui/CustomerPresentation";
import { ITEM_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";

// ---- Toast Rendering ----
function setupToastRendering(): void {
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

    // Bind action buttons
    container.querySelectorAll(".toast-action").forEach((btn, idx) => {
      const toast = toasts[idx];
      if (toast?.action) {
        on(btn, "click", () => {
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

// ---- Modal Rendering ----
function setupModalRendering(): void {
  modalStateAPI.subscribe((_state) => {
    // Modal is rendered by drawer.ts directly into #modal-root
  });
}

// ---- Scanner State ----
function setupScannerState(): void {
  scannerStateAPI.subscribe((_state) => {
    // Could update UI indicators
  });
}

// ---- Bottom Bar ----
function renderBottomBar(): void {
  const root = document.getElementById("bottombar");
  if (!root) return;

  const currentRoute = router.currentRoute;

  root.innerHTML = `
      <button class="bottombar-item ${currentRoute === "parcels" ? "active" : ""}" data-tab="parcels" aria-current="${currentRoute === "parcels" ? "page" : "false"}">
        ${I.history}<span>Посылки</span>
      </button>
      <button class="bottombar-item ${currentRoute === "add" ? "active" : ""}" data-tab="create" aria-label="Создать партию" aria-current="${currentRoute === "add" ? "page" : "false"}">
        ${I.plus}<span>Создать</span>
      </button>
      <button class="bottombar-item ${currentRoute === "people" ? "active" : ""}" data-tab="people" aria-current="${currentRoute === "people" ? "page" : "false"}">
        ${I.users}<span>Заказчики</span>
      </button>
  `;

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => {
      navigator.vibrate?.(10); // haptic feedback
      const tab = b.dataset.tab as "parcels" | "create" | "people";
      if (tab === "create") {
        router.navigate("add");
      } else {
        router.navigate(tab);
        renderBottomBar();
      }
    });
  });
}

function bindHeader(): void {
  const backupBtn = document.getElementById("backupBtn");
  if (backupBtn) {
    on(backupBtn, "click", () => openBackupModal());
  }

  const demoBtn = document.getElementById("demoBtn");
  if (demoBtn) {
    on(demoBtn, "click", async () => {
      const { confirmDrawer } = await import("@/core/drawer");
      confirmDrawer(
        "Загрузить демо-данные",
        "Это заменит ВСЕ текущие данные (заказчики, посылки, товары). Продолжить?",
        "Загрузить",
        async () => {
          await seedDemo(true);
          toastState.add({ message: "Демо-данные загружены", type: "success" });
          const route = router.currentRoute;
          if (route === "parcels") renderParcelListView();
          if (route === "people") renderCustomersView();
        },
      );
    });
  }
}

// ---- Backup/Restore ----
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function openBackupModal(): Promise<void> {
  const { drawer, confirmDrawer } = await import("@/core/drawer");
  const { downloadBackup, importBackup } = await import("@/core/backup");

  drawer(
    "База / резерв",
    `
    <div class="panel">
      <h3>Экспорт базы (JSON)</h3>
      <p class="muted">Заказчики, посылки, товары и платежи.</p>
      <button id="downloadDb" class="secondary">${I.download} Скачать базу</button>
    </div>
    <div class="panel" style="margin-top:12px">
      <h3>Импорт базы</h3>
      <p class="muted">Текущие данные будут полностью заменены.</p>
      <input type="file" id="dbFile" accept=".json,application/json">
      <button id="uploadDb" class="secondary" style="margin-top:8px">${I.upload} Загрузить и заменить</button>
    </div>
  `,
  );

  on(document.getElementById("downloadDb"), "click", async () => {
    try {
      await downloadBackup();
      toastState.add({ message: "База скачана", type: "success" });
    } catch (err) {
      toastState.add({ message: "Не удалось скачать базу: " + errorMessage(err), type: "error" });
    }
  });

  on(document.getElementById("uploadDb"), "click", async () => {
    const file = (document.getElementById("dbFile") as HTMLInputElement | null)?.files?.[0];
    if (!file) {
      toastState.add({ message: "Выберите файл .json", type: "warn" });
      return;
    }

    confirmDrawer(
      "Заменить базу",
      "Это заменит ВСЕ текущие данные. Продолжить?",
      "Заменить",
      async () => {
        try {
          const result = await importBackup(await file.text());
          router.navigate("parcels");
          toastState.add({
            message: `База загружена: ${t(CUSTOMER_FORMS, result.customers)}, ${t(PARCEL_FORMS, result.parcels)}, ${t(ITEM_FORMS, result.items)}`,
            type: "success",
          });
        } catch (err) {
          toastState.add({ message: "Ошибка импорта: " + errorMessage(err), type: "error" });
        }
      },
    );
  });
}

// ---- Initialize ----
async function init(): Promise<void> {
  try {
    // Initialize database
    await db.open();

    // Setup reactive rendering
    setupToastRendering();
    setupModalRendering();
    setupScannerState();

    // Initial render
    renderParcelListView();
    renderBottomBar();
    bindHeader();

    // Subscribe to route changes
    router.subscribe((route, params) => {
      renderBottomBar();
      // Show/hide panels
      const panelParcel = document.getElementById("panel-parcel");
      const panelPeople = document.getElementById("panel-people");
      const panelParcelList = document.getElementById("panel-parcels");
      const panelParcelAdd = document.getElementById("panel-parcel-add");
      const panelCustomerDetail = document.getElementById("panel-customer-detail");

      if (panelParcel) panelParcel.hidden = route !== "parcel";
      if (panelPeople) panelPeople.hidden = route !== "people";
      if (panelParcelList) panelParcelList.hidden = route !== "parcels";
      if (panelParcelAdd) panelParcelAdd.hidden = route !== "add";
      if (panelCustomerDetail) panelCustomerDetail.hidden = route !== "customer";

      if (route === "parcels") renderParcelListView();
      if (route === "people") renderCustomersView();
      if (route === "customer") {
        const customerId = parseInt(params.customerId || "0");
        if (customerId) renderCustomerDetailView(customerId);
      }
      if (route === "parcel") {
        const parcelId = parseInt(params.parcelId || "0");
        if (parcelId) {
          uiState.setCurrentParcelId(parcelId);
        }
        renderParcelDetailView();
      }
      if (route === "add") {
        renderParcelAddView();
      }
    });

    // Initialize router from current hash (triggers initial route)
    initRouterFromHash();

    console.log("App initialized");
  } catch (err) {
    console.error("Failed to initialize app:", err);
    toastState.add({
      message: "Ошибка инициализации: " + (err instanceof Error ? err.message : String(err)),
      type: "error",
    });
  }
}

// Start app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Export for debugging
declare global {
  interface Window {
    appDb: typeof db;
  }
}
window.appDb = db;

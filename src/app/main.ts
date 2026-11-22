// ============================================
// Application Entry Point
// ============================================

import { db } from "@/core/database";
import { initializeApp } from "@/features/shared/services";
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
import { I, esc } from "@/core/utils";

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
      return "#986000";
    case "success":
      return "#137a50";
    default:
      return "#137a50";
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
      <button class="bottombar-item center-add" data-tab="create" aria-label="Создать посылку">
        ${I.plus}
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

async function createNewParcel(): Promise<void> {
  const { parcelRepository } = await import("@/features/parcels/infrastructure");
  const parcels = await parcelRepository.findAll();
  // Find last draft parcel, or create new one
  const lastDraft = parcels.find((p) => p.status === "draft");
  let parcel;
  if (lastDraft) {
    parcel = lastDraft;
  } else {
    const { parcelServiceInstance } = await import("@/features/shared/services");
    parcel = await parcelServiceInstance.createParcel();
  }
  router.navigate("parcel", { parcelId: String(parcel.id) });
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
async function openBackupModal(): Promise<void> {
  const { drawer } = await import("@/core/drawer");

  drawer(
    "База / резерв",
    `
    <div class="panel">
      <h3>Экспорт базы (JSON)</h3>
      <button id="downloadDb" class="secondary">${I.download} Скачать базу</button>
    </div>
    <div class="panel" style="margin-top:12px">
      <h3>Импорт базы</h3>
      <input type="file" id="dbFile" accept=".json">
      <button id="uploadDb" class="secondary" style="margin-top:8px">${I.upload} Загрузить и заменить</button>
    </div>
  `,
  );

  on(document.getElementById("downloadDb"), "click", async () => {
    const customers = await db.customers.toArray();
    const parcels = await db.parcels.toArray();
    const parcelItems = await db.parcelItems.toArray();
    const data = { customers, parcels, parcelItems, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinduoduo-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  on(document.getElementById("uploadDb"), "click", async () => {
    const file = (document.getElementById("dbFile") as HTMLInputElement).files?.[0];
    if (!file) {
      toastState.add({ message: "Выберите файл", type: "warn" });
      return;
    }

    const { confirmDrawer } = await import("@/core/drawer");
    confirmDrawer(
      "Заменить базу",
      "Это заменит ВСЕ текущие данные. Продолжить?",
      "Заменить",
      async () => {
        await file.arrayBuffer();
        toastState.add({
          message: "Импорт требует реализации",
          type: "warn",
        });
      },
    );
  });
}

// ---- Initialize ----
async function init(): Promise<void> {
  try {
    // Initialize database
    await db.open();

    // Initialize app (create self customer if needed)
    await initializeApp();

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

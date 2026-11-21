// ============================================
// Application Entry Point
// ============================================

import { db } from "@/core/database";
import { initializeApp } from "@/features/shared/services";
import { renderHistoryView } from "@/features/orders/OrdersView";
import { renderCustomersView } from "@/features/customers/CustomersView";
import { seedDemo } from "@/core/demo-seed";
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

    // Auto-dismiss handled in state
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
    // Modal is rendered by sheet.ts directly into #modal-root
    // This is just for syncing state if needed
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

  root.innerHTML = `
    <nav class="bottombar" role="navigation" aria-label="Основная навигация">
      <button class="bottombar-item ${uiState.currentTab === "orders" ? "active" : ""}" data-tab="orders" aria-current="${uiState.currentTab === "orders" ? "page" : "false"}">
        ${I.history}<span>Заказы</span>
      </button>
      <button class="bottombar-item ${uiState.currentTab === "order" ? "active" : ""}" data-tab="order" aria-current="${uiState.currentTab === "order" ? "page" : "false"}">
        ${I.package}<span>Текущий</span>
      </button>
      <button class="bottombar-item ${uiState.currentTab === "people" ? "active" : ""}" data-tab="people" aria-current="${uiState.currentTab === "people" ? "page" : "false"}">
        ${I.users}<span>Заказчики</span>
      </button>
    </nav>
  `;

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => {
      const tab = b.dataset.tab as "orders" | "order" | "people";
      uiState.setTab(tab);
      renderBottomBar();
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
        "Это заменит ВСЕ текущие данные (заказчики, заказы, товары). Продолжить?",
        "Загрузить",
        async () => {
          await seedDemo(true);
          toastState.add({ message: "Демо-данные загружены", type: "success" });
          if (uiState.currentTab === "orders") renderHistoryView();
          if (uiState.currentTab === "people") renderCustomersView();
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
      <input type="file" id="dbFile" accept="on">
      <button id="uploadDb" class="secondary" style="margin-top:8px">${I.upload} Загрузить и заменить</button>
    </div>
  `,
  );

  on(document.getElementById("downloadDb"), "click", async () => {
    // Export all data as JSON
    const customers = await db.customers.toArray();
    const orders = await db.orders.toArray();
    const items = await db.items.toArray();
    const data = { customers, orders, items, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinduoduo-backup-${new Date().toISOString().split("T")[0]}on`;
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
        new (await import("dexie")).Dexie("pinduoduo-db");
        // Note: Full restore would need Dexie's import/export API
        toastState.add({
          message: "Импорт через Dexie требует отдельной реализации",
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
    renderHistoryView();
    renderBottomBar();
    bindHeader();

    // Subscribe to tab changes
    uiState.subscribeTab((tab) => {
      renderBottomBar();
      // Show/hide panels
      const panelOrder = document.getElementById("panel-order");
      const panelPeople = document.getElementById("panel-people");
      const panelHistory = document.getElementById("panel-history");
      if (panelOrder) panelOrder.hidden = tab !== "order";
      if (panelPeople) panelPeople.hidden = tab !== "people";
      if (panelHistory) panelHistory.hidden = tab !== "orders";

      if (tab === "orders") renderHistoryView();
      if (tab === "people") renderCustomersView();
      if (tab === "order") {
        // renderOrderView is auto-called by OrdersView subscription
      }
    });

    uiState.subscribeOrder(() => {
      if (uiState.currentTab === "order") {
        // renderOrderView() is called by OrdersView subscription
      }
    });

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

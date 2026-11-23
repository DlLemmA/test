// ============================================
// AppShell — the single owner of routing and view lifetime.
// ============================================

import "./appShell.css";
import { watch } from "vue";
import type { RouteLocationNormalized } from "vue-router";
import type { ListenerScope } from "@/core/listeners";
import { toastState } from "@/core/state";
import { I, t } from "@/core/utils";
import { seedDemo } from "@/core/demo-seed";
import { mountParcelListView } from "@/features/parcels/ParcelListView";
import { mountParcelDetailView } from "@/features/parcels/ParcelDetailView";
import { mountParcelAddView } from "@/features/parcels/ParcelAddView";
import { mountCustomersView } from "@/features/customers/CustomersView";
import { mountCustomerDetailView } from "@/features/customers/CustomerDetailView";
import { CUSTOMER_FORMS } from "@/features/customers/ui/CustomerPresentation";
import { ITEM_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import { appRouter, screenFromLocation, type AppRoute } from "./router";
import type { ViewHandle, ViewMount } from "./ViewHandle";

interface Screen {
  panelId: string;
  viewId: string;
  mount: ViewMount;
}

const SCREENS: Record<AppRoute, Screen> = {
  parcels: { panelId: "panel-parcels", viewId: "parcelListView", mount: mountParcelListView },
  parcel: { panelId: "panel-parcel", viewId: "parcelView", mount: mountParcelDetailView },
  people: { panelId: "panel-people", viewId: "peopleView", mount: mountCustomersView },
  customer: {
    panelId: "panel-customer-detail",
    viewId: "customerDetailView",
    mount: mountCustomerDetailView,
  },
  add: { panelId: "panel-parcel-add", viewId: "parcelAddView", mount: mountParcelAddView },
};

type Go = (route: AppRoute) => void;

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`AppShell: missing #${id}`);
  return el;
}

function mountBottomBar(scope: ListenerScope, go: Go): { update(route: AppRoute): void } {
  const root = document.getElementById("bottombar");
  if (!root) return { update: () => {} };

  // One delegated listener survives every re-render of the bar itself.
  scope.on(root, "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]");
    if (!button) return;
    navigator.vibrate?.(10);
    const tab = button.dataset.tab;
    if (tab === "create") go("add");
    else if (tab === "parcels") go("parcels");
    else if (tab === "people") go("people");
  });

  return {
    update(route: AppRoute): void {
      root.innerHTML = `
        <button class="bottombar-item ${route === "parcels" ? "active" : ""}" data-tab="parcels" aria-current="${route === "parcels" ? "page" : "false"}">
          ${I.history}<span>Посылки</span>
        </button>
        <button class="bottombar-item ${route === "add" ? "active" : ""}" data-tab="create" aria-label="Создать партию" aria-current="${route === "add" ? "page" : "false"}">
          ${I.plus}<span>Создать</span>
        </button>
        <button class="bottombar-item ${route === "people" ? "active" : ""}" data-tab="people" aria-current="${route === "people" ? "page" : "false"}">
          ${I.users}<span>Заказчики</span>
        </button>
      `;
    },
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function openBackupModal(scope: ListenerScope, go: Go): Promise<void> {
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

  scope.on(document.getElementById("downloadDb"), "click", async () => {
    try {
      await downloadBackup();
      toastState.add({ message: "База скачана", type: "success" });
    } catch (err) {
      toastState.add({ message: "Не удалось скачать базу: " + errorMessage(err), type: "error" });
    }
  });

  scope.on(document.getElementById("uploadDb"), "click", async () => {
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
          go("parcels");
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

function bindHeader(scope: ListenerScope, go: Go, refresh: () => void): void {
  const demoBtn = document.getElementById("demoBtn");
  if (demoBtn) {
    scope.on(demoBtn, "click", async () => {
      const { confirmDrawer } = await import("@/core/drawer");
      confirmDrawer(
        "Загрузить демо-данные",
        "Это заменит ВСЕ текущие данные (заказчики, посылки, товары). Продолжить?",
        "Загрузить",
        async () => {
          await seedDemo(true);
          toastState.add({ message: "Демо-данные загружены", type: "success" });
          refresh();
        },
      );
    });
  }

  const backupBtn = document.getElementById("backupBtn");
  if (backupBtn) {
    scope.on(backupBtn, "click", () => void openBackupModal(scope, go));
  }
}

/** Mount once at startup: from here on, every route change has exactly one owner. */
export async function mountAppShell(scope: ListenerScope): Promise<void> {
  const screens = new Map<AppRoute, { panel: HTMLElement; view: HTMLElement; mount: ViewMount }>();
  for (const route of Object.keys(SCREENS) as AppRoute[]) {
    const screen = SCREENS[route];
    screens.set(route, {
      panel: element(screen.panelId),
      view: element(screen.viewId),
      mount: screen.mount,
    });
  }

  let refreshCurrent = (): void => {};

  function go(route: AppRoute): void {
    if (appRouter.currentRoute.value.name === route) refreshCurrent();
    else void appRouter.push({ name: route });
  }

  const bottomBar = mountBottomBar(scope, go);
  bindHeader(scope, go, () => refreshCurrent());

  let activeRoute: AppRoute | null = null;
  let generation = 0;
  const mounted = new Map<AppRoute, ViewHandle>();

  function activate(location: RouteLocationNormalized): void {
    const { route, params } = screenFromLocation(location);
    const screen = screens.get(route);
    if (!screen) return;

    for (const [other, entry] of screens) entry.panel.hidden = other !== route;

    if (activeRoute && activeRoute !== route) {
      mounted.get(activeRoute)?.dispose();
      mounted.delete(activeRoute);
    }

    let view = mounted.get(route);
    if (!view) {
      view = screen.mount(screen.view);
      mounted.set(route, view);
    }
    activeRoute = route;

    const ticket = ++generation;
    void Promise.resolve(view.render(params)).catch((err) => {
      if (ticket !== generation) return;
      console.error("View render failed:", err);
      toastState.add({ message: "Не удалось отобразить экран", type: "error" });
    });

    bottomBar.update(route);
  }

  refreshCurrent = () => activate(appRouter.currentRoute.value);

  // vue-router owns the URL; watch is the one notification source for views.
  await appRouter.isReady();
  watch(
    () => appRouter.currentRoute.value,
    (to) => activate(to),
    { immediate: true },
  );
}

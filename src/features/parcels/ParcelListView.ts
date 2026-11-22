import { parcelRepository } from "./infrastructure";

declare global {
  interface Window {
    XLSX?: any;
  }
}
import {
  parcelServiceInstance as parcelService,
  parcelItemServiceInstance as parcelItemService,
} from "@/features/shared/services";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, kg, money } from "@/core/utils";
import { Parcel } from "./domain";

// ============================================
// Parcel List View (Parcels Tab)
// ============================================

export async function renderParcelListView(): Promise<void> {
  const root = document.getElementById("parcelListView");
  if (!root) return;

  const parcels = await parcelRepository.findAll();

  // Compute items count and total BYN for each parcel
  const itemsCounts = await Promise.all(parcels.map((p) => getParcelItemsCount(p)));
  const totalsBYN = await Promise.all(parcels.map((p) => getParcelTotalBYN(p)));

  root.innerHTML = `
    <section class="section">
      <header class="section-title">Посылки</header>
      ${
        parcels.length
          ? parcels
              .map(
                (p, i) => `
          <div class="item flex items-center justify-between gap-3 cursor-pointer" data-open="${p.id}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <b class="truncate">${p.name ? p.name : `Посылка №${p.id}`}</b>
                <span class="pill pill-${p.statusClass} shrink-0">${esc(p.statusLabel)}</span>
              </div>
              <span class="block text-sm muted mt-0.5">
                ${[p.shippedAt && `отпр. ${new Date(p.shippedAt).toLocaleDateString("ru-RU")}`, p.receivedAt && `пол. ${new Date(p.receivedAt).toLocaleDateString("ru-RU")}`, `${itemsCounts[i]} тов.`, money(totalsBYN[i])].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="btn-icon btn-secondary" data-open="${p.id}" aria-label="Открыть">${I.chevronRight}</button>
              <button class="btn-icon btn-secondary" data-export="${p.id}" aria-label="Экспорт">${I.sheet}</button>
              <button class="btn-icon btn-danger" data-del="${p.id}" aria-label="Удалить">${I.trash}</button>
            </div>
          </div>
        `,
              )
              .join("")
          : '<div class="empty">Нет посылок. Нажмите "+" чтобы создать.</div>'
      }
    </section>
  `;

  bindParcelListActions();
}

async function getParcelItemsCount(parcel: Parcel): Promise<number> {
  const { parcelItemRepository } = await import("./infrastructure");
  const items = await parcelItemRepository.findByParcelId(parcel.id);
  return items.length;
}

async function getParcelTotalBYN(parcel: Parcel): Promise<number> {
  const { parcelItemRepository } = await import("./infrastructure");
  const items = await parcelItemRepository.findByParcelId(parcel.id);
  return items.reduce((sum, item) => sum + item.totalPriceBYN, 0);
}

function bindParcelListActions(): void {
  document.querySelectorAll("[data-open]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => {
      const id = parseInt(b.dataset.open!);
      router.navigate("parcel", { parcelId: String(id) });
    });
  });

  document.querySelectorAll("[data-export]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      const parcelId = parseInt(b.dataset.export!);
      const parcel = await parcelRepository.findById(parcelId);
      if (parcel) exportParcel(parcel);
    });
  });

  document.querySelectorAll("[data-del]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      await deleteParcel(parseInt(b.dataset.del!));
    });
  });
}

// ============================================
// Excel Export
// ============================================

async function exportParcel(parcel: Parcel): Promise<void> {
  if (!window.XLSX) {
    toastState.add({ message: "Загрузка Excel...", type: "info", duration: 0 });
    try {
      await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" as any);
    } catch {
      toastState.add({ message: "Библиотека Excel не загрузилась", type: "warn" });
      return;
    }
    toastState.add({ message: "", type: "info", duration: 1 });
  }

  if (!window.XLSX) return;

  // Import here to avoid circular deps
  const { parcelItemRepository } = await import("./infrastructure");
  const { calculateCustomerBalance, createEmptyPaymentState } = await import("./domain");
  const { customerRepository } = await import("@/features/customers/infrastructure");
  const { customerService } = await import("@/features/shared/services");

  const items = await parcelItemRepository.findByParcelId(parcel.id);
  const customers = await customerRepository.findAll();
  const selfCustomer = await customerService.getSelfCustomer();
  const selfCustomerId = selfCustomer?.id;
  const paymentState = createEmptyPaymentState();
  const balances = calculateCustomerBalance(items, customers, parcel, paymentState, selfCustomerId);

  const wb = window.XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  // Summary
  rows.push(["ОБЩАЯ СВОДКА ПОСЫЛКИ"]);
  rows.push(["Статус", parcel.statusLabel]);
  rows.push(["Дата создания", parcel.formattedDate]);
  if (parcel.shippedAt) rows.push(["Дата отправки", parcel.shippedAt]);
  if (parcel.receivedAt) rows.push(["Дата получения", parcel.receivedAt]);
  if (parcel.boxWeightG) rows.push(["Вес коробки, кг", kg(parcel.boxWeightG)]);
  if (parcel.shippingCostBYN) rows.push(["Стоимость доставки, BYN", money(parcel.shippingCostBYN)]);
  rows.push(["Всего товаров", items.length]);
  rows.push([]);

  // Per customer
  rows.push(["СВОДКА ПО ЗАКАЗЧИКАМ"]);
  rows.push([
    "Заказчик",
    "Товаров",
    "Сумма товаров, BYN",
    "Доля доставки, BYN",
    "Итого должен, BYN",
    "Оплачено, BYN",
    "Остаток, BYN",
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  for (const [customerId, balance] of balances) {
    const customer = customerMap.get(customerId);
    const customerItems = items.filter((i) => i.customerId === customerId);
    rows.push([
      customer?.name || "",
      customerItems.length,
      money(balance.owed - (parcel.shippingCostBYN ? balance.owed * 0.3 : 0)), // approximate
      money(parcel.shippingCostBYN ? balance.owed * 0.3 : 0),
      money(balance.owed),
      money(balance.paid),
      money(balance.remaining),
    ]);
  }
  rows.push([]);

  // Items
  rows.push(["ТОВАРЫ"]);
  rows.push([
    "Заказчик",
    "Товар",
    "Цена юань",
    "Цена BYN",
    "Кол-во",
    "Ед.",
    "Трек-номера",
    "Веса (г)",
    "Статус",
    "Сумма BYN",
  ]);
  for (const item of items) {
    const customer = customerMap.get(item.customerId);
    rows.push([
      customer?.name || "",
      item.name,
      item.priceCNY,
      item.priceBYN,
      item.quantity,
      item.unitLabel,
      item.trackNumbers.join(", ") || "—",
      item.weightsG.join(", ") || "—",
      item.statusLabel,
      money(item.totalPriceBYN),
    ]);
  }

  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), "Посылка");
  window.XLSX.writeFile(
    wb,
    `Посылка_${parcel.formattedDate.replace(/\./g, "-")}_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  toastState.add({ message: "Excel сохранён", type: "success" });
}

async function deleteParcel(parcelId: number): Promise<void> {
  const { parcelRepository } = await import("./infrastructure");
  confirmDrawer(
    "Удалить посылку",
    "Посылка будет удалена со всеми товарами. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await parcelRepository.delete(parcelId);
      if (uiState.currentParcelId === parcelId) {
        uiState.setCurrentParcelId(null);
      }
      renderParcelListView();
      toastState.add({ message: "Посылка удалена", type: "success" });
    },
  );
}

function formatParcelTitle(parcel: Parcel): string {
  const parts = [];
  if (parcel.shippedAt) {
    const date = new Date(parcel.shippedAt).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    parts.push(`отправлена ${date}`);
  }
  if (parcel.receivedAt) {
    const date = new Date(parcel.receivedAt).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    parts.push(`получена ${date}`);
  }
  return parts.length ? `№${parcel.id} · ${parts.join(" · ")}` : `№${parcel.id} (черновик)`;
}

// Auto-render when route becomes active
router.subscribe((route) => {
  if (route === "parcels") renderParcelListView();
});

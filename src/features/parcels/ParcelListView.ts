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
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { parcelItemStatusInfo, parcelStatusInfo } from "./ui/ParcelStatusInfo";

// ============================================
// Parcel List View (Parcels Tab)
// ============================================

export async function renderParcelListView(): Promise<void> {
  const root = document.getElementById("parcelListView");
  if (!root) return;

  const parcels = await parcelRepository.findAll();

  // Item counts, keyed by id so sorting the list never desynchronizes them.
  const itemsCounts = new Map<number, number>();
  await Promise.all(parcels.map(async (p) => itemsCounts.set(p.id, await getParcelItemsCount(p))));

  // The shipping date is the anchor of this screen — newest shipments first, drafts last.
  const ordered = [...parcels].sort((a, b) => {
    const ad = a.shippedAt ? Date.parse(a.shippedAt) : 0;
    const bd = b.shippedAt ? Date.parse(b.shippedAt) : 0;
    return bd - ad;
  });

  root.innerHTML = `
    <div class="page page-parcels">
      <header class="page-head">
        <h1>Посылки</h1>
        <p class="page-head__note">По дате отправки — сначала свежие</p>
      </header>

      <section class="section parcel-index">
        ${
          ordered.length
            ? ordered
                .map((p) => {
                  const date = dateParts(p.shippedAt);
                  const status = parcelStatusInfo(p.status);
                  const isDraft = p.status === "draft";
                  const parcelTitle = p.name ? esc(p.name) : `Посылка №${p.id}`;

                  return `
          <div class="item parcel-entry" data-status="${p.status}">
            <div class="parcel-entry__date" title="${isDraft ? "не отправлена" : `отправлена ${formatLong(p.shippedAt)}`}">
              <b>${date?.day ?? "—"}</b>
              <span>${date?.month ?? "нет"}</span>
            </div>
            <div class="parcel-entry__body min-w-0">
              <div class="parcel-entry__head">
                <b>${p.name ? esc(p.name) : `Посылка №${p.id}`}</b>
                <span class="parcel-entry__state state-${status.class}">${esc(status.label)}</span>
              </div>
              <div class="parcel-entry__hint">${nextStepLabel(p.status)}</div>
            </div>
            <div class="parcel-entry__actions">
              <button class="btn-icon btn-primary" data-open="${p.id}" aria-label="Открыть посылку ${parcelTitle}">${I.arrowRight}</button>
              <details class="entry-menu">
                <summary title="Действия с посылкой ${parcelTitle}"><span class="sr-only">Действия с посылкой ${parcelTitle}</span><span aria-hidden="true">···</span></summary>
                <div class="entry-menu__list">
                  <button data-export="${p.id}" aria-label="Экспорт в Excel: ${parcelTitle}">${I.sheet} Экспорт в Excel</button>
                  <button class="is-danger" data-del="${p.id}" aria-label="Удалить посылку ${parcelTitle}">${I.trash} Удалить</button>
                </div>
              </details>
            </div>
          </div>
        `;
                })
                .join("")
            : '<div class="empty">Нет посылок. Нажмите «+», чтобы создать первую.</div>'
        }
      </section>

      <div class="form-actions form-actions--final">
        <button type="button" class="btn-primary w-full" id="addParcel">${I.plus} Добавить посылку</button>
      </div>
    </div>
  `;

  bindParcelListActions(parcels);
}

function dateParts(iso?: string): { day: string; month: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString("ru-RU", { day: "2-digit" }),
    month: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
  };
}

function formatLong(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

async function getParcelItemsCount(parcel: Parcel): Promise<number> {
  const { parcelItemRepository } = await import("./infrastructure");
  const items = await parcelItemRepository.findByParcelId(parcel.id);
  return items.length;
}

function bindParcelListActions(parcels: Parcel[]): void {
  const addBtn = document.getElementById("addParcel");
  on(addBtn, "click", async () => {
    const draft = parcels.find((p) => p.status === "draft");
    const parcel = draft || (await parcelService.createParcel());
    router.navigate("parcel", { parcelId: String(parcel.id) });
  });

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
      b.closest("details")?.removeAttribute("open");
      const parcelId = parseInt(b.dataset.export!);
      const parcel = await parcelRepository.findById(parcelId);
      if (parcel) exportParcel(parcel);
    });
  });

  document.querySelectorAll("[data-del]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      b.closest("details")?.removeAttribute("open");
      await deleteParcel(parseInt(b.dataset.del!));
    });
  });
}

// ============================================
// Excel Export
// ============================================

export async function exportParcel(parcel: Parcel): Promise<void> {
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
  rows.push(["Статус", parcelStatusInfo(parcel.status).label]);
  rows.push(["Дата создания", parcel.formattedDate]);
  if (parcel.shippedAt) rows.push(["Дата отправки", parcel.shippedAt]);
  if (parcel.receivedAt) rows.push(["Дата получения", parcel.receivedAt]);
  if (parcel.boxWeightG) rows.push(["Вес посылки, кг", kg(parcel.boxWeightG)]);
  if (parcel.shippingCostBYN) rows.push(["Стоимость доставки, BYN", money(parcel.shippingCostBYN)]);
  rows.push(["Всего товаров", items.length]);
  if (parcel.comment) rows.push(["Комментарий", parcel.comment]);
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
    "Сумма юань",
    "Сумма BYN",
    "Кол-во",
    "Ед.",
    "Трек-номера",
    "Веса (г)",
    "Статус",
  ]);
  for (const item of items) {
    const customer = customerMap.get(item.customerId);
    rows.push([
      customer?.name || "",
      item.name,
      item.priceCNY,
      money(item.totalPriceBYN),
      item.quantity,
      item.unitLabel,
      item.trackNumbers.join(", ") || "—",
      item.weightsG.join(", ") || "—",
      parcelItemStatusInfo(item.status).label,
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

// Auto-render when route becomes active
router.subscribe((route) => {
  if (route === "parcels") renderParcelListView();
});

// ============================================
// Excel export — the same statement facts the parcel screen renders.
// ============================================

declare global {
  interface Window {
    XLSX?: any;
  }
}

import { toastState } from "@/core/state";
import { kg, money } from "@/core/utils";
import { getParcelStatement } from "@/features/statements/service";
import type { Parcel } from "../domain";
import { formatDateNumeric, unitLabel } from "./ParcelPresentation";
import { parcelItemStatusInfo, parcelStatusInfo } from "./ParcelStatusInfo";

export async function exportParcel(parcelRef: Parcel): Promise<void> {
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

  const statement = await getParcelStatement(parcelRef.id);
  if (!statement) return;
  const { parcel, items, customers, balance } = statement;

  const wb = window.XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  rows.push(["ОБЩАЯ СВОДКА ПОСЫЛКИ"]);
  rows.push(["Статус", parcelStatusInfo(parcel.status).label]);
  rows.push(["Дата создания", formatDateNumeric(parcel.createdAt)]);
  if (parcel.shippedAt) rows.push(["Дата отправки", parcel.shippedAt]);
  if (parcel.receivedAt) rows.push(["Дата получения", parcel.receivedAt]);
  if (parcel.boxWeightG) rows.push(["Вес посылки, кг", kg(parcel.boxWeightG)]);
  if (parcel.shippingCostBYN) rows.push(["Стоимость доставки, BYN", money(parcel.shippingCostBYN)]);
  rows.push(["Всего товаров", items.length]);
  if (parcel.comment) rows.push(["Комментарий", parcel.comment]);
  rows.push([]);

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
  for (const [customerId, customerBalance] of balance.byCustomer) {
    const customer = customerMap.get(customerId);
    const customerItems = items.filter((i) => i.customerId === customerId);
    rows.push([
      customer?.name || "",
      customerItems.length,
      money(customerBalance.goods.owed),
      money(customerBalance.delivery.owed),
      money(customerBalance.owed),
      money(customerBalance.paid),
      money(customerBalance.remaining),
    ]);
  }
  rows.push([]);

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
      unitLabel(item.unit),
      item.trackNumbers.join(", ") || "—",
      item.weightsG.join(", ") || "—",
      parcelItemStatusInfo(item.status).label,
    ]);
  }

  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), "Посылка");
  window.XLSX.writeFile(
    wb,
    `Посылка_${formatDateNumeric(parcel.createdAt).replace(/\./g, "-")}_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  toastState.add({ message: "Excel сохранён", type: "success" });
}

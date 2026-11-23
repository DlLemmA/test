// ============================================
// Excel rows — a pure rendering of one ParcelStatement. No XLSX, no DOM, no
// data loading: the view/Excel adapter writes exactly what this module builds.
// ============================================

import { formatDateNumeric, unitLabel } from "@/features/parcels/ui/ParcelPresentation";
import { parcelItemStatusInfo, parcelStatusInfo } from "@/features/parcels/ui/ParcelStatusInfo";
import type { ParcelStatement } from "../domain/Statement";

export type ExportCell = string | number;
export type ExportRow = ExportCell[];
export type ExportColumnWidth = { wch: number };

export const PARCEL_EXPORT_SHEET = "Посылка";

const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;

/** Money is numeric: the unit already lives in the column header. */
function byn(value: number | null | undefined): number {
  return Number((value ?? 0).toFixed(2));
}

function kilograms(grams: number | null | undefined): number {
  return Number(((grams ?? 0) / 1000).toFixed(3));
}

export function buildParcelExportRows(statement: ParcelStatement): ExportRow[] {
  const { parcel, items, customers, balance } = statement;
  const rows: ExportRow[] = [];
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));

  rows.push(["ОБЩАЯ СВОДКА ПОСЫЛКИ"]);
  rows.push(["Статус", parcelStatusInfo(parcel.status).label]);
  rows.push(["Дата создания", formatDateNumeric(parcel.createdAt)]);
  if (parcel.shippedAt) rows.push(["Дата отправки", formatDateNumeric(parcel.shippedAt)]);
  if (parcel.receivedAt) rows.push(["Дата получения", formatDateNumeric(parcel.receivedAt)]);
  if (parcel.boxWeightG) rows.push(["Вес посылки, кг", kilograms(parcel.boxWeightG)]);
  if (parcel.shippingCostBYN) {
    rows.push(["Стоимость доставки, BYN", byn(parcel.shippingCostBYN)]);
  }
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
  for (const [customerId, customerBalance] of balance.byCustomer) {
    const customerItems = items.filter((item) => item.customerId === customerId);
    rows.push([
      customerNames.get(customerId) ?? "",
      customerItems.length,
      byn(customerBalance.goods.owed),
      byn(customerBalance.delivery.owed),
      byn(customerBalance.owed),
      byn(customerBalance.paid),
      byn(customerBalance.remaining),
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
    rows.push([
      customerNames.get(item.customerId) ?? "",
      item.name,
      item.priceCNY,
      byn(item.totalPriceBYN),
      item.quantity,
      unitLabel(item.unit),
      item.trackNumbers.join(", ") || "—",
      item.weightsG.join(", ") || "—",
      parcelItemStatusInfo(item.status).label,
    ]);
  }

  return rows;
}

const WIDE_CHARACTER =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;

function displayWidth(cell: ExportCell): number {
  let width = 0;
  for (const char of String(cell)) width += WIDE_CHARACTER.test(char) ? 2 : 1;
  return width;
}

/** Column widths from the same rows, so Excel does not truncate headers or text. */
export function autoColumnWidths(rows: readonly ExportRow[]): ExportColumnWidth[] {
  const widest = new Map<number, number>();
  let columnCount = 0;
  for (const row of rows) {
    columnCount = Math.max(columnCount, row.length);
    row.forEach((cell, index) => {
      widest.set(index, Math.max(widest.get(index) ?? 0, displayWidth(cell)));
    });
  }

  return Array.from({ length: columnCount }, (_, index) => ({
    wch: Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, (widest.get(index) ?? 0) + 2)),
  }));
}

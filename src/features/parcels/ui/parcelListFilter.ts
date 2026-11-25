// ============================================
// Parcel index filtering — pure facts derived from the same statements the
// detail screens use. The list view owns only the reactive query and chip state.
// ============================================

import type { Parcel } from "../domain/Parcel";
import type { ParcelStatement } from "@/features/statements/service";

export const PARCEL_FILTERS = [
  { id: "all", label: "Все" },
  { id: "draft", label: "Черновики" },
  { id: "to-ship", label: "К отправке" },
  { id: "received", label: "Полученные" },
  { id: "debt", label: "С долгом" },
] as const;

export type ParcelFilter = (typeof PARCEL_FILTERS)[number]["id"];

export interface ParcelListRow {
  parcel: Parcel;
  tracks: string[];
  customerNames: string[];
  /** What every customer still owes in this parcel. */
  remaining: number;
}

export function toParcelListRows(statements: ParcelStatement[]): ParcelListRow[] {
  return statements.map((statement) => ({
    parcel: statement.parcel,
    tracks: statement.items.flatMap((item) => item.trackNumbers),
    customerNames: statement.customers
      .filter((customer) => statement.items.some((item) => item.customerId === customer.id))
      .map((customer) => customer.name),
    remaining: statement.balance.totals.remaining,
  }));
}

function matchesFilter(row: ParcelListRow, filter: ParcelFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return row.parcel.status === "draft";
    case "to-ship":
      return row.parcel.status === "shipped";
    case "received":
      return row.parcel.status === "received" || row.parcel.status === "done";
    case "debt":
      return row.remaining > 0;
  }
}

function searchText(row: ParcelListRow): string {
  const title = row.parcel.name || `Посылка №${row.parcel.id}`;
  return [title, `№${row.parcel.id}`, ...row.tracks, ...row.customerNames]
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

export function filterParcelRows(
  rows: ParcelListRow[],
  filter: ParcelFilter,
  query: string,
): ParcelListRow[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  return rows.filter(
    (row) => matchesFilter(row, filter) && (!needle || searchText(row).includes(needle)),
  );
}

// ============================================
// Excel adapter: load SheetJS, hand it the rows built from one statement,
// set their computed widths and write the file. No row assembly lives here.
// ============================================

declare global {
  interface Window {
    XLSX?: any;
  }
}

import { toastState } from "@/core/state";
import {
  autoColumnWidths,
  buildParcelExportRows,
  PARCEL_EXPORT_SHEET,
} from "@/features/statements/excel/ParcelExportRows";
import { getParcelStatement } from "@/features/statements/service";
import { formatDateNumeric } from "./ParcelPresentation";
import type { Parcel } from "../domain";

async function ensureXlsx(): Promise<boolean> {
  if (window.XLSX) return true;
  toastState.add({ message: "Загрузка Excel...", type: "info", duration: 0 });
  try {
    await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" as any);
  } catch {
    toastState.add({ message: "Библиотека Excel не загрузилась", type: "warn" });
    return false;
  }
  toastState.add({ message: "", type: "info", duration: 1 });
  return Boolean(window.XLSX);
}

export async function exportParcel(parcelRef: Parcel): Promise<void> {
  if (!(await ensureXlsx())) return;

  const statement = await getParcelStatement(parcelRef.id);
  if (!statement) return;

  const rows = buildParcelExportRows(statement);
  const sheet = window.XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = autoColumnWidths(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, sheet, PARCEL_EXPORT_SHEET);
  window.XLSX.writeFile(
    wb,
    `Посылка_${formatDateNumeric(statement.parcel.createdAt).replace(/\./g, "-")}_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  toastState.add({ message: "Excel сохранён", type: "success" });
}

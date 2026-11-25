// ============================================
// Excel adapter: build the workbook from one statement with the local SheetJS
// package, then hand it to iOS Share Sheet or to a plain download. No row
// assembly lives here — ParcelExportRows owns that rendering.
// ============================================

import { reactive, readonly } from "vue";
import { toastState } from "@/core/state";
import {
  autoColumnWidths,
  buildParcelExportRows,
  PARCEL_EXPORT_SHEET,
} from "@/features/statements/excel/ParcelExportRows";
import type { ParcelStatement } from "@/features/statements/domain/Statement";
import { getParcelStatement } from "@/features/statements/service";
import { formatDateNumeric } from "./ParcelPresentation";
import type { Parcel } from "../domain";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ParcelExportPhase = "idle" | "preparing" | "sharing" | "downloading";

interface ParcelExportStatus {
  phase: ParcelExportPhase;
  parcelId: number | null;
  error: string;
}

const status = reactive<ParcelExportStatus>({ phase: "idle", parcelId: null, error: "" });
/** Read-only for screens: only this adapter moves export phases. */
export const parcelExportState = readonly(status);

export function parcelExportFileName(createdAt: string, today = new Date()): string {
  const parcelDate = formatDateNumeric(createdAt).replaceAll(".", "-");
  return `Посылка_${parcelDate}_${today.toISOString().slice(0, 10)}.xlsx`;
}

/** A user dismissing the share sheet is not an error and needs no recovery. */
export function isShareDismissed(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === "AbortError" || error.name === "CancelError")
  );
}

function canShareFiles(): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof File === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    // Ask during the click gesture, before any await can consume activation.
    return navigator.canShare({
      files: [new File([new Uint8Array([0])], "probe.xlsx", { type: XLSX_MIME })],
    });
  } catch {
    return false;
  }
}

function workbookFile(xlsx: typeof import("xlsx"), statement: ParcelStatement): File {
  const rows = buildParcelExportRows(statement);
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = autoColumnWidths(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, PARCEL_EXPORT_SHEET);
  const bytes = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([bytes], parcelExportFileName(statement.parcel.createdAt), {
    type: XLSX_MIME,
  });
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportParcel(parcelRef: Parcel): Promise<void> {
  if (status.phase !== "idle") return;
  const shareFiles = canShareFiles();
  status.parcelId = parcelRef.id;
  status.phase = "preparing";
  status.error = "";

  try {
    // Both jobs start inside the click gesture. The share call itself happens
    // as soon as the file exists, without an intermediate toast or UI wait.
    const [xlsx, statement] = await Promise.all([import("xlsx"), getParcelStatement(parcelRef.id)]);
    if (!statement) throw new Error("Посылка не найдена");
    const file = workbookFile(xlsx, statement);

    if (shareFiles) {
      status.phase = "sharing";
      try {
        await navigator.share({
          files: [file],
          title: "Экспорт посылки",
          text: `Посылка №${statement.parcel.id}`,
        });
        toastState.add({ message: "Файл отправлен", type: "success" });
      } catch (error) {
        if (isShareDismissed(error)) return;
        status.phase = "downloading";
        downloadFile(file);
        toastState.add({
          message: "Не удалось открыть отправку — файл скачан",
          type: "warn",
        });
      }
      return;
    }

    status.phase = "downloading";
    downloadFile(file);
    toastState.add({ message: "Файл скачан", type: "success" });
  } catch (error) {
    status.error = "Не удалось подготовить Excel. Попробуйте ещё раз.";
    toastState.add({
      message: status.error,
      type: "error",
      action: { label: "Повторить", onClick: () => void exportParcel(parcelRef) },
    });
    console.error(error);
  } finally {
    status.phase = "idle";
  }
}

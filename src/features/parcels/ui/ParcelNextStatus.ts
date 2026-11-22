import type { ParcelStatus } from "@/core/database";

// UI copy: what the parcel is waiting for next. One place shared by list,
// parcel detail and customer detail — the domain keeps only status semantics.
export function nextStepLabel(status: ParcelStatus): string {
  switch (status) {
    case "draft":
      return "Ждёт отправления";
    case "shipped":
      return "Ждёт получения";
    case "received":
      return "Ждёт распределения";
    case "done":
      return "Завершена";
  }
}

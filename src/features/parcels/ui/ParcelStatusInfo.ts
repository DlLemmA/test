import type { ParcelItemStatus, ParcelStatus } from "@/core/dbSchema";

export type StatusInfo = { label: string; class: string };

// UI copy for status badges. Kept out of the domain: it is text + CSS class.
export function parcelStatusInfo(status: ParcelStatus): StatusInfo {
  switch (status) {
    case "draft":
      return { label: "Черновик", class: "warn" };
    case "shipped":
      return { label: "Отправлена", class: "info" };
    case "received":
      return { label: "Получена", class: "good" };
    case "done":
      return { label: "Готово", class: "good" };
  }
}

export function parcelItemStatusInfo(status: ParcelItemStatus): StatusInfo {
  switch (status) {
    case "ordered":
      return { label: "Заказан", class: "default" };
    case "shipped":
      return { label: "В пути", class: "info" };
    case "received":
      return { label: "Получен", class: "good" };
    case "lost":
      return { label: "Потерян", class: "bad" };
  }
}

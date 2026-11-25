// ============================================
// Parcel status rail — one vocabulary for draft → shipped → received → done.
// Timestamps come from the parcel fields the commands already write.
// ============================================

import type { Parcel } from "../domain/Parcel";
import type { ParcelStatus } from "@/core/dbSchema";
import { formatDateNumeric } from "./ParcelPresentation";

const ORDER: ParcelStatus[] = ["draft", "shipped", "received", "done"];

const STEPS = [
  { status: "draft", label: "Черновик", field: "createdAt" },
  { status: "shipped", label: "Отправлена", field: "shippedAt" },
  { status: "received", label: "Получена", field: "receivedAt" },
  { status: "done", label: "Готова", field: "completedAt" },
] as const satisfies ReadonlyArray<{
  status: ParcelStatus;
  label: string;
  field: "createdAt" | "shippedAt" | "receivedAt" | "completedAt";
}>;

export interface ParcelTimelineStep {
  status: ParcelStatus;
  label: string;
  at?: string;
  date: string;
  state: "done" | "current" | "future";
}

export function parcelTimeline(parcel: Parcel): ParcelTimelineStep[] {
  const currentIndex = ORDER.indexOf(parcel.status);
  return STEPS.map((step, index) => ({
    status: step.status,
    label: step.label,
    at: parcel[step.field],
    date: formatDateNumeric(parcel[step.field]),
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "future",
  }));
}

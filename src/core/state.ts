// ============================================
// Reactive state — notifications have exactly one source per change.
// Routing lives in vue-router; this module owns only app-wide UI facts.
// ============================================

import { createToastManager } from "reka-ui";

export type ToastType = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

/** App-specific toast data carried by Reka's manager to the Toaster. */
export interface ToastData {
  type: ToastType;
}

export const toastManager = createToastManager<ToastData>();

// ---- UI State ----
// The routed parcel is the only cross-screen selection that survives a render.
let currentParcelId: number | null = null;

export const uiState = {
  get currentParcelId() {
    return currentParcelId;
  },
  setCurrentParcelId(id: number | null): void {
    currentParcelId = id;
  },
};

// ---- Toast State ----
// One imperative API for callers inside and outside Vue. Reka owns timing,
// dismissal and the list; `toastState` only translates our copy into its facts.
export const toastState = {
  add(toast: Omit<Toast, "id">): string {
    const id = crypto.randomUUID();
    toastManager.add({
      id,
      description: toast.message,
      duration: toast.duration ?? 5000,
      data: { type: toast.type },
      actionProps: toast.action
        ? {
            label: toast.action.label,
            altText: toast.action.label,
            closeOnClick: false,
            onClick: () => {
              toast.action?.onClick();
              toastManager.close(id);
            },
          }
        : undefined,
    });
    return id;
  },
  remove(id: string): void {
    toastManager.close(id);
  },
};

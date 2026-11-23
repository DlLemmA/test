// ============================================
// Reactive state — notifications have exactly one source per change.
// Routing lives in vue-router; this module owns only app-wide UI facts.
// ============================================

export type ToastType = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

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
const toasts: Toast[] = [];
const toastSubscribers = new Set<(toasts: Toast[]) => void>();

export const toastState = {
  add(toast: Omit<Toast, "id">) {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };
    toasts.push(newToast);
    notifyToastSubscribers();
    if (toast.duration !== 0) {
      setTimeout(() => toastState.remove(id), toast.duration ?? 5000);
    }
    return id;
  },
  getAll(): Toast[] {
    return [...toasts];
  },
  remove(id: string) {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx >= 0) {
      toasts.splice(idx, 1);
      notifyToastSubscribers();
    }
  },
  subscribe(fn: (toasts: Toast[]) => void): () => void {
    toastSubscribers.add(fn);
    return () => toastSubscribers.delete(fn);
  },
};

function notifyToastSubscribers(): void {
  toastSubscribers.forEach((fn) => fn([...toasts]));
}

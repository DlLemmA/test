// ============================================
// Simple Reactive State (no external deps)
// ============================================

export type Tab = "orders" | "order" | "people";
export type ToastType = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

// ---- UI State ----
let currentTab: Tab = "orders";
let currentOrderId: number | null = null;

const tabSubscribers = new Set<(tab: Tab) => void>();
const orderSubscribers = new Set<(id: number | null) => void>();

export const uiState = {
  get currentTab() {
    return currentTab;
  },
  get currentOrderId() {
    return currentOrderId;
  },
  setTab(tab: Tab) {
    currentTab = tab;
    tabSubscribers.forEach((fn) => fn(tab));
  },
  setCurrentOrderId(id: number | null) {
    currentOrderId = id;
    orderSubscribers.forEach((fn) => fn(id));
  },
  subscribeTab(fn: (tab: Tab) => void) {
    tabSubscribers.add(fn);
    return () => tabSubscribers.delete(fn);
  },
  subscribeOrder(fn: (id: number | null) => void) {
    orderSubscribers.add(fn);
    return () => orderSubscribers.delete(fn);
  },
};

// ---- Toast State ----
const toasts: Toast[] = [];
const toastSubscribers = new Set<(toasts: Toast[]) => void>();

export const toastState = {
  get all() {
    return toasts;
  },
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
  remove(id: string) {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx >= 0) {
      toasts.splice(idx, 1);
      notifyToastSubscribers();
    }
  },
  subscribe(fn: (toasts: Toast[]) => void) {
    toastSubscribers.add(fn);
    return () => toastSubscribers.delete(fn);
  },
};

function notifyToastSubscribers() {
  toastSubscribers.forEach((fn) => fn([...toasts]));
}

// ---- Modal State ----
export interface ModalConfig {
  title: string;
  content: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

let modalState: { isOpen: boolean; config: ModalConfig | null } = { isOpen: false, config: null };
const modalSubscribers = new Set<(state: typeof modalState) => void>();

export const modalStateAPI = {
  get state() {
    return modalState;
  },
  open(config: ModalConfig) {
    modalState = { isOpen: true, config };
    modalSubscribers.forEach((fn) => fn(modalState));
  },
  close() {
    modalState = { isOpen: false, config: null };
    modalSubscribers.forEach((fn) => fn(modalState));
  },
  subscribe(fn: (state: typeof modalState) => void) {
    modalSubscribers.add(fn);
    return () => modalSubscribers.delete(fn);
  },
};

// ---- Scanner State ----
let scannerState = { isScanning: false, scannedCode: null as string | null };
const scannerSubscribers = new Set<(state: typeof scannerState) => void>();

export const scannerStateAPI = {
  get state() {
    return scannerState;
  },
  setScanning(isScanning: boolean) {
    scannerState = { ...scannerState, isScanning };
    if (!isScanning) scannerState.scannedCode = null;
    scannerSubscribers.forEach((fn) => fn(scannerState));
  },
  setScannedCode(code: string | null) {
    scannerState = { ...scannerState, scannedCode: code };
    scannerSubscribers.forEach((fn) => fn(scannerState));
  },
  subscribe(fn: (state: typeof scannerState) => void) {
    scannerSubscribers.add(fn);
    return () => scannerSubscribers.delete(fn);
  },
};

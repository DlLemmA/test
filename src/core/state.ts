// ============================================
// Simple Reactive State (no external deps)
// ============================================

export type Tab = "parcels" | "parcel" | "people" | "add" | "customer-detail";
export type Route = "parcels" | "parcel" | "people" | "add" | "customer" | "home";
export type ToastType = "info" | "success" | "warn" | "error";

export interface RouteParams {
  parcelId?: string;
  customerId?: string;
}

// Routing
let currentRoute: Route = "home";
let currentRouteParams: RouteParams = {};
const routeSubscribers = new Set<(route: Route, params: RouteParams) => void>();

export const router = {
  get currentRoute() {
    return currentRoute;
  },
  get currentParams() {
    return currentRouteParams;
  },
  navigate(route: Route, params?: RouteParams) {
    currentRoute = route;
    currentRouteParams = params || {};
    const hash = routeToHash(route, params);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    routeSubscribers.forEach((fn) => fn(route, currentRouteParams));
  },
  subscribe(fn: (route: Route, params: RouteParams) => void) {
    routeSubscribers.add(fn);
    return () => routeSubscribers.delete(fn);
  },
};

function routeToHash(route: Route, params?: RouteParams): string {
  switch (route) {
    case "parcels":
      return "#parcels";
    case "parcel":
      return params?.parcelId ? `#parcel/${params.parcelId}` : "#parcels";
    case "people":
      return "#people";
    case "add":
      return params?.parcelId ? `#add/${params.parcelId}` : "#add";
    case "customer":
      return params?.customerId ? `#customer/${params.customerId}` : "#people";
    default:
      return "#";
  }
}

function parseHash(): { route: Route; params: RouteParams } {
  const hash = window.location.hash.slice(1);
  if (!hash || hash === "parcels") return { route: "parcels", params: {} };
  if (hash === "people") return { route: "people", params: {} };
  if (hash === "add") return { route: "add", params: {} };
  if (hash.startsWith("add/")) {
    return { route: "add", params: { parcelId: hash.split("/")[1] } };
  }
  if (hash.startsWith("parcel/")) {
    const parcelId = hash.split("/")[1];
    return { route: "parcel", params: { parcelId } };
  }
  if (hash.startsWith("customer/")) {
    const customerId = hash.split("/")[1];
    return { route: "customer", params: { customerId } };
  }
  return { route: "parcels", params: {} };
}

// Initialize router from hash
window.addEventListener("hashchange", () => {
  const { route, params } = parseHash();
  currentRoute = route;
  currentRouteParams = params;
  routeSubscribers.forEach((fn) => fn(route, params));
});

// Initialize router from current hash - call this after subscribers are registered
export function initRouterFromHash() {
  const { route: initialRoute, params: initialParams } = parseHash();
  currentRoute = initialRoute;
  currentRouteParams = initialParams;
  routeSubscribers.forEach((fn) => fn(initialRoute, initialParams));
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

// ---- UI State ----
let currentTab: Tab = "parcels";
let currentParcelId: number | null = null;
let currentCustomerId: number | null = null;

const tabSubscribers = new Set<(tab: Tab) => void>();
const parcelSubscribers = new Set<(id: number | null) => void>();
const customerSubscribers = new Set<(id: number | null) => void>();

export const uiState = {
  get currentTab() {
    return currentTab;
  },
  get currentParcelId() {
    return currentParcelId;
  },
  get currentCustomerId() {
    return currentCustomerId;
  },
  setTab(tab: Tab) {
    currentTab = tab;
    tabSubscribers.forEach((fn) => fn(tab));
  },
  setCurrentParcelId(id: number | null) {
    currentParcelId = id;
    parcelSubscribers.forEach((fn) => fn(id));
  },
  setCurrentCustomerId(id: number | null) {
    currentCustomerId = id;
    customerSubscribers.forEach((fn) => fn(id));
  },
  subscribeTab(fn: (tab: Tab) => void) {
    tabSubscribers.add(fn);
    return () => tabSubscribers.delete(fn);
  },
  subscribeParcel(fn: (id: number | null) => void) {
    parcelSubscribers.add(fn);
    return () => parcelSubscribers.delete(fn);
  },
  subscribeCustomer(fn: (id: number | null) => void) {
    customerSubscribers.add(fn);
    return () => customerSubscribers.delete(fn);
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

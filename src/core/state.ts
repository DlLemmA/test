// ============================================
// Reactive state — notifications have exactly one source per change.
// ============================================

import { resolveRoute, routeToHash } from "./route";
import type { ResolvedRoute, Route, RouteParams } from "./route";

export type { Route, RouteParams, ResolvedRoute } from "./route";
export type ToastType = "info" | "success" | "warn" | "error";

let currentRoute: Route = "parcels";
let currentRouteParams: RouteParams = {};
const routeSubscribers = new Set<(route: Route, params: RouteParams) => void>();

function notifyRoute(): void {
  routeSubscribers.forEach((fn) => fn(currentRoute, currentRouteParams));
}

export const router = {
  get currentRoute() {
    return currentRoute;
  },
  get currentParams() {
    return currentRouteParams;
  },
  navigate(route: Route, params?: RouteParams): void {
    currentRoute = route;
    currentRouteParams = params ?? {};
    const hash = routeToHash(route, currentRouteParams);
    if (window.location.hash !== hash) {
      // hashchange is the single notification for a real navigation.
      window.location.hash = hash;
    } else {
      // Re-activating the current hash still re-renders, but only once.
      notifyRoute();
    }
  },
  subscribe(fn: (route: Route, params: RouteParams) => void): () => void {
    routeSubscribers.add(fn);
    return () => routeSubscribers.delete(fn);
  },
};

window.addEventListener("hashchange", () => {
  const resolved: ResolvedRoute = resolveRoute(window.location.hash);
  currentRoute = resolved.route;
  currentRouteParams = resolved.params;
  notifyRoute();
});

/** Adopt the initial hash before the shell performs its one initial render. */
export function initRouterFromHash(): ResolvedRoute {
  const resolved = resolveRoute(window.location.hash);
  currentRoute = resolved.route;
  currentRouteParams = resolved.params;
  return resolved;
}

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

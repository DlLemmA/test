// ============================================
// Reactive state — notifications have exactly one source per change.
// Routing facts are owned by vue-router; this module is the facade the
// screens already use, so no view needs to know the router implementation.
// ============================================

import { createRouter, type RouteLocationNormalized } from "vue-router";
import { createLegacyHashHistory } from "./hashHistory";
import { resolveRoute, routeToHash } from "./route";
import type { ResolvedRoute, Route, RouteParams } from "./route";

export type { Route, RouteParams, ResolvedRoute } from "./route";
export type ToastType = "info" | "success" | "warn" | "error";

// AppShell still owns view lifetime; vue-router records only carry the match.
const noView = { render: () => null };
const history = createLegacyHashHistory();
const vueRouter = createRouter({
  history,
  routes: [
    { path: "/parcels", name: "parcels", component: noView },
    { path: "/parcel/:parcelId", name: "parcel", component: noView },
    { path: "/people", name: "people", component: noView },
    { path: "/add/:parcelId?", name: "add", component: noView },
    { path: "/customer/:customerId", name: "customer", component: noView },
    { path: "/:pathMatch(.*)*", redirect: { name: "parcels" } },
  ],
});

function resolvedFrom(location: RouteLocationNormalized): ResolvedRoute {
  switch (location.name) {
    case "parcel":
      return {
        route: "parcel",
        params: { parcelId: String(location.params.parcelId ?? "") },
      };
    case "customer":
      return {
        route: "customer",
        params: { customerId: String(location.params.customerId ?? "") },
      };
    case "add":
      return location.params.parcelId
        ? { route: "add", params: { parcelId: String(location.params.parcelId) } }
        : { route: "add", params: {} };
    case "people":
      return { route: "people", params: {} };
    default:
      return { route: "parcels", params: {} };
  }
}

const routeSubscribers = new Set<(route: Route, params: RouteParams) => void>();

function notifyRoute(): void {
  const resolved = resolvedFrom(vueRouter.currentRoute.value);
  routeSubscribers.forEach((fn) => fn(resolved.route, resolved.params));
}

function sameRoute(a: ResolvedRoute, b: ResolvedRoute): boolean {
  return (
    a.route === b.route &&
    a.params.parcelId === b.params.parcelId &&
    a.params.customerId === b.params.customerId
  );
}

// Browser back/forward and programmatic pushes both end here exactly once.
vueRouter.afterEach(() => notifyRoute());

export const router = {
  get currentRoute(): Route {
    return resolvedFrom(vueRouter.currentRoute.value).route;
  },
  get currentParams(): RouteParams {
    return resolvedFrom(vueRouter.currentRoute.value).params;
  },
  navigate(route: Route, params?: RouteParams): void {
    const hash = routeToHash(route, params);
    const target = resolveRoute(hash);
    if (sameRoute(resolvedFrom(vueRouter.currentRoute.value), target)) {
      // Re-activating the current route still refreshes, but only once.
      notifyRoute();
      return;
    }
    void vueRouter.push(hash.slice(1));
  },
  subscribe(fn: (route: Route, params: RouteParams) => void): () => void {
    routeSubscribers.add(fn);
    return () => routeSubscribers.delete(fn);
  },
};

/** Adopt the initial hash before the shell performs its one initial render. */
export async function initRouterFromHash(): Promise<ResolvedRoute> {
  await vueRouter.push(history.location);
  return resolvedFrom(vueRouter.currentRoute.value);
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

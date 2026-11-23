// ============================================
// The app's single vue-router instance. Hash history is built in; the shell
// only translates a matched route into the ViewHandle contract.
// ============================================

import { defineComponent } from "vue";
import { createRouter, createWebHashHistory, type RouteLocationResolved } from "vue-router";

export type AppRoute = "parcels" | "parcel" | "people" | "customer" | "add";

export interface AppRouteParams {
  parcelId?: string;
  customerId?: string;
}

export interface ScreenLocation {
  route: AppRoute;
  params: AppRouteParams;
}

// The shell owns view lifetime; route records only carry a name and params.
const noView = defineComponent({ name: "NoView", render: () => null });

export const appRouter = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/parcels", name: "parcels", component: noView },
    { path: "/parcel/:parcelId", name: "parcel", component: noView },
    { path: "/people", name: "people", component: noView },
    { path: "/customer/:customerId", name: "customer", component: noView },
    { path: "/add/:parcelId?", name: "add", component: noView },
    { path: "/:pathMatch(.*)*", redirect: { name: "parcels", params: {} } },
  ],
});

/** Translate vue-router's match into the params a ViewHandle renders with. */
export function screenFromLocation(
  location: Pick<RouteLocationResolved, "name" | "params">,
): ScreenLocation {
  switch (location.name) {
    case "parcel":
      return { route: "parcel", params: { parcelId: String(location.params.parcelId ?? "") } };
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

// ============================================
// The app's single vue-router instance. Every route fills the same default
// outlet in App.vue, so the router owns both the URL and the screen lifetime.
// ============================================

import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { authSession } from "@/core/auth";
import { clearMainScroll, mainScrollTarget, takeMainScroll } from "./scroll";
import SignInView from "./SignInView.vue";
import { runViewTransition } from "./viewTransitions";

export type AppRoute = "parcels" | "parcel" | "people" | "customer" | "add" | "sign-in";

const routes: RouteRecordRaw[] = [
  {
    path: "/sign-in",
    name: "sign-in",
    component: SignInView,
    meta: { public: true },
  },
  {
    path: "/parcels",
    name: "parcels",
    component: () => import("@/features/parcels/ParcelListView.vue"),
  },
  {
    path: "/parcel/:parcelId",
    name: "parcel",
    component: () => import("@/features/parcels/ParcelDetailView.vue"),
  },
  {
    path: "/people",
    name: "people",
    component: () => import("@/features/customers/CustomersView.vue"),
  },
  {
    path: "/customer/:customerId",
    name: "customer",
    component: () => import("@/features/customers/CustomerDetailView.vue"),
  },
  {
    path: "/add/:parcelId?",
    name: "add",
    component: () => import("@/features/parcels/ParcelAddView.vue"),
  },
  { path: "/:pathMatch(.*)*", redirect: { name: "parcels", params: {} } },
];

export const appRouter = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    // Auth screens render outside the shell; asking Vue Router to scroll a
    // missing selector logs a warning on every sign-in redirect.
    if (!document.getElementById("main-content")) return false;
    // A real history back restores the row list the user came from. Pushes and
    // dock taps open the next screen at its top, never at a stale offset.
    if (savedPosition) return mainScrollTarget(takeMainScroll(to.fullPath));
    clearMainScroll(to.fullPath);
    return mainScrollTarget();
  },
});

appRouter.beforeEach((to, from) => {
  if (to.name === "sign-in") {
    return authSession.value ? { name: "parcels" } : true;
  }
  if (!authSession.value) {
    return { name: "sign-in", query: { next: to.fullPath } };
  }
  return runViewTransition(appRouter, to, from);
});

// ============================================
// The app's single vue-router instance. Every route fills the same default
// outlet in App.vue, so the router owns both the URL and the screen lifetime.
// ============================================

import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { authSession } from "@/core/auth";
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

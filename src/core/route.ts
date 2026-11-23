// ============================================
// Route facts — pure, no DOM and no subscribers.
// ============================================

export type Route = "parcels" | "parcel" | "people" | "add" | "customer";

export interface RouteParams {
  parcelId?: string;
  customerId?: string;
}

export interface ResolvedRoute {
  route: Route;
  params: RouteParams;
}

export function routeToHash(route: Route, params?: RouteParams): string {
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
  }
}

/** Turn a location hash into the single set of route facts the shell consumes. */
export function resolveRoute(hash: string): ResolvedRoute {
  const value = hash.replace(/^#/, "");
  if (!value || value === "parcels") return { route: "parcels", params: {} };
  if (value === "people") return { route: "people", params: {} };
  if (value === "add") return { route: "add", params: {} };
  if (value.startsWith("add/")) {
    return { route: "add", params: { parcelId: value.split("/")[1] } };
  }
  if (value.startsWith("parcel/")) {
    return { route: "parcel", params: { parcelId: value.split("/")[1] } };
  }
  if (value.startsWith("customer/")) {
    return { route: "customer", params: { customerId: value.split("/")[1] } };
  }
  return { route: "parcels", params: {} };
}

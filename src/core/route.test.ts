import { describe, expect, it } from "vitest";
import { resolveRoute, routeToHash } from "./route";

describe("resolveRoute", () => {
  it.each([
    ["", "parcels", {}],
    ["#parcels", "parcels", {}],
    ["#people", "people", {}],
    ["#add", "add", {}],
    ["#add/3", "add", { parcelId: "3" }],
    ["#parcel/2", "parcel", { parcelId: "2" }],
    ["#customer/4", "customer", { customerId: "4" }],
    ["#nonsense", "parcels", {}],
  ])("maps %s to %s", (hash, route, params) => {
    expect(resolveRoute(hash)).toEqual({ route, params });
  });

  it("round-trips every hash the app can produce", () => {
    const cases = [
      { route: "parcels" },
      { route: "people" },
      { route: "add" },
      { route: "add", params: { parcelId: "3" } },
      { route: "parcel", params: { parcelId: "2" } },
      { route: "customer", params: { customerId: "4" } },
    ] as const;

    for (const value of cases) {
      const hash = routeToHash(value.route, "params" in value ? value.params : undefined);
      expect(resolveRoute(hash)).toEqual({
        route: value.route,
        params: "params" in value ? value.params : {},
      });
    }
  });
});

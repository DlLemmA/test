// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { appRouter, screenFromLocation } from "./router";

describe("screenFromLocation", () => {
  it.each([
    ["/parcels", { route: "parcels", params: {} }],
    ["/parcel/7", { route: "parcel", params: { parcelId: "7" } }],
    ["/people", { route: "people", params: {} }],
    ["/customer/9", { route: "customer", params: { customerId: "9" } }],
    ["/add", { route: "add", params: {} }],
    ["/add/7", { route: "add", params: { parcelId: "7" } }],
    ["/unknown", { route: "parcels", params: {} }],
  ] as const)("maps %s", (path, expected) => {
    expect(screenFromLocation(appRouter.resolve(path))).toEqual(expected);
  });
});

describe("unknown hashes", () => {
  it("redirect to parcels without leaking the catch-all param", async () => {
    await appRouter.push("/unknown");

    expect(appRouter.currentRoute.value.fullPath).toBe("/parcels");
    expect(appRouter.currentRoute.value.params).toEqual({});
  });
});

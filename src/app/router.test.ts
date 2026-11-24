// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { appRouter } from "./router";

function hasView(path: string): boolean {
  const record = appRouter.resolve(path).matched.at(-1);
  return typeof record?.components?.default === "function";
}

describe("router views", () => {
  it.each(["/parcels", "/parcel/7", "/people", "/customer/9", "/add", "/add/7"])(
    "resolves %s to a lazy view",
    (path) => {
      expect(hasView(path)).toBe(true);
    },
  );
});

describe("unknown hashes", () => {
  it("redirect to parcels without leaking the catch-all param", async () => {
    await appRouter.push("/unknown");

    expect(appRouter.currentRoute.value.fullPath).toBe("/parcels");
    expect(appRouter.currentRoute.value.params).toEqual({});
  });
});

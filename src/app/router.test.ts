// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { authSession } from "@/core/auth";
import { appRouter } from "./router";

function hasView(path: string): boolean {
  const record = appRouter.resolve(path).matched.at(-1);
  return typeof record?.components?.default === "function";
}

afterEach(() => {
  authSession.value = null;
});

describe("router views", () => {
  it.each(["/parcels", "/parcel/7", "/people", "/customer/9", "/add", "/add/7"])(
    "resolves %s to a lazy view",
    (path) => {
      expect(hasView(path)).toBe(true);
    },
  );
});

describe("auth gate", () => {
  it("redirects a signed-out user to sign-in and remembers the target", async () => {
    await appRouter.push("/parcels");

    expect(appRouter.currentRoute.value.fullPath).toBe("/sign-in?next=/parcels");
  });

  it("redirects a signed-in user away from sign-in", async () => {
    authSession.value = { access_token: "test" } as never;
    await appRouter.push("/sign-in");

    expect(appRouter.currentRoute.value.fullPath).toBe("/parcels");
  });

  it("keeps protected routes available to a signed-in user", async () => {
    authSession.value = { access_token: "test" } as never;
    await appRouter.push("/unknown");

    expect(appRouter.currentRoute.value.fullPath).toBe("/parcels");
    expect(appRouter.currentRoute.value.params).toEqual({});
  });
});

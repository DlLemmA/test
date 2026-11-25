// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clearMainScroll, mainScrollTarget, rememberMainScroll, takeMainScroll } from "./scroll";

describe("main scroller positions", () => {
  it("restores a remembered offset once, then falls back to the top", () => {
    rememberMainScroll("/parcels", 240);

    expect(takeMainScroll("/parcels")).toBe(240);
    expect(takeMainScroll("/parcels")).toBe(0);
  });

  it("forgets a stale offset on a fresh push", () => {
    rememberMainScroll("/parcels", 320);
    clearMainScroll("/parcels");

    expect(takeMainScroll("/parcels")).toBe(0);
  });

  it("targets the shell scroller instead of the window", () => {
    expect(mainScrollTarget(64)).toEqual({
      el: "#main-content",
      top: 64,
      behavior: "instant",
    });
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLegacyHashHistory } from "./hashHistory";

let cleanup: (() => void)[] = [];

afterEach(() => {
  cleanup.forEach((dispose) => dispose());
  cleanup = [];
  window.history.replaceState(null, "", "/");
});

function createHistory() {
  const history = createLegacyHashHistory();
  cleanup.push(() => history.destroy());
  return history;
}

function waitForHashChange(): Promise<void> {
  return new Promise((resolve) =>
    window.addEventListener("hashchange", () => resolve(), { once: true }),
  );
}

describe("legacy hash history", () => {
  it("maps vue-router locations to the existing hash grammar", () => {
    const history = createHistory();

    history.push("/parcel/2");

    expect(window.location.hash).toBe("#parcel/2");
    expect(history.location).toBe("/parcel/2");
    expect(history.createHref("/people")).toBe("#people");
  });

  it("notifies once when browser history moves back", async () => {
    const history = createHistory();
    history.push("/parcel/2");
    const listener = vi.fn<(to: string) => void>();
    history.listen(listener);

    const changed = waitForHashChange();
    window.history.back();
    await changed;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toBe("/parcels");
    expect(history.location).toBe("/parcels");
  });

  it("notifies once when the hash is edited directly", async () => {
    const history = createHistory();
    const listener = vi.fn<(to: string) => void>();
    history.listen(listener);

    const changed = waitForHashChange();
    window.location.hash = "#people";
    await changed;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toBe("/people");
    expect(history.location).toBe("/people");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListenerScope, type ListenerScope } from "@/core/listeners";
import { toastState } from "@/core/state";
import { mountToastRendering } from "./toastRendering";

let container: HTMLElement;
let scope: ListenerScope;
let unmount: () => void;
let ids: string[];

beforeEach(() => {
  container = document.createElement("div");
  container.id = "toastContainer";
  document.body.appendChild(container);
  scope = createListenerScope();
  unmount = mountToastRendering(container, scope);
  ids = [];
});

afterEach(() => {
  ids.forEach((id) => toastState.remove(id));
  unmount();
  scope.dispose();
  container.remove();
});

describe("toast rendering", () => {
  it("resolves an action by toast id, not by its index among buttons", () => {
    ids.push(toastState.add({ message: "первый", type: "info", duration: 0 }));
    const action = vi.fn<() => void>();
    ids.push(
      toastState.add({
        message: "второй",
        type: "success",
        duration: 0,
        action: { label: "Отменить", onClick: action },
      }),
    );

    expect(container.querySelectorAll(".toast-action")).toHaveLength(1);
    container.querySelector<HTMLElement>(".toast-action")!.click();

    expect(action).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("второй");
    expect(container.textContent).toContain("первый");
  });

  it("keeps one delegated listener across re-renders", () => {
    const first = vi.fn<() => void>();
    ids.push(
      toastState.add({
        message: "a",
        type: "info",
        duration: 0,
        action: { label: "A", onClick: first },
      }),
    );
    container.querySelector<HTMLElement>(".toast-action")!.click();

    const second = vi.fn<() => void>();
    ids.push(
      toastState.add({
        message: "b",
        type: "info",
        duration: 0,
        action: { label: "B", onClick: second },
      }),
    );
    container.querySelector<HTMLElement>(".toast-action")!.click();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

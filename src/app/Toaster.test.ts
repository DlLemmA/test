// @vitest-environment jsdom
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { ToastProvider } from "reka-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastManager, toastState } from "@/core/state";
import Toaster from "./Toaster.vue";

let container: HTMLElement;
let unmount: () => void;
let ids: string[];

beforeEach(() => {
  container = document.createElement("div");
  container.id = "toastContainer";
  document.body.appendChild(container);

  const Harness = defineComponent({
    setup() {
      return () => h(ToastProvider, { label: "Уведомления", toastManager }, () => h(Toaster));
    },
  });
  const wrapper = mount(Harness, { attachTo: container });
  unmount = () => wrapper.unmount();
  ids = [];
});

afterEach(() => {
  ids.forEach((id) => toastState.remove(id));
  unmount();
  container.remove();
});

describe("toast host", () => {
  it("resolves an action by toast id, not by its index among buttons", async () => {
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
    await nextTick();

    expect(container.querySelectorAll(".toast-action")).toHaveLength(1);
    expect(container.querySelector(`[data-toast-id="${ids[1]}"]`)).not.toBeNull();
    container.querySelector<HTMLElement>(".toast-action")!.click();
    await nextTick();

    expect(action).toHaveBeenCalledTimes(1);
    // jsdom has no exit animation, so the closed toast stays mounted until
    // Presence removes it; Reka marks it as closed immediately.
    const closedToast = container.querySelector(`[data-toast-id="${ids[1]}"]`)?.closest(".toast");
    expect(closedToast?.getAttribute("data-state")).toBe("closed");
    expect(container.textContent).toContain("первый");
  });

  it("keeps each action bound to its own toast across updates", async () => {
    const first = vi.fn<() => void>();
    ids.push(
      toastState.add({
        message: "a",
        type: "info",
        duration: 0,
        action: { label: "A", onClick: first },
      }),
    );
    await nextTick();
    container.querySelector<HTMLElement>(".toast-action")!.click();
    await nextTick();

    const second = vi.fn<() => void>();
    ids.push(
      toastState.add({
        message: "b",
        type: "info",
        duration: 0,
        action: { label: "B", onClick: second },
      }),
    );
    await nextTick();
    container.querySelector<HTMLElement>(".toast-action")!.click();
    await nextTick();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("uses Reka toast semantics for the viewport and description", async () => {
    ids.push(toastState.add({ message: "готово", type: "success", duration: 0 }));
    await nextTick();

    expect(container.querySelector(".toast-viewport")).not.toBeNull();
    expect(container.querySelector(".toast__message")?.textContent).toContain("готово");
  });
});

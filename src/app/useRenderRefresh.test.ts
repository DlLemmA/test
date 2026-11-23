// @vitest-environment jsdom

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useRenderRefresh } from "./useRenderRefresh";

function harness(load: (signal: AbortSignal) => Promise<void>) {
  const Component = defineComponent({
    props: { renderTick: { type: Number, required: true } },
    setup(props) {
      const refresh = useRenderRefresh(props, load);
      return () => h("button", { type: "button", onClick: refresh });
    },
  });
  return mount(Component, { props: { renderTick: 0 } });
}

describe("useRenderRefresh", () => {
  it("loads once on mount and once for every new renderTick", async () => {
    const load = vi.fn<() => Promise<void>>(async () => {});
    const wrapper = harness(load);
    await nextTick();
    expect(load).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ renderTick: 1 });
    expect(load).toHaveBeenCalledTimes(2);

    await wrapper.setProps({ renderTick: 1 });
    expect(load).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it("aborts the superseded load so a late repository read cannot win", async () => {
    const signals: AbortSignal[] = [];
    const wrapper = harness(async (signal) => {
      signals.push(signal);
    });
    await nextTick();

    await wrapper.setProps({ renderTick: 1 });
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    wrapper.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  it("exposes a local refresh for mutations without a route change", async () => {
    const load = vi.fn<() => Promise<void>>(async () => {});
    const wrapper = harness(load);
    await nextTick();
    expect(load).toHaveBeenCalledTimes(1);

    await wrapper.find("button").trigger("click");
    expect(load).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });
});

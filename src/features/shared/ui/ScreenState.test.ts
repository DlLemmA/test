// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScreenState from "./ScreenState.vue";

describe("ScreenState", () => {
  it("announces loading without showing empty copy", () => {
    const wrapper = mount(ScreenState, {
      props: { kind: "loading", title: "Загружаем посылки…" },
    });

    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.text()).toContain("Загружаем посылки…");
    expect(wrapper.text()).not.toContain("Пока пусто");
  });

  it("shows confirmed empty copy and resolves its action", async () => {
    const wrapper = mount(ScreenState, {
      props: {
        kind: "empty",
        title: "Ничего не найдено",
        message: "Измените запрос или вернитесь ко всем посылкам.",
        actionLabel: "Сбросить фильтры",
      },
    });

    expect(wrapper.text()).toContain("Ничего не найдено");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("action")).toHaveLength(1);
  });

  it("announces errors as alerts", () => {
    const wrapper = mount(ScreenState, {
      props: { kind: "error", title: "Не удалось загрузить" },
    });

    expect(wrapper.attributes("role")).toBe("alert");
    expect(wrapper.text()).toContain("Не удалось загрузить");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDrawer, confirmDrawer, drawer } from "./drawer";

function sheet(): HTMLElement {
  const el = document.getElementById("drawerContainer");
  if (!el) throw new Error("Sheet was not mounted");
  return el;
}

function click(selector: string): void {
  const el = sheet().querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  el.click();
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  document.body.style.top = "";
  Object.defineProperty(window, "scrollTo", { value: vi.fn<() => void>(), writable: true });
  vi.useFakeTimers();
});

afterEach(() => {
  closeDrawer();
  vi.advanceTimersByTime(300);
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("sheet", () => {
  it("owns one open path and tears the sheet down after close", () => {
    const handle = drawer("Заголовок", '<form id="form"></form>');

    expect(document.querySelectorAll("#drawerContainer")).toHaveLength(1);
    expect(sheet().getAttribute("aria-label")).toBe("Заголовок");
    expect(sheet().querySelector("#form")).not.toBeNull();
    expect(document.body.classList.contains("noscroll")).toBe(true);

    closeDrawer();
    expect(sheet().querySelector("#form")).not.toBeNull();
    vi.advanceTimersByTime(300);

    expect(sheet().innerHTML).toBe("");
    expect(document.body.classList.contains("noscroll")).toBe(false);
    expect(window.scrollTo).toHaveBeenCalled();
    handle.dispose();
  });

  it("separates confirm from cancel without callbacks on the DOM node", () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();

    confirmDrawer("Удалить", "Точно?", "Удалить", onConfirm, onCancel);
    click("#drawerCancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);

    confirmDrawer("Удалить", "Точно?", "Удалить", onConfirm, onCancel);
    click("#drawerConfirm");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
  });

  it("treats every other close path as cancel and disposes listeners", () => {
    const onCancel = vi.fn<() => void>();
    const handle = confirmDrawer("T", "m", "OK", vi.fn<() => void>(), onCancel);
    const staleClose = sheet().querySelector<HTMLElement>("#drawerClose")!;

    handle.dispose();
    staleClose.click();
    expect(onCancel).not.toHaveBeenCalled();
    expect(sheet().innerHTML).toBe("");

    confirmDrawer("T", "m", "OK", vi.fn<() => void>(), onCancel);
    closeDrawer();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps a single owner when another sheet replaces the active one", () => {
    const onCancel = vi.fn<() => void>();
    confirmDrawer("A", "m", "OK", vi.fn<() => void>(), onCancel);
    drawer("B", "<p>B</p>");

    expect(onCancel).not.toHaveBeenCalled();
    expect(document.querySelectorAll("#drawerContainer")).toHaveLength(1);
    expect(sheet().getAttribute("aria-label")).toBe("B");
    expect(sheet().querySelector("p")?.textContent).toBe("B");
  });
});

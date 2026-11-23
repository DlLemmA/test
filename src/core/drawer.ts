// ============================================
// Sheet — one deep module for the app-level bottom sheet.
//
// The interface is small: `drawer`, `confirmDrawer`, `closeDrawer`. Everything
// else (element creation, scroll lock, focus, drag-to-dismiss, callbacks and
// disposal) lives behind it. `alertDrawer` and the fake `_onCancel` / `_onConfirm`
// properties on the DOM node are gone: the close reason is now explicit.
// ============================================

import "../features/shared/ui/drawer.css";
import { createListenerScope, type ListenerScope } from "./listeners";
import { I, esc } from "./utils";

export interface SheetHandle {
  /** Tear the sheet down immediately, without the close animation. */
  dispose(): void;
}

type CloseReason = "cancel" | "confirm";

interface Sheet {
  close(reason: CloseReason): void;
  finish(): void;
  dispose(): void;
}

interface SheetOptions {
  title: string;
  content: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

let active: Sheet | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let savedScroll = 0;

// The sheet elements and their drag/close listeners live as long as the app.
const elementScope: ListenerScope = createListenerScope();

function restoreScroll(): void {
  document.body.classList.remove("noscroll");
  document.body.style.top = "";
  window.scrollTo(0, savedScroll);
}

function sheetEls(): { backdrop: HTMLElement; element: HTMLElement } {
  let backdrop = document.getElementById("drawerBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "drawerBackdrop";
    backdrop.className = "drawer-backdrop";
    document.body.appendChild(backdrop);
  }
  let element = document.getElementById("drawerContainer");
  if (!element) {
    element = document.createElement("div");
    element.id = "drawerContainer";
    element.className = "drawer";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-modal", "true");
    document.body.appendChild(element);
    elementScope.on(element, "click", (event) => {
      if ((event.target as Element)?.closest("#drawerClose")) closeDrawer();
    });
    initDrawerDrag(element, elementScope);
  }
  return { backdrop, element };
}

/** The only open path. Callers supply facts; this module owns the lifetime. */
function openSheet({ title, content, onConfirm, onCancel }: SheetOptions): SheetHandle {
  abandonActive();
  const { backdrop, element: el } = sheetEls();
  const scope = createListenerScope();

  el.innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-header">
      <h2>${esc(title)}</h2>
      <button type="button" class="drawer-close" id="drawerClose" aria-label="Закрыть">${I.x}</button>
    </div>
    <div class="drawer-content">
      ${content}
    </div>
  `;
  el.setAttribute("aria-label", title);

  let focusTimer: ReturnType<typeof setTimeout> | null = null;
  let closing = false;

  const sheet: Sheet = {
    close(reason) {
      if (closing || active !== sheet) return;
      closing = true;
      if (reason === "cancel") onCancel?.();
      el.classList.remove("visible");
      backdrop.classList.remove("visible");
      closeTimer = setTimeout(() => {
        closeTimer = null;
        sheet.finish();
      }, 300);
    },
    finish() {
      sheet.dispose();
      restoreScroll();
    },
    dispose() {
      if (active === sheet) active = null;
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = null;
      scope.dispose();
      el.classList.remove("visible");
      backdrop.classList.remove("visible");
      el.innerHTML = "";
    },
  };
  active = sheet;

  scope.on(el.querySelector("#drawerCancel"), "click", () => sheet.close("cancel"));
  scope.on(el.querySelector("#drawerConfirm"), "click", () => {
    sheet.close("confirm");
    void onConfirm?.();
  });

  savedScroll = window.scrollY;
  document.body.classList.add("noscroll");
  document.body.style.top = `-${savedScroll}px`;

  el.style.transition = "none";
  el.classList.remove("visible");
  requestAnimationFrame(() => {
    if (active !== sheet) return;
    el.style.transition = "";
    el.classList.add("visible");
    backdrop.classList.add("visible");
  });

  // Focus the first field unless a scan already focused something in the sheet.
  focusTimer = setTimeout(() => {
    focusTimer = null;
    if (active !== sheet || !el.contains(document.activeElement)) {
      const field = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input[autofocus], select[autofocus], input, select, textarea",
      );
      field?.focus({ preventScroll: true });
    }
  }, 380);

  return { dispose: () => sheet.dispose() };
}

function abandonActive(): void {
  if (!active) return;
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
    active.finish();
  } else {
    active.dispose();
    restoreScroll();
  }
}

// ---- Public interface ----

export function drawer(title: string, content: string): SheetHandle {
  return openSheet({ title, content });
}

export function confirmDrawer(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void | Promise<void>,
  onCancel?: () => void,
): SheetHandle {
  return openSheet({
    title,
    content: `
      <div class="notice">${esc(message)}</div>
      <div class="drawer-actions">
        <button type="button" class="btn-secondary" id="drawerCancel">Отмена</button>
        <button type="button" class="btn-danger-solid" id="drawerConfirm">${esc(confirmText)}</button>
      </div>
    `,
    onConfirm,
    onCancel,
  });
}

/** Every other close path (close button, drag, callers) goes through cancel. */
export function closeDrawer(): void {
  active?.close("cancel");
}

// ============================================
// Drag to dismiss — owned by the sheet element, not by its content.
// ============================================

function initDrawerDrag(element: HTMLElement, scope: ListenerScope): void {
  let startY: number | null = null;

  const begin = (y: number) => {
    startY = y;
    element.dataset.dy = "0";
  };

  // Touch (iOS): delegates to handle or header, skipping the close button
  scope.on(
    element,
    "touchstart",
    (event) => {
      const target = event.target as Element;
      const t = target?.closest<HTMLElement>(".drawer-handle, .drawer-header");
      if (!t || target?.closest("button")) return;
      const touch = event.touches[0];
      if (!touch) return;
      begin(touch.clientY);
    },
    { passive: true },
  );

  scope.on(
    element,
    "touchmove",
    (event) => {
      if (startY === null) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dy = Math.max(0, touch.clientY - startY);
      element.dataset.dy = String(dy);
      element.style.transition = "none";
      element.style.transform = `translateY(${dy}px)`;
    },
    { passive: true },
  );

  const endTouch = () => finishDrag(element);
  scope.on(element, "touchend", endTouch);
  scope.on(element, "touchcancel", endTouch);

  // Mouse (desktop testing)
  scope.on(element, "mousedown", (event) => {
    const target = event.target as Element;
    const t = target?.closest<HTMLElement>(".drawer-handle, .drawer-header");
    if (!t || target?.closest("button")) return;
    event.preventDefault();
    begin(event.clientY);
    const mm = (ev: MouseEvent) => {
      const dy = Math.max(0, ev.clientY - startY!);
      element.dataset.dy = String(dy);
      element.style.transition = "none";
      element.style.transform = `translateY(${dy}px)`;
    };
    const mu = () => {
      finishDrag(element);
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    scope.on(document, "mousemove", mm);
    scope.on(document, "mouseup", mu);
  });
}

function finishDrag(element: HTMLElement): void {
  const dy = parseInt(element.dataset.dy || "0", 10);
  delete element.dataset.dy;
  element.style.transition = "";
  element.style.transform = "";
  if (dy > 96) closeDrawer();
}

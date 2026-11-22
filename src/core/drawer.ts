// ============================================
// iOS-style Bottom Drawer (slider)
// ============================================

import { I, esc } from "./utils";

// ---- State ----
let drawerOpen = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let savedScroll = 0;

// ---- Elements ----
function drawerEls(): { backdrop: HTMLElement; drawer: HTMLElement } {
  let backdrop = document.getElementById("drawerBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "drawerBackdrop";
    backdrop.className = "drawer-backdrop";
    document.body.appendChild(backdrop);
  }
  let drawer = document.getElementById("drawerContainer");
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "drawerContainer";
    drawer.className = "drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    document.body.appendChild(drawer);
    initDrawerDrag(drawer);
    // Close button listener
    drawer.addEventListener("click", (e) => {
      if ((e.target as Element)?.closest("#drawerClose")) {
        navigator.vibrate?.(10);
        closeDrawer();
      }
    });
  }
  return { backdrop, drawer };
}

// ---- Public API ----

export function drawer(title: string, content: string): void {
  const { backdrop, drawer: drawerEl } = drawerEls();

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  drawerEl.innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-header">
      <h2>${esc(title)}</h2>
      <button type="button" class="drawer-close" id="drawerClose" aria-label="Закрыть">${I.x}</button>
    </div>
    <div class="drawer-content">
      ${content}
    </div>
  `;

  drawerEl.setAttribute("aria-label", title);

  // Lock background scroll, remembering position
  savedScroll = window.scrollY;
  document.body.classList.add("noscroll");
  document.body.style.top = `-${savedScroll}px`;

  // Animate in
  drawerEl.style.transition = "none";
  drawerEl.classList.remove("visible");
  requestAnimationFrame(() => {
    drawerEl.style.transition = "";
    drawerEl.classList.add("visible");
    backdrop.classList.add("visible");
  });

  drawerOpen = true;

  // Focus the first field, unless the user already focused something inside the
  // drawer (e.g. the weight field after a barcode scan) while it was animating in.
  setTimeout(() => {
    if (drawerEl.contains(document.activeElement)) return;
    const f = drawerEl.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[autofocus], select[autofocus], input, select, textarea",
    );
    f?.focus({ preventScroll: true });
  }, 380);
}

export function confirmDrawer(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void | Promise<void>,
  onCancel?: () => void,
): void {
  const { backdrop, drawer: drawerEl } = drawerEls();

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  drawerEl.innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-header">
      <h2>${esc(title)}</h2>
      <button type="button" class="drawer-close" id="drawerClose" aria-label="Закрыть">${I.x}</button>
    </div>
    <div class="drawer-content">
      <div class="notice">${esc(message)}</div>
      <div class="drawer-actions">
        <button type="button" class="btn-secondary" id="drawerCancel">Отмена</button>
        <button type="button" class="btn-danger-solid" id="drawerConfirm">${esc(confirmText)}</button>
      </div>
    </div>
  `;

  drawerEl.setAttribute("aria-label", title);

  savedScroll = window.scrollY;
  document.body.classList.add("noscroll");
  document.body.style.top = `-${savedScroll}px`;

  drawerEl.style.transition = "none";
  drawerEl.classList.remove("visible");
  requestAnimationFrame(() => {
    drawerEl.style.transition = "";
    drawerEl.classList.add("visible");
    backdrop.classList.add("visible");
  });

  drawerOpen = true;

  // Bind action buttons
  const cancelBtn = drawerEl.querySelector("#drawerCancel");
  const confirmBtn = drawerEl.querySelector("#drawerConfirm");

  cancelBtn?.addEventListener("click", () => {
    navigator.vibrate?.(10);
    closeDrawer();
    onCancel?.();
  });

  confirmBtn?.addEventListener("click", async () => {
    navigator.vibrate?.(10);
    closeDrawer();
    if (onConfirm) await onConfirm();
  });
}

export function alertDrawer(title: string, message: string): void {
  const { backdrop, drawer: drawerEl } = drawerEls();

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  drawerEl.innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-header">
      <h2>${esc(title)}</h2>
      <button type="button" class="drawer-close" id="drawerClose" aria-label="Закрыть">${I.x}</button>
    </div>
    <div class="drawer-content">
      <div class="notice">${esc(message)}</div>
    </div>
  `;

  drawerEl.setAttribute("aria-label", title);

  savedScroll = window.scrollY;
  document.body.classList.add("noscroll");
  document.body.style.top = `-${savedScroll}px`;

  drawerEl.style.transition = "none";
  drawerEl.classList.remove("visible");
  requestAnimationFrame(() => {
    drawerEl.style.transition = "";
    drawerEl.classList.add("visible");
    backdrop.classList.add("visible");
  });

  drawerOpen = true;
}

export function closeDrawer(): void {
  const backdrop = document.getElementById("drawerBackdrop");
  const drawer = document.getElementById("drawerContainer");
  if (!drawer || !drawerOpen) return;

  // Call callbacks if they exist
  const drawerWithCallbacks = drawer as HTMLElement & {
    _onConfirm?: () => void | Promise<void>;
    _onCancel?: () => void;
  };
  drawerWithCallbacks._onCancel?.();

  drawerOpen = false;
  drawer.classList.remove("visible");
  backdrop?.classList.remove("visible");

  closeTimer = setTimeout(() => {
    closeTimer = null;
    document.body.classList.remove("noscroll");
    document.body.style.top = "";
    window.scrollTo(0, savedScroll);
    // Clean up callbacks
    drawerWithCallbacks._onConfirm = undefined;
    drawerWithCallbacks._onCancel = undefined;
    drawer.innerHTML = "";
  }, 300);
}

// ============================================
// Drag to dismiss
// ============================================

function initDrawerDrag(drawer: HTMLElement): void {
  let startY: number | null = null;

  const begin = (y: number) => {
    startY = y;
    drawer.dataset.dy = "0";
  };

  // Touch (iOS): delegates to handle or header, skipping the close button
  drawer.addEventListener(
    "touchstart",
    (e) => {
      const target = e.target as Element;
      const t = target?.closest<HTMLElement>(".drawer-handle, .drawer-header");
      if (!t || target?.closest("button")) return;
      const touch = e.touches[0];
      if (!touch) return;
      begin(touch.clientY);
    },
    { passive: true },
  );

  drawer.addEventListener(
    "touchmove",
    (e) => {
      if (startY === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = Math.max(0, touch.clientY - startY);
      drawer.dataset.dy = String(dy);
      drawer.style.transition = "none";
      drawer.style.transform = `translateY(${dy}px)`;
    },
    { passive: true },
  );

  const endTouch = () => finishDrag(drawer);
  drawer.addEventListener("touchend", endTouch);
  drawer.addEventListener("touchcancel", endTouch);

  // Mouse (desktop testing)
  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as Element;
    const t = target?.closest<HTMLElement>(".drawer-handle, .drawer-header");
    if (!t || target?.closest("button")) return;
    e.preventDefault();
    begin(e.clientY);
    const mm = (ev: MouseEvent) => {
      const dy = Math.max(0, ev.clientY - startY!);
      drawer.dataset.dy = String(dy);
      drawer.style.transition = "none";
      drawer.style.transform = `translateY(${dy}px)`;
    };
    const mu = () => {
      finishDrag(drawer);
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  };
  drawer.addEventListener("mousedown", onMouseDown);
}

function finishDrag(drawer: HTMLElement): void {
  const dy = parseInt(drawer.dataset.dy || "0", 10);
  delete drawer.dataset.dy;
  drawer.style.transition = "";
  drawer.style.transform = "";
  if (dy > 96) closeDrawer();
}

// utils.js — Shared helpers: formatting, toasts, modals

/** Escape HTML special characters */
export function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/** Format weight: grams -> "X.XXX" kg string */
export function kg(g) {
  return g == null ? '—' : (g / 1000).toFixed(3);
}

/** Format money with 2 decimals */
export function money(v) {
  return (v || 0).toFixed(2);
}

/** ISO datetime string for "now" */
export function dateNow() {
  return new Date().toISOString();
}

// === Toasts ===
export function notify(msg, type = 'info', options = {}) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast toast-enter pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-white max-w-xs';
  el.style.backgroundColor = type === 'error' ? '#b42318' : type === 'warn' ? '#986000' : '#137a50';
  el.textContent = msg;

  container.appendChild(el);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.replace('toast-enter', 'toast-exit');
    el.addEventListener('animationend', () => el.remove());
  };

  const duration = options.persistent ? 0 : (options.duration ?? 5000);
  let timer = duration ? setTimeout(dismiss, duration) : null;

  // Pause on hover/focus
  const resume = () => { if (!dismissed && !timer && duration) timer = setTimeout(dismiss, duration); };
  el.addEventListener('mouseenter', () => timer && clearTimeout(timer));
  el.addEventListener('focusin', () => timer && clearTimeout(timer));
  el.addEventListener('mouseleave', resume);
  el.addEventListener('focusout', resume);

  // Action button support
  if (options.action) {
    const btn = document.createElement('button');
    btn.textContent = options.actionLabel || 'Действие';
    btn.className = 'ml-3 underline hover:no-underline bg-transparent border-none cursor-pointer text-white';
    btn.addEventListener('click', () => { options.action(); dismiss(); });
    el.appendChild(btn);
  }

  return { dismiss };
}

// === Modals (native <dialog>) ===
export function modal(title, html) {
  const dialog = document.getElementById('sharedDialog');
  dialog.innerHTML = `
    <div class="modalhead">
      <h2>${esc(title)}</h2>
      <button class="x" id="modalClose">✕</button>
    </div>
    ${html}
  `;
  // Close on backdrop click (native behavior) and ESC (native)
  const onClose = () => dialog.close();
  document.getElementById('modalClose').addEventListener('click', onClose, { once: true });
  dialog.addEventListener('close', () => {
    document.getElementById('modalClose').removeEventListener('click', onClose);
  });
  dialog.showModal();
}

export function closeModal() {
  const dialog = document.getElementById('sharedDialog');
  if (dialog.open) dialog.close();
}

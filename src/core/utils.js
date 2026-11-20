// utils.js — Shared helpers: formatting, toasts, icons
import { on } from './listeners.js';

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

/** Format money in BYN (Br) */
export function money(v) {
  return (v || 0).toFixed(2) + ' Br';
}

/** ISO datetime string for "now" */
export function dateNow() {
  return new Date().toISOString();
}

// === Icons (lucide, 16px, stroke 1.5) ===
const icon = (d) => `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const I = {
  x: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  pencil: icon('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.849 16.17a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
  sheet: icon('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M9 6h1"/><path d="M15 18h-6"/><path d="M15 14h-6"/><path d="M9 10h1"/>'),
  plus: icon('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  camera: icon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  stop: icon('<rect width="12" height="12" x="6" y="6" rx="2"/>'),
  download: icon('<path d="M12 3v12"/><path d="m18 11-6 6-6-6"/><path d="M21 21H3"/>'),
  upload: icon('<path d="M12 15V3"/><path d="m18 9-6-6-6 6"/><path d="M21 21H3"/>'),
  home: icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  package: icon('<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
  users: icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  history: icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  trash: icon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'),
  arrowRight: icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  check: icon('<polyline points="20 6 9 17 4 12"/>')
};

// === Toasts ===
export function notify(msg, type = 'info', options = {}) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast toast-enter';
  el.style.backgroundColor = type === 'error' ? '#b42318' : type === 'warn' ? '#986000' : '#137a50';
  el.textContent = msg;
  container.appendChild(el);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.replace('toast-enter', 'toast-exit');
    on(el, 'animationend', () => el.remove());
  };

  const duration = options.persistent ? 0 : (options.duration ?? 5000);
  let timer = duration ? setTimeout(dismiss, duration) : null;

  // Pause on hover/focus
  const resume = () => { if (!dismissed && !timer && duration) timer = setTimeout(dismiss, duration); };
  on(el, 'mouseenter', () => timer && clearTimeout(timer));
  on(el, 'focusin', () => timer && clearTimeout(timer));
  on(el, 'mouseleave', resume);
  on(el, 'focusout', resume);

  // Action button support
  if (options.action) {
    const btn = document.createElement('button');
    btn.textContent = options.actionLabel || 'Действие';
    btn.className = 'toast-action';
    on(btn, 'click', () => { options.action(); dismiss(); });
    el.appendChild(btn);
  }

  return { dismiss };
}

// Re-export sheet functions for convenience
export { modal, closeModal, confirmSheet } from './sheet.js';
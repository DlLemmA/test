// sheet.js — iOS-style bottom sheet (slider)
import { on } from './listeners.js';
import { esc } from './utils.js'

// === State ===
let sheetOpen = false;
let closeTimer = null;
let savedScroll = 0;

// Local icon set for sheet close button (X icon)
const xIcon = `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

// === Elements ===
function sheetEls() {
  let backdrop = document.getElementById('sheetBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sheetBackdrop';
    backdrop.className = 'sheet-backdrop';
    on(backdrop, 'click', closeModal);
    document.body.appendChild(backdrop);
  }
  let sheet = document.getElementById('sheetContainer');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'sheetContainer';
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
    initSheetDrag(sheet);
    // Add close button listener once (delegated, permanent)
    sheet.addEventListener('click', e => {
      if (e.target.closest('#sheetClose')) closeModal();
    });
  }
  return { backdrop, sheet };
}

// === Public API ===
export function modal(title, html) {
  const { backdrop, sheet } = sheetEls();

  // Cancel a pending close so an immediate reopen isn't killed by it
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <h2>${esc(title)}</h2>
      <button type="button" class="sheet-close" id="sheetClose" aria-label="Закрыть">${xIcon}</button>
    </div>
    <div class="sheet-content">
      ${html}
    </div>
  `;

  sheet.setAttribute('aria-label', title);

  // Lock background scroll, remembering position
  savedScroll = window.scrollY;
  document.body.classList.add('noscroll');
  document.body.style.top = `-${savedScroll}px`;

  // Animate in
  sheet.style.transition = 'none';
  sheet.classList.remove('visible');
  requestAnimationFrame(() => {
    sheet.style.transition = '';
    sheet.classList.add('visible');
    backdrop.classList.add('visible');
  });

  sheetOpen = true;

  // Focus the first field — the autofocus attribute doesn't work on inserted content
  setTimeout(() => {
    const f = sheet.querySelector('input[autofocus], select[autofocus], input, select, textarea');
    f?.focus({ preventScroll: true });
  }, 380);
}

export function closeModal() {
  const backdrop = document.getElementById('sheetBackdrop');
  const sheet = document.getElementById('sheetContainer');
  if (!sheet || !sheetOpen) return;

  sheetOpen = false;
  sheet.classList.remove('visible');
  backdrop?.classList.remove('visible');

  closeTimer = setTimeout(() => {
    closeTimer = null;
    document.body.classList.remove('noscroll');
    document.body.style.top = '';
    window.scrollTo(0, savedScroll);
  }, 300);
}

// === Drag to dismiss ===
function initSheetDrag(sheet) {
  let startY = null;

  const begin = (y) => { startY = y; sheet.dataset.dy = 0; };

  // Touch (iOS): delegates to handle or header, skipping the close button
  sheet.addEventListener('touchstart', e => {
    const t = e.target.closest('.sheet-handle, .sheet-header');
    if (!t || e.target.closest('button')) return;
    begin(e.touches[0].clientY);
  }, { passive: true });

  // touchmove is captured by the element that had touchstart, so this follows the finger
  sheet.addEventListener('touchmove', e => {
    if (startY === null) return;
    sheet.dataset.dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${sheet.dataset.dy}px)`;
  }, { passive: true });

  // touchend has no reliable clientY — read the last tracked value
  const endTouch = () => finishDrag(sheet);
  sheet.addEventListener('touchend', endTouch);
  sheet.addEventListener('touchcancel', endTouch);

  // Mouse (desktop testing)
  const onMouseDown = e => {
    const t = e.target.closest('.sheet-handle, .sheet-header');
    if (!t || e.target.closest('button')) return;
    e.preventDefault();
    begin(e.clientY);
    const mm = ev => {
      sheet.dataset.dy = Math.max(0, ev.clientY - startY);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${sheet.dataset.dy}px)`;
    };
    const mu = () => {
      finishDrag(sheet);
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
    };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  };
  sheet.addEventListener('mousedown', onMouseDown);
}

function finishDrag(sheet) {
  if (sheet.dataset.dragStart === undefined && sheet.dataset.dy === undefined) return;
  const dy = parseInt(sheet.dataset.dy) || 0;
  delete sheet.dataset.dy;
  sheet.style.transition = '';
  sheet.style.transform = '';
  if (dy > 96) closeModal();
}

export function confirmSheet(title, message, confirmLabel, onConfirm) {
  modal(title, `
    <div class="text-sm text-slate-600">${message}</div>
    <div class="flex gap-2">
      <button type="button" id="confirmCancel" class="btn-secondary flex-1">Отмена</button>
      <button type="button" id="confirmOk" class="btn-danger-solid flex-1">${confirmLabel}</button>
    </div>
  `);
  on(document.getElementById('confirmCancel'), 'click', closeModal);
  on(document.getElementById('confirmOk'), 'click', () => {
    closeModal();
    onConfirm();
  });
}
# Pinduoduo Parcel Tracking App — Modern Web Best Practices Audit

**Date:** 2026-11-20  
**Audited Files:** `index.html`, `core/events.js`, `core/render.js`, `core/init.js`, `core/db.js`  
**Reference Guides:** dialog, forms, responsive-table, tabs, persistent-toast-notifications, accessibility, html, performance

---

## Executive Summary

The app is a well-structured vanilla JS client-side application with IndexedDB persistence, barcode scanning, and Excel export. However, it uses **pre-2020 patterns** for critical UI components. The most impactful upgrades would be:

1. **Replace custom modals with native `<dialog>`** — eliminates 50+ lines of focus/ESC/backdrop code
2. **Add ARIA to tab navigation** — makes tabs accessible to screen readers
3. **Upgrade toasts to live regions** — announces status changes to AT users
4. **Add responsive table patterns** — enables mobile usability
5. **Add `autocomplete` and native validation to forms** — improves autofill and UX

---

## 1. Modals / Dialogs — **Critical Gap**

### Current Implementation (`events.js:99-118`)
```javascript
function modal(title, html) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modalback" id="modalBack">
      <div class="modal">
        <div class="modalhead">
          <h2>${esc(title)}</h2>
          <button class="x" id="modalClose">✕</button>
        </div>
        ${html}
      </div>
    </div>
  `;
  document.getElementById('modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack') closeModal(); });
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
}
```

**Used for:** Order form, Customer form, Item form, Move item, Weigh item, Receive/Scanner, Backup/Restore, Bind existing — **8 distinct dialogs**

### Deviations from Dialog Guide
| Guide Requirement | Current State | Impact |
|-------------------|---------------|--------|
| Use native `<dialog>` | ❌ Custom `<div>` overlay | No built-in focus trap, top-layer, ESC handling |
| `showModal()` / `close()` | ❌ Manual `innerHTML` swap | No return focus to trigger, no `::backdrop` styling |
| Declarative `command="show-modal"` | ❌ Not used | Extra JS for every trigger button |
| No `role="dialog"` / `aria-modal` | N/A (not using `<dialog>`) | Would be redundant on native `<dialog>` |
| Focus first focusable on open | ❌ Missing | Keyboard users land on backdrop |
| Return focus to trigger on close | ❌ Missing | Focus lost, disorienting |
| `autofocus` on first field | ❌ Missing | Extra tab press needed |
| Light dismiss (click backdrop) | ✅ Manual implementation | Works but reinvented |

### Recommended Migration
```html
<!-- In index.html, replace <div id="modalRoot"></div> -->
<dialog id="sharedDialog" aria-labelledby="dialogTitle"></dialog>

<!-- Trigger button example -->
<button command="show-modal" commandfor="sharedDialog">Open Order Form</button>
```

```javascript
// events.js - replace modal() function
function openDialog(title, html, triggerEl) {
  const dialog = document.getElementById('sharedDialog');
  dialog.innerHTML = `
    <h2 id="dialogTitle">${esc(title)}</h2>
    <button class="x" id="dialogClose" aria-label="Close">✕</button>
    ${html}
  `;
  // Focus first focusable element
  const firstFocusable = dialog.querySelector('input, select, button, [tabindex]:not([tabindex="-1"])');
  firstFocusable?.focus();
  
  dialog.showModal(triggerEl); // Auto-returns focus to triggerEl on close
}

// Close handler
document.getElementById('dialogClose')?.addEventListener('click', () => {
  document.getElementById('sharedDialog').close();
});

// Native ESC handling, backdrop click, focus trap — all FREE
```

**Benefits:** ~60 lines removed, native accessibility, `::backdrop` CSS styling, declarative triggers.

---

## 2. Forms — **High Impact Gaps**

### Current Implementation (`events.js:121-249`)
Three main forms: Order, Customer, Item — all using `<form>` with `FormData` submission.

### Deviations from Forms Guide
| Guide Requirement | Current State | Fix |
|-------------------|---------------|-----|
| `autocomplete` attributes | ❌ Missing on all inputs | Add `autocomplete="name"`, `"organization-title"`, `"tel"`, `"street-address"`, etc. |
| Native validation UI (`:invalid`) | ⚠️ Only `required` used | Add `novalidate` to form, show custom messages on `submit` with `reportValidity()` |
| `autofocus` on first field in dialog | ❌ Missing | Add to first `<input>` in each form |
| `type="search"` for search inputs | ❌ `type="text"` used | Change `<input type="search" id="itemSearch">` |
| `inputmode` for numeric fields | ❌ Missing | Add `inputmode="numeric"` to weight/price fields |
| Associate labels with `for`/`id` | ✅ Implicit (wrapping) | Good, but explicit `for`/`id` more robust |
| Prevent double submission | ❌ No guard | Disable submit button during async `persist()` |

### Example Fix — Order Form
```html
<form id="orderForm" novalidate>
  <div class="field">
    <label for="orderTitle">Название заказа *</label>
    <input id="orderTitle" name="title" required 
           autocomplete="organization-title" 
           autofocus
           placeholder="Например, Заказ от 20.11.2026">
  </div>
  <div class="field">
    <label for="orderStatus">Статус</label>
    <select id="orderStatus" name="status">...</select>
  </div>
  <div class="field">
    <label for="shippedAt">Дата отправления</label>
    <input id="shippedAt" name="shipped_at" type="date">
  </div>
  <div class="field">
    <label for="boxWeight">Вес коробки (г)</label>
    <input id="boxWeight" name="box_weight_g" type="number" 
           min="0" step="1" inputmode="numeric" autocomplete="off">
  </div>
  <div class="actions">
    <button type="submit">Сохранить</button>
    <button type="button" class="danger" id="deleteOrder">Удалить</button>
  </div>
</form>
```

```javascript
// Submission with native validation
document.getElementById('orderForm').addEventListener('submit', async e => {
  const form = e.target;
  if (!form.checkValidity()) {
    form.reportValidity(); // Shows native error UI
    return;
  }
  e.preventDefault();
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    // ... existing logic
  } finally {
    submitBtn.disabled = false;
  }
});
```

---

## 3. Tables — **Mobile Usability Gap**

### Current Implementation (`render.js:61-77`, `196-208`)
- Order summary: 7-column table wrapped in `.tablewrap` (horizontal scroll)
- History view: Card-like `.item` divs (not a table) — actually better for mobile
- Items view: Card-like `.item` divs — good

### Deviations from Responsive Table Guide
| Guide Requirement | Current State | Fix |
|-------------------|---------------|-----|
| `scope="col"` on `<th>` | ❌ Missing | Add to all header cells |
| `scope="row"` on row headers | ❌ N/A (no row headers) | Add `<th scope="row">` for first column if tabular |
| Sticky header on long tables | ❌ Missing | `thead th { position: sticky; top: 0; }` |
| Mobile: card layout or priority columns | ⚠️ `.tablewrap` scroll only | For order summary: hide less critical columns (Delivery, Total) on mobile via CSS |
| Horizontal scroll shadow indicator | ❌ Missing | Add `box-shadow` on `.tablewrap` when scrolled |

### Recommended: Responsive Order Summary Table
```html
<div class="tablewrap" role="region" aria-label="Customer summary" tabindex="0">
  <table>
    <thead>
      <tr>
        <th scope="col">Заказчик</th>
        <th scope="col">Товаров</th>
        <th scope="col">Взвешено</th>
        <th scope="col" class="hide-mobile">Вес, кг</th>
        <th scope="col" class="hide-mobile">Стоимость, BYN</th>
        <th scope="col" class="hide-mobile">Доставка, BYN</th>
        <th scope="col">Итого, BYN</th>
      </tr>
    </thead>
    <tbody>...</tbody>
  </table>
</div>
```

```css
/* In Tailwind config or custom CSS */
.tablewrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.tablewrap:focus { outline: none; } /* Keyboard scroll */
th[scope="col"] { position: sticky; top: 0; background: inherit; z-index: 1; }
@media (max-width: 640px) {
  .hide-mobile { display: none; }
}
```

---

## 4. Tab Navigation — **Accessibility Critical**

### Current Implementation (`index.html:31-36`, `events.js:71-74`)
```html
<nav class="nav flex gap-1 overflow-auto py-1 px-0 mb-3" id="nav">
  <button data-tab="order" class="active bg-slate-800 text-white px-4 py-2 rounded-lg whitespace-nowrap">Текущий заказ</button>
  <button data-tab="items" class="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg whitespace-nowrap">Товары</button>
  <button data-tab="people" class="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg whitespace-nowrap">Заказчики</button>
  <button data-tab="history" class="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg whitespace-nowrap">История</button>
</nav>
<main>
  <section id="tab-order"><div id="orderView"></div></section>
  <section id="tab-items" class="hidden"><div id="itemsView"></div></section>
  <section id="tab-people" class="hidden"><div id="peopleView"></div></section>
  <section id="tab-history" class="hidden"><div id="historyView"></div></section>
</main>
```

```javascript
function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('hidden', s.id !== `tab-${tab}`));
}
```

### Deviations from Tabs Guide
| Guide Requirement | Current State | Fix |
|-------------------|---------------|-----|
| `role="tablist"` on container | ❌ Missing | Add to `<nav>` |
| `role="tab"` on buttons | ❌ Missing | Add to each `<button>` |
| `aria-selected="true/false"` | ❌ Missing | Toggle on active tab |
| `aria-controls="panel-id"` | ❌ Missing | Link tab to panel |
| `id="tab-id"` on each tab | ❌ Missing | Required for `aria-labelledby` |
| Panels: `role="tabpanel"` | ❌ Missing | Add to `<section>` |
| Panels: `aria-labelledby="tab-id"` | ❌ Missing | Link panel to tab |
| Panels: `hidden` attribute | ⚠️ Uses `.hidden` class | Use `hidden` attribute instead |
| Keyboard: Arrow Left/Right | ❌ Missing | Implement `keydown` handler |
| Keyboard: Home/End | ❌ Missing | Implement |
| `tabindex="0"` active, `-1` others | ❌ All `tabindex="0"` (default) | Manage programmatically |
| Overflow: scroll buttons or menu | ⚠️ `overflow-auto` only | Add scroll buttons if needed |

### Recommended Implementation
```html
<nav role="tablist" class="nav flex gap-1 overflow-auto py-1 px-0 mb-3" id="nav" aria-label="Main sections">
  <button role="tab" id="tab-order" aria-selected="true" aria-controls="panel-order" tabindex="0" class="active ...">Текущий заказ</button>
  <button role="tab" id="tab-items" aria-selected="false" aria-controls="panel-items" tabindex="-1" class="...">Товары</button>
  <button role="tab" id="tab-people" aria-selected="false" aria-controls="panel-people" tabindex="-1" class="...">Заказчики</button>
  <button role="tab" id="tab-history" aria-selected="false" aria-controls="panel-history" tabindex="-1" class="...">История</button>
</nav>
<main>
  <section role="tabpanel" id="panel-order" aria-labelledby="tab-order" hidden><div id="orderView"></div></section>
  <section role="tabpanel" id="panel-items" aria-labelledby="tab-items" hidden><div id="itemsView"></div></section>
  <section role="tabpanel" id="panel-people" aria-labelledby="tab-people" hidden><div id="peopleView"></div></section>
  <section role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden><div id="historyView"></div></section>
</main>
```

```javascript
function switchTab(tabName) {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');
  
  tabs.forEach(tab => {
    const isActive = tab.dataset.tab === tabName;
    tab.setAttribute('aria-selected', isActive);
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
    tab.classList.toggle('active', isActive);
  });
  
  panels.forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.hidden = !isActive;
  });
}

// Keyboard navigation
document.getElementById('nav').addEventListener('keydown', e => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const activeIndex = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
  let nextIndex = activeIndex;
  
  if (e.key === 'ArrowRight') nextIndex = (activeIndex + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') nextIndex = 0;
  else if (e.key === 'End') nextIndex = tabs.length - 1;
  else return;
  
  e.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click(); // Or call switchTab directly
});
```

---

## 5. Toast Notifications — **Accessibility Gap**

### Current Implementation (`events.js:587-594`)
```javascript
function notify(msg, type = 'info') {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px 18px;border-radius:12px;background:${type==='error'?'#b42318':type==='warn'?'#986000':'#137a50'};color:white;z-index:100;box-shadow:0 4px 20px #0003`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
```

### Deviations from Persistent Toast Notifications Guide
| Guide Requirement | Current State | Fix |
|-------------------|---------------|-----|
| `role="status"` or `aria-live="polite"` | ❌ Missing | Screen readers won't announce |
| Container with `aria-live` for stacking | ❌ Each toast independent | Multiple toasts overwrite/stack poorly |
| Pause auto-dismiss on hover/focus | ❌ No pause | User can't read long messages |
| Respect `prefers-reduced-motion` | ❌ No check | Animation issues for vestibular users |
| Actionable toasts persist longer | ❌ Fixed 2.5s | No action support anyway |
| Stack vertically with gap | ❌ Single position | Overlap if rapid fire |

### Recommended Implementation
```html
<!-- In index.html, before </body> -->
<div id="toastContainer" role="status" aria-live="polite" aria-atomic="true" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>
```

```javascript
function notify(msg, type = 'info', options = {}) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-white max-w-xs animate-slide-in`;
  el.style.backgroundColor = type === 'error' ? '#b42318' : type === 'warn' ? '#986000' : '#137a50';
  el.textContent = msg;
  el.setAttribute('role', 'alert'); // More assertive than status
  
  container.appendChild(el);
  
  // Auto-dismiss with hover pause
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.add('animate-fade-out');
    el.addEventListener('animationend', () => el.remove());
  };
  
  const timeout = options.persistent ? 0 : (options.duration ?? 5000);
  let timer = timeout ? setTimeout(dismiss, timeout) : null;
  
  el.addEventListener('mouseenter', () => timer && clearTimeout(timer));
  el.addEventListener('focusin', () => timer && clearTimeout(timer));
  el.addEventListener('mouseleave', () => { if (!timer && timeout) timer = setTimeout(dismiss, timeout); });
  el.addEventListener('focusout', () => { if (!timer && timeout) timer = setTimeout(dismiss, timeout); });
  
  // Action button support
  if (options.action) {
    const btn = document.createElement('button');
    btn.textContent = options.actionLabel || 'Action';
    btn.className = 'ml-3 underline hover:no-underline';
    btn.addEventListener('click', () => { options.action(); dismiss(); });
    el.appendChild(btn);
  }
  
  return { dismiss };
}
```

```css
/* Add to Tailwind or custom CSS */
@keyframes slide-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: none; } }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
.animate-slide-in { animation: slide-in 0.2s ease-out; }
.animate-fade-out { animation: fade-out 0.2s ease-in forwards; }
@media (prefers-reduced-motion: reduce) {
  .animate-slide-in, .animate-fade-out { animation: none; }
}
```

---

## 6. General Accessibility — **Multiple Gaps**

### Deviations from Accessibility Guide
| Requirement | Current State | Fix |
|-------------|---------------|-----|
| Skip link | ❌ Missing | Add `<a href="#main" class="skip-link">Skip to content</a>` |
| Focus visible styles | ⚠️ Browser default only | Add custom `:focus-visible` styles |
| `prefers-reduced-motion` | ❌ Not respected | Wrap animations in `@media (prefers-reduced-motion: reduce)` |
| Color-only status | ❌ Pills use only color | Add text/icons: `✓ Взвешен`, `✗ Потерян`, `⚠ Пропущен` |
| `confirm()` for destructive actions | ❌ Used in 4 places | Replace with accessible `<dialog>` confirmations |
| Language declaration | ✅ `lang="ru"` | Good |
| Heading hierarchy | ⚠️ Multiple `<h2>` at same level | Ensure logical h1→h2→h3 |
| Iframe titles | N/A | No iframes |
| Touch target size (44×44px) | ⚠️ Some buttons small | Ensure minimum size |

### Skip Link Implementation
```html
<!-- In index.html, first thing in <body> -->
<a href="#main-content" class="skip-link sr-only focus:not-sr-only fixed top-2 left-2 z-50 bg-slate-900 text-white px-4 py-2 rounded">Перейти к содержанию</a>
<main id="main-content">...</main>
```

```css
.skip-link { position: absolute; top: -100%; }
.skip-link:focus { top: 0.5rem; }
```

---

## 7. HTML Patterns — **Maintainability Gaps**

### Deviations from HTML Guide
| Requirement | Current State | Fix |
|-------------|---------------|-----|
| `<meta name="description">` | ❌ Missing | Add description for SEO/social |
| `<meta name="theme-color">` | ✅ Present | Good |
| Inline event handlers in strings | ❌ `onclick="..."` in `render.js` | Use delegation or `addEventListener` |
| `onclick` property assignment | ❌ `element.onclick = fn` in events.js | Use `addEventListener` |
| CSP-compatible | ❌ Inline styles/scripts | Move styles to CSS, use nonce if needed |
| Tailwind CDN in production | ❌ `cdn.tailwindcss.com` | Build step with JIT compiler |
| `viewport-fit=cover` | ✅ Present | Good for notched devices |

### Example: Replace Inline Handlers
```javascript
// render.js:178-185 — CURRENT
document.querySelectorAll('[data-del-customer]').forEach(b => {
  b.onclick = async () => {  // ❌ onclick property
    if (confirm('Удалить заказчика?')) { ... }
  };
});

// RECOMMENDED — delegation already used elsewhere, just be consistent
document.getElementById('peopleView').addEventListener('click', e => {
  const btn = e.target.closest('[data-del-customer]');
  if (btn) { ... }
});
```

---

## 8. Performance — **Optimization Opportunities**

### Deviations from Performance Guide
| Requirement | Current State | Fix |
|-------------|---------------|-----|
| Yield during large renders | ❌ `renderAll()` synchronous | Use `scheduler.yield()` for >50 items |
| Virtualization for long lists | ❌ Not needed yet (small data) | Consider for history/items if >100 rows |
| Code splitting | ❌ All JS in `app.js` | Dynamic `import()` for heavy features (Excel, Scanner) |
| WASM loading strategy | ❌ Blocks in `<head>` | Load `sql-wasm.js` async after paint |
| `fetchpriority` on critical resources | ❌ Not used | Add to critical CSS/JS |
| `content-visibility: auto` | ❌ Not used | Add to offscreen tab panels |
| Debounced search | ❌ Direct `input` listener | Add 150ms debounce |

### Recommended: Dynamic Import for Heavy Features
```javascript
// events.js — scanner only loaded when needed
async function startScanner() {
  if (!window.ZXing) {
    notify('Загрузка сканера...', 'info', { persistent: true });
    await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js');
  }
  // ... rest
}

// events.js — Excel only loaded on export
async function exportOrder(o) {
  if (!window.XLSX) {
    notify('Загрузка Excel...', 'info', { persistent: true });
    await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }
  // ... rest
}
```

### Recommended: Yield in Render Loop
```javascript
// render.js — for large item lists
async function renderItemsList(orderId) {
  const its = itemsFor(orderId);
  const root = document.getElementById('orderItemsList');
  root.innerHTML = '';
  
  for (let i = 0; i < its.length; i++) {
    const div = document.createElement('div');
    div.innerHTML = itemHtml(its[i], 'В процессе');
    root.appendChild(div.firstElementChild);
    
    if (i % 20 === 0 && 'scheduler' in window && 'yield' in scheduler) {
      await scheduler.yield(); // Yield to main thread
    }
  }
  
  bindItemActions(); // Re-bind after append
}
```

---

## Priority Action Plan

| Priority | Task | Files | Effort | Impact |
|----------|------|-------|--------|--------|
| **P0** | Replace custom modals with `<dialog>` | `events.js`, `index.html` | Medium | High (a11y, code reduction) |
| **P0** | Add ARIA to tab navigation | `index.html`, `events.js` | Low | High (screen reader access) |
| **P1** | Upgrade toasts to live regions | `events.js`, `index.html` | Low | High (status announcements) |
| **P1** | Add `autocomplete` + native validation to forms | `events.js` | Low | Medium (autofill, UX) |
| **P1** | Responsive table patterns | `render.js`, CSS | Low | Medium (mobile usability) |
| **P2** | Skip link, focus styles, reduced motion | `index.html`, CSS | Low | Medium (a11y polish) |
| **P2** | Replace `confirm()` with accessible dialogs | `events.js` | Medium | High (a11y for destructive actions) |
| **P3** | Dynamic imports for Scanner/Excel | `events.js` | Low | Medium (initial load) |
| **P3** | Yield during large renders | `render.js` | Low | Low (future-proof) |
| **P3** | Build step for Tailwind (remove CDN) | Build config | Medium | Medium (production perf) |

---

## Quick Wins (Under 30 min each)

1. **Add `scope="col"` to all `<th>`** in `render.js:62`
2. **Add `autocomplete` attributes** to form inputs in `events.js`
3. **Add `role="status"` + `aria-live="polite"`** to toast container
4. **Add `role="tablist"` / `role="tab"` / `role="tabpanel"`** attributes in `index.html`
5. **Add skip link** at top of `index.html` body
6. **Change `.hidden` class to `hidden` attribute** on tab panels
7. **Add `inputmode="numeric"`** to weight/price inputs
8. **Add `@media (prefers-reduced-motion: reduce)`** for toast animations

---

## Appendix: Guide References

All recommendations based on [modern-web-guidance](https://github.com/microsoft/modern-web-guidance) guides retrieved:
- `dialog` — Native `<dialog>` element usage
- `forms` — Form validation, autocomplete, submission
- `responsive-table` — Mobile table patterns
- `tabs` — ARIA tabs pattern with keyboard support
- `persistent-toast-notifications` — Accessible toast patterns
- `accessibility` — General a11y requirements
- `html` — HTML document structure best practices
- `performance` — Main thread scheduling, INP optimization
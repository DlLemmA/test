// items.component.js — Items view UI
import { itemsFor, calc, itemHtml, openItemForm, moveItem, weighItem, deleteItem } from './items.js';
import { getCurrentOrder } from '../core/render.js';
import { on } from '../core/listeners.js';

export function renderItemsView() {
  const root = document.getElementById('itemsView');
  const o = getCurrentOrder();
  if (!root) return;

  if (!o) {
    root.innerHTML = '<div class="panel"><h2>Создайте заказ</h2></div>';
    return;
  }

  const list = itemsFor(o.id);
  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2>Все товары заказа</h2>
        <input type="search" id="itemSearch" placeholder="Поиск" class="w-full sm:w-64" autocomplete="off">
      </div>
      <div id="allItems">${list.map(i=>itemHtml(i,o.status)).join('')||'<div class="empty">Нет товаров</div>'}</div>
    </div>
  `;

  // Debounced search (150ms)
  let searchTimer = null;
  on(document.getElementById('itemSearch'), 'input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = e.target.value.toLowerCase();
      document.getElementById('allItems').innerHTML = list.filter(i =>
        [i.name, i.track, i.customer_name].join(' ').toLowerCase().includes(q)
      ).map(i => itemHtml(i, o.status)).join('') || '<div class="empty">Ничего не найдено</div>';
      bindItemActions(document.getElementById('allItems'));
    }, 150);
  });

  bindItemActions(document.getElementById('allItems'));
}

function bindItemActions(container = document.getElementById('allItems')) {
  if (!container) return;
  container.querySelectorAll('[data-edit]').forEach(b => {
    on(b, 'click', () => openItemForm(parseInt(b.dataset.edit)));
  });
  container.querySelectorAll('[data-move]').forEach(b => {
    on(b, 'click', () => moveItem(parseInt(b.dataset.move)));
  });
  container.querySelectorAll('[data-weigh]').forEach(b => {
    on(b, 'click', () => weighItem(parseInt(b.dataset.weigh)));
  });
  container.querySelectorAll('[data-delete]').forEach(b => {
    on(b, 'click', () => deleteItem(parseInt(b.dataset.delete)));
  });
}
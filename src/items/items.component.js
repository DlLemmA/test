// items.component.js — Items view UI
import { itemsFor, calc, itemHtml, openItemForm, moveItem, weighItem } from './items.js';
import { getCurrentOrder } from '../core/render.js';
import { getCurrentOrderId } from '../core/init.js';
import { renderAll } from '../core/render.js';
import { esc, notify, modal, closeModal } from '../core/utils.js';

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
      <div class="row between">
        <h2>Все товары заказа</h2>
        <input type="search" id="itemSearch" placeholder="Поиск по названию, треку, заказчику" class="w-64" autocomplete="off">
      </div>
      <div id="allItems">${list.map(i=>itemHtml(i,o.status)).join('')||'<div class="empty">Нет товаров</div>'}</div>
    </div>
  `;

  // Debounced search (150ms) to avoid re-rendering on every keystroke
  let searchTimer = null;
  document.getElementById('itemSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = e.target.value.toLowerCase();
      document.getElementById('allItems').innerHTML = list.filter(i =>
        [i.name, i.track, i.customer_name].join(' ').toLowerCase().includes(q)
      ).map(i => itemHtml(i, o.status)).join('') || '<div class="empty">Ничего не найдено</div>';
      bindItemActions();
    }, 150);
  });

  bindItemActions();
}

function bindItemActions() {
  document.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => openItemForm(parseInt(b.dataset.edit)));
  });
  document.querySelectorAll('[data-move]').forEach(b => {
    b.addEventListener('click', () => moveItem(parseInt(b.dataset.move)));
  });
  document.querySelectorAll('[data-weigh]').forEach(b => {
    b.addEventListener('click', () => weighItem(parseInt(b.dataset.weigh)));
  });
}
// render.js — All rendering functions
import { getCurrentOrderId } from './init.js';
import { sql, one, run, persist } from './db.js';
import { exportOrder, openItemForm, moveItem, weighItem } from './events.js';
import { renderOrderView } from '../order/order.component.js';
import { renderPeopleView } from '../persons/persons.component.js';
import { renderHistoryView } from '../history/history.component.js';
import { esc, kg, money } from './utils.js';

export function renderAll() {
  renderOrderView();
  renderItemsView();
  renderPeopleView();
  renderHistoryView();
}

function renderItemsView() {
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
      <div id="allItems">${list.map(i=>itemHtml(i,'В процессе')).join('')||'<div class="empty">Нет товаров</div>'}</div>
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
      ).map(i => itemHtml(i, 'В процессе')).join('') || '<div class="empty">Ничего не найдено</div>';
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

function getCurrentOrder() {
  const id = getCurrentOrderId();
  return id ? one('SELECT * FROM orders WHERE id=?', [id]) : null;
}

function itemsFor(orderId) {
  return sql(`
    SELECT i.*, c.name as customer_name, c.is_self 
    FROM items i JOIN customers c ON c.id=i.customer_id 
    WHERE i.order_id=? ORDER BY i.id
  `, [orderId]);
}

function calc(o) {
  const its = itemsFor(o.id);
  const weighed = its.filter(i => i.weight_g !== null && i.status === 'Взвешен');
  const totalW = weighed.reduce((s, i) => s + (i.weight_g || 0), 0);
  const boxW = o.box_weight_g || 0;
  const free = Math.max(0, boxW - totalW);
  const tariff = boxW > 0 && o.shipping_cost ? Math.round(o.shipping_cost / (boxW / 1000) * 100) / 100 : 0;
  const deliveryTotal = its.reduce((s, i) => s + (i.weight_g ? i.weight_g / 1000 * tariff : 0), 0);

  const perCustomer = {};
  its.forEach(i => {
    if (!perCustomer[i.customer_id]) perCustomer[i.customer_id] = { id: i.customer_id, name: i.customer_name, is_self: i.is_self, items: [], weight: 0, value: 0, delivery: 0, total: 0 };
    const c = perCustomer[i.customer_id];
    c.items.push(i);
    if (i.weight_g && i.status === 'Взвешен') {
      c.weight += i.weight_g;
      c.delivery += i.weight_g / 1000 * tariff;
    }
    c.value += i.price;
    c.total = c.value + c.delivery;
  });

  return { its, totalW, free, tariff, deliveryTotal, perCustomer };
}

function itemHtml(i, orderStatus) {
  const cls = i.status === 'Взвешен' ? 'good' : (i.status === 'Потерян' ? 'bad' : (i.status === 'Пропущен' ? 'warn' : ''));
  return `
    <div class="item">
      <div class="row between">
        <div style="min-width:0">
          <div class="item-title">${esc(i.name)}</div>
          <div class="item-meta">${esc(i.customer_name)} · трек: ${esc(i.track || '—')}</div>
          <div class="row wrap" style="margin-top:6px">
            <span class="pill ${cls}">${esc(i.status)}</span>
            ${i.weight_g !== null && i.status === 'Взвешен' ? `<span class="small muted">${kg(i.weight_g)}</span>` : ''}
          </div>
        </div>
        <div class="item-right">
          <b>${money(i.price)}</b>
          <div class="actions" style="justify-content:flex-end;margin-top:6px">
            <button class="secondary" data-edit="${i.id}">Изменить</button>
            ${orderStatus === 'В процессе' ? `<button class="secondary" data-move="${i.id}">Перенести</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export { calc, getCurrentOrder, itemsFor, itemHtml };
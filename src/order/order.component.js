// order.component.js — Order view UI
import { getCurrentOrder, calc, itemsFor, itemHtml } from '../core/render.js';
import { openReceive, exportOrder } from '../core/events.js';
import { openItemForm, moveItem, weighItem, deleteItem } from '../items/items.js';
import { openOrderForm } from './order.js';
import { createOrder } from '../core/init.js';
import { esc, kg, money, I, notify } from '../core/utils.js';
import { run, persist } from '../core/db.js';
import { on } from '../core/listeners.js';

function formatOrderTitle(o) {
  const num = `№${o.id}`;
  const parts = [];
  if (o.shipped_at) {
    const date = new Date(o.shipped_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    parts.push(`отправлен ${date}`);
  }
  if (o.received_at) {
    const date = new Date(o.received_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    parts.push(`получен ${date}`);
  }
  return parts.length ? `${num} · ${parts.join(' · ')}` : num;
}

function getStatusClass(status) {
  switch (status) {
    case 'В сборке': return 'warn';
    case 'Отправлен': return 'info';
    case 'Получен': return 'good';
    default: return '';
  }
}

export function renderOrderView() {
  const o = getCurrentOrder();
  const root = document.getElementById('orderView');
  if (!root) return;

  if (!o) {
    root.innerHTML = `
      <div class="panel">
        <h2>Нет активного заказа</h2>
        <button class="btn-secondary" id="createFirstOrder">${I.plus} Создать заказ</button>
      </div>
    `;
    on(document.getElementById('createFirstOrder'), 'click', async () => {
      await createOrder();
      renderAll();
    });
    return;
  }

  const c = calc(o);
  const statusCls = getStatusClass(o.status);

  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2>${formatOrderTitle(o)}</h2>
          <div class="item-meta">Статус: <span class="pill ${statusCls}">${esc(o.status)}</span></div>
        </div>
        <div class="actions">
          ${o.status === 'В сборке' ? `<button class="btn-primary" id="shipOrder">${I.package} Отправить</button>` : ''}
          ${o.status === 'Отправлен' ? `<button class="btn-primary" id="receiveOrder">${I.check} Получить</button>` : ''}
          ${o.status === 'Получен' ? `<button class="btn-secondary" id="returnToAssembly">${I.arrowRight} Вернуть в сборку</button>` : ''}
          <button class="btn-secondary" id="editOrder">${I.pencil}</button>
          <button class="btn-secondary" id="exportOrder">${I.sheet}</button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5 mb-3 px-4">
      <div class="metric"><b>${kg(c.totalW)}</b><span>Вес товаров</span></div>
      <div class="metric"><b>${kg(o.box_weight_g)}</b><span>Коробка</span></div>
      <div class="metric"><b>${kg(c.free)}</b><span>Свободный</span></div>
      <div class="metric"><b>${c.tariff} BYN/кг</b><span>Тариф</span></div>
    </div>

    <div class="panel">
      <h3>Сводка по заказчикам</h3>
      <div class="tablewrap" role="region" aria-label="Сводка по заказчикам" tabindex="0">
        <table>
          <thead><tr><th scope="col">Заказчик</th><th scope="col">Товаров</th><th scope="col">Взвешено</th><th scope="col" class="hide-mobile">Вес</th><th scope="col" class="hide-mobile">Стоимость</th><th scope="col" class="hide-mobile">Доставка</th><th scope="col">Итого</th></tr></thead>
          <tbody>
            ${Object.values(c.perCustomer).sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(x=>`
              <tr>
                <td>${esc(x.name)}${x.is_self?' (я)':''}</td>
                <td class="tabular-nums">${x.items.length}</td>
                <td class="tabular-nums">${x.items.filter(i=>i.status==='Взвешен').length}</td>
                <td class="tabular-nums hide-mobile">${kg(x.weight)}</td>
                <td class="tabular-nums hide-mobile">${money(x.value)}</td>
                <td class="tabular-nums hide-mobile">${money(x.delivery)}</td>
                <td class="tabular-nums font-semibold">${money(x.total)}</td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="text-center py-6 text-slate-400">Нет товаров</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <h3>Товары в заказе</h3>
        ${o.status === 'В сборке' ? `<button class="btn-secondary" id="addItem">${I.plus} Добавить товар</button>` : ''}
      </div>
      <div id="orderItemsList">${renderItemsList(o.id, o.status)}</div>
    </div>
  `;

  bindOrderActions(o);
}

function bindOrderActions(o) {
  document.getElementById('shipOrder')?.addEventListener('click', async () => {
    const now = new Date().toISOString().split('T')[0];
    run('UPDATE orders SET status=?, shipped_at=? WHERE id=?', ['Отправлен', now, o.id]);
    await persist();
    renderAll();
    notify('Заказ отправлен');
  });
  
  document.getElementById('receiveOrder')?.addEventListener('click', () => {
    openReceive(o.id);
  });
  
  document.getElementById('returnToAssembly')?.addEventListener('click', async () => {
    confirmSheet('Вернуть в сборку', 'Даты отправления и получения будут очищены. Продолжить?', 'Вернуть', async () => {
      run('UPDATE orders SET status=?, shipped_at=NULL, received_at=NULL WHERE id=?', ['В сборке', o.id]);
      await persist();
      renderAll();
      notify('Заказ возвращен в сборку');
    });
  });

  on(document.getElementById('editOrder'), 'click', () => openOrderForm(o.id));
  on(document.getElementById('exportOrder'), 'click', () => exportOrder(o));
  const addItemBtn = document.getElementById('addItem');
  if (addItemBtn) on(addItemBtn, 'click', () => openItemForm(null, ''));
  
  const listRoot = document.getElementById('orderItemsList');
  if (listRoot) {
    listRoot.querySelectorAll('[data-edit]').forEach(b => {
      on(b, 'click', () => openItemForm(parseInt(b.dataset.edit)));
    });
    listRoot.querySelectorAll('[data-move]').forEach(b => {
      on(b, 'click', () => moveItem(parseInt(b.dataset.move)));
    });
    listRoot.querySelectorAll('[data-weigh]').forEach(b => {
      on(b, 'click', () => weighItem(parseInt(b.dataset.weigh)));
    });
    listRoot.querySelectorAll('[data-delete]').forEach(b => {
      on(b, 'click', () => deleteItem(parseInt(b.dataset.delete)));
    });
  }
}

function renderItemsList(orderId, orderStatus) {
  const its = itemsFor(orderId);
  if (its.length > 50 && 'scheduler' in window && 'yield' in scheduler) {
    const items = its.map(i => itemHtml(i, orderStatus));
    const root = document.getElementById('orderItemsList');
    if (root) {
      root.innerHTML = '';
      items.forEach((html, i) => {
        if (i % 20 === 0 && i > 0) scheduler.yield();
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        root.appendChild(tmp.firstElementChild);
      });
      return;
    }
  }
  return its.map(i => itemHtml(i, orderStatus)).join('') || '<div class="empty">Нет товаров</div>';
}
// order.component.js — Order view UI
import { getCurrentOrder, calc, itemsFor, itemHtml } from '../core/render.js';
import { openReceive, exportOrder } from '../core/events.js';
import { openItemForm, moveItem, weighItem } from '../items/items.js';
import { openOrderForm } from './order.js';
import { createOrder } from '../core/init.js';
import { esc, kg, money, I } from '../core/utils.js';

export function renderOrderView() {
  const o = getCurrentOrder();
  const root = document.getElementById('orderView');
  if (!root) return;

  if (!o) {
    root.innerHTML = `
      <div class="panel">
        <h2>Нет активного заказа</h2>
        <button class="btn-secondary" id="createFirstOrder">Создать заказ</button>
      </div>
    `;
    document.getElementById('createFirstOrder')?.addEventListener('click', async () => {
      await createOrder();
      renderOrderView();
    });
    return;
  }

  const c = calc(o);
  const shipped = o.shipped_at ? ` · отправлен ${o.shipped_at}` : '';
  const statusPill = o.status === 'Завершён' ? 'pill-good' : (o.status === 'В процессе' ? 'pill-warn' : 'pill-default');

  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2>${esc(o.title)}${shipped}</h2>
          <div class="text-xs text-slate-500 mt-0.5">Статус: <span class="pill ${statusPill}">${esc(o.status)}</span></div>
        </div>
        <div class="flex gap-2 flex-wrap">
          ${o.status === 'В процессе' ? `<button class="btn-secondary" id="openReceive">Принять</button>` : ''}
          <button class="btn-secondary" id="editOrder">Изменить</button>
          <button class="btn-secondary" id="exportOrder">Excel</button>
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
        <button class="btn-secondary" id="addItem">+ Товар</button>
      </div>
      <div id="orderItemsList">${renderItemsList(o.id)}</div>
    </div>
  `;

  bindOrderActions(o);
}

function bindOrderActions(o) {
  document.getElementById('openReceive')?.addEventListener('click', () => openReceive(o.id));
  document.getElementById('editOrder')?.addEventListener('click', () => openOrderForm(o.id));
  document.getElementById('exportOrder')?.addEventListener('click', () => exportOrder(o));
  document.getElementById('addItem')?.addEventListener('click', () => openItemForm(null, ''));
  
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

function renderItemsList(orderId) {
  const its = itemsFor(orderId);
  if (its.length > 50 && 'scheduler' in window && 'yield' in scheduler) {
    const items = its.map(i => itemHtml(i, 'В процессе'));
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
  return its.map(i => itemHtml(i, 'В процессе')).join('') || '<div class="empty">Нет товаров</div>';
}

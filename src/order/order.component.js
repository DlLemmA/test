// order.component.js — Order view UI (current order panel, metrics, per-customer summary, items list)
import { getCurrentOrder, calc, itemsFor, itemHtml } from '../core/render.js';
import { openReceive, exportOrder } from '../core/events.js';
import { openItemForm, moveItem, weighItem } from '../items/items.js';
import { openOrderForm } from './order.js';
import { createOrder } from '../core/init.js';
import { esc, kg, money } from '../core/utils.js';

export function renderOrderView() {
  const o = getCurrentOrder();
  const root = document.getElementById('orderView');
  if (!root) return;

  if (!o) {
    root.innerHTML = `
      <div class="panel">
        <h2>Нет активного заказа</h2>
        <button class="secondary" id="createFirstOrder">Создать заказ</button>
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
  const statusCls = o.status === 'Завершён' ? 'good' : (o.status === 'В процессе' ? 'warn' : '');

  root.innerHTML = `
    <div class="panel">
      <div class="row between">
        <div>
          <h2>${esc(o.title)}${shipped}</h2>
          <div class="item-meta">Статус: <span class="pill ${statusCls}">${esc(o.status)}</span></div>
        </div>
        <div class="actions">
          ${o.status === 'В процессе' ? `<button class="secondary" id="openReceive">🎁 Принять посылку</button>` : ''}
          <button class="secondary" id="editOrder">✏️ Редактировать</button>
          <button class="secondary" id="exportOrder">📊 Excel</button>
        </div>
      </div>
    </div>

    <div class="grid four">
      <div class="metric"><b>${kg(c.totalW)}</b><span>Вес товаров</span></div>
      <div class="metric"><b>${kg(o.box_weight_g)}</b><span>Вес коробки</span></div>
      <div class="metric"><b>${kg(c.free)}</b><span>Свободный вес</span></div>
      <div class="metric"><b>${c.tariff} BYN/кг</b><span>Тариф доставки</span></div>
    </div>

    <div class="panel">
      <h3>Сводка по заказчикам</h3>
      <div class="tablewrap" role="region" aria-label="Сводка по заказчикам" tabindex="0">
        <table>
          <thead><tr><th scope="col">Заказчик</th><th scope="col">Товаров</th><th scope="col">Взвешено</th><th scope="col" class="hide-mobile">Вес, кг</th><th scope="col" class="hide-mobile">Стоимость, BYN</th><th scope="col" class="hide-mobile">Доставка, BYN</th><th scope="col">Итого, BYN</th></tr></thead>
          <tbody>
            ${Object.values(c.perCustomer).sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(x=>`
              <tr>
                <td>${esc(x.name)}${x.is_self?' (я)':''}</td>
                <td>${x.items.length}</td>
                <td>${x.items.filter(i=>i.status==='Взвешен').length}</td>
                <td>${kg(x.weight)}</td>
                <td>${money(x.value)}</td>
                <td>${money(x.delivery)}</td>
                <td>${money(x.total)}</td>
              </tr>
            `).join('') || '<tr><td colspan="7" style="text-align:center">Нет товаров</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="row between">
        <h3>Товары в заказе</h3>
        <button class="secondary" id="addItem">➕ Добавить товар</button>
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
  // Yield to main thread for large lists to avoid blocking
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

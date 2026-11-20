// render.js — All rendering functions
import { getCurrentOrderId } from './init.js';
import { sql, one, run, persist } from './db.js';
import { openReceive, openOrderForm, exportOrder, openItemForm, moveItem, weighItem, openCustomerForm, createOrder } from './events.js';

export function renderAll() {
  renderOrderView();
  renderItemsView();
  renderPeopleView();
  renderHistoryView();
}

function renderOrderView() {
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
      renderAll();
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
}

function renderPeopleView() {
  const root = document.getElementById('peopleView');
  if (!root) return;

  const people = customerList();
  root.innerHTML = `
    <div class="panel">
      <div class="row between">
        <h2>Заказчики</h2>
        <button class="secondary" id="addCustomer">➕ Добавить</button>
      </div>
      ${people.length ? people.map(p => `
        <div class="item row between">
          <div><b>${esc(p.name)}${p.is_self?' (я)':''}</b></div>
          <div class="actions">
            <button class="secondary" data-edit-customer="${p.id}">Изменить</button>
            <button class="danger" data-del-customer="${p.id}">Удалить</button>
          </div>
        </div>
      `).join('') : '<div class="empty">Нет заказчиков</div>'}
    </div>
  `;

  document.getElementById('addCustomer')?.addEventListener('click', () => openCustomerForm());
  document.querySelectorAll('[data-edit-customer]').forEach(b => {
    b.addEventListener('click', () => openCustomerForm(parseInt(b.dataset.editCustomer)));
  });
  document.querySelectorAll('[data-del-customer]').forEach(b => {
    b.addEventListener('click', async () => {
      if (confirm('Удалить заказчика?')) {
        run('DELETE FROM customers WHERE id=?', [parseInt(b.dataset.delCustomer)]);
        await persist();
        renderAll();
      }
    });
  });
}

function renderHistoryView() {
  const root = document.getElementById('historyView');
  if (!root) return;

  const orders = sql('SELECT * FROM orders ORDER BY created_at DESC');
  root.innerHTML = `
    <div class="panel">
      <h2>История заказов</h2>
      ${orders.length ? orders.map(o => `
        <div class="item row between">
          <div>
            <b>${esc(o.title)}</b><br>
            <span class="small muted">${o.created_at} · ${o.status} · ${sql('SELECT COUNT(*) as c FROM items WHERE order_id=?', [o.id])[0].c} товаров</span>
          </div>
          <div class="actions">
            <button class="secondary" data-switch="${o.id}">${o.id === getCurrentOrderId() ? 'Текущий' : 'Сделать текущим'}</button>
            <button class="secondary" data-export="${o.id}">Excel</button>
            <button class="danger" data-del="${o.id}">Удалить</button>
          </div>
        </div>
      `).join('') : '<div class="empty">Нет заказов</div>'}
    </div>
  `;

  document.querySelectorAll('[data-switch]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = parseInt(b.dataset.switch);
      const { setCurrentOrderId } = await import('./init.js');
      setCurrentOrderId(id);
      renderAll();
    });
  });
  document.querySelectorAll('[data-export]').forEach(b => {
    b.addEventListener('click', () => {
      const o = one('SELECT * FROM orders WHERE id=?', [parseInt(b.dataset.export)]);
      exportOrder(o);
    });
  });
  document.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      if (confirm('Удалить заказ со всеми товарами?')) {
        const id = parseInt(b.dataset.del);
        run('DELETE FROM items WHERE order_id=?', [id]);
        run('DELETE FROM orders WHERE id=?', [id]);
        await persist();
        renderAll();
      }
    });
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

function customerList() {
  return sql('SELECT * FROM customers ORDER BY is_self DESC, name');
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

function renderItemsList(orderId) {
  const its = itemsFor(orderId);
  // Yield to main thread for large lists to avoid blocking
  if (its.length > 50 && 'scheduler' in window && 'yield' in scheduler) {
    const items = its.map(i => itemHtml(i, 'В процессe'));
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

function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[c]));
}

function kg(g) {
  return g == null ? '—' : (g / 1000).toFixed(3);
}

function money(v) {
  return (v || 0).toFixed(2);
}

export { calc, getCurrentOrder, itemsFor, customerList, kg, money, esc };

// Functions imported from events.js
export { openReceive, openOrderForm, exportOrder, openItemForm, moveItem, weighItem, openCustomerForm, createOrder } from './events.js';
// items.js — Item business logic
import { sql, run, one, persist } from '../core/db.js';
import { getCurrentOrderId } from '../core/init.js';
import { renderAll } from '../core/render.js';
import { esc, notify, I } from '../core/utils.js';
import { modal, closeModal } from '../core/sheet.js';
import { on } from '../core/listeners.js';

export function itemsFor(orderId) {
  return sql(`
    SELECT i.*, c.name as customer_name, c.is_self
    FROM items i JOIN customers c ON c.id=i.customer_id
    WHERE i.order_id=? ORDER BY i.id
  `, [orderId]);
}

export function calc(order) {
  const its = itemsFor(order.id);
  const weighed = its.filter(i => i.weight_g !== null && i.status === 'Взвешен');
  const totalW = weighed.reduce((s, i) => s + (i.weight_g || 0), 0);
  const boxW = order.box_weight_g || 0;
  const free = Math.max(0, boxW - totalW);
  const tariff = boxW > 0 && order.shipping_cost ? Math.round(order.shipping_cost / (boxW / 1000) * 100) / 100 : 0;
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

export function openItemForm(id = null) {
  const oid = getCurrentOrderId();
  if (!oid) return notify('Сначала создайте заказ', 'warn');

  const c = id ? one('SELECT * FROM items WHERE id=?', [id]) : null;
  const isNew = !c;

  const customers = sql('SELECT * FROM customers ORDER BY is_self DESC, name');
  const customerOptions = customers.map(c => `<option value="${c.id}" ${c.id === c?.customer_id ? 'selected' : ''}>${esc(c.name)}${c.is_self?' (я)':''}</option>`).join('');

  modal(isNew ? 'Новый товар' : 'Редактировать товар', `
    <form id="itemForm" novalidate>
      <div class="field"><label>Название *</label><input name="name" required autocomplete="off" autofocus value="${esc(c?.name || '')}"></div>
      <div class="field"><label>Заказчик *</label><select name="customer_id" required>${customerOptions}</select></div>
      <div class="field"><label>Трек-номер</label><input name="track" autocomplete="off" value="${esc(c?.track || '')}"></div>
      <div class="field"><label>Цена Br *</label><input name="price" type="number" step="0.01" required value="${c?.price || ''}"></div>
      <div class="field"><label>Статус</label><select name="status">${['В сборке','Взвешен','Ожидает взвешивания','Потерян','Пропущен'].map(s => `<option ${c?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Вес (г)</label><input name="weight_g" type="number" step="1" value="${c?.weight_g || ''}"></div>
      <div class="actions"><button type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
    </form>
  `);

  on(document.getElementById('itemForm'), 'submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = {
      order_id: oid,
      name: f.get('name').trim(),
      customer_id: parseInt(f.get('customer_id')),
      track: f.get('track').trim() || null,
      price: parseFloat(f.get('price')),
      status: f.get('status'),
      weight_g: f.get('weight_g') ? parseInt(f.get('weight_g')) : null
    };

    if (isNew) {
      run('INSERT INTO items(order_id, name, customer_id, track, price, status, weight_g) VALUES(?,?,?,?,?,?,?)',
        [data.order_id, data.name, data.customer_id, data.track, data.price, data.status, data.weight_g]);
    } else {
      run('UPDATE items SET name=?, customer_id=?, track=?, price=?, status=?, weight_g=? WHERE id=?',
        [data.name, data.customer_id, data.track, data.price, data.status, data.weight_g, id]);
    }
    await persist();
    closeModal();
    renderAll();
    notify('Товар сохранён');
  });
}

export async function moveItem(id) {
  const item = one('SELECT * FROM items WHERE id=?', [id]);
  if (!item) return;

  // Find next unshipped order (excluding current)
  const nextOrders = sql(`SELECT * FROM orders WHERE id!=? AND shipped_at IS NULL ORDER BY created_at DESC LIMIT 1`, [getCurrentOrderId()]);

  if (nextOrders.length) {
    // Move to next unshipped order
    run('UPDATE items SET order_id=? WHERE id=?', [nextOrders[0].id, id]);
    await persist();
    renderAll();
    notify(`Товар перенесён в заказ №${nextOrders[0].id}`);
  } else {
    // Create new order and move item there
    const dateStr = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const orderTitle = `Заказ от ${dateStr}`;
    const now = new Date().toISOString();
    run(`INSERT INTO orders(title, status, created_at) VALUES(?, 'В сборке', ?)`, [orderTitle, now]);
    await persist();
    const newOrder = one('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1');
    run('UPDATE items SET order_id=? WHERE id=?', [newOrder.id, id]);
    await persist();
    renderAll();
    notify(`Товар перенесён в новый заказ №${newOrder.id}`);
  }
}

export async function deleteItem(id) {
  confirmSheet('Удалить товар', 'Товар будет удалён. Это действие нельзя отменить.', 'Удалить', async () => {
    run('DELETE FROM items WHERE id=?', [id]);
    await persist();
    renderAll();
    notify('Товар удалён');
  });
}

export async function weighItem(id) {
  const item = one('SELECT * FROM items WHERE id=?', [id]);
  if (!item) return;
  modal('Взвесить товар', `
    <form id="weighForm">
      <div class="field"><label>Вес (г) *</label><input name="weight_g" type="number" step="1" required autofocus></div>
      <div class="actions"><button type="submit">Сохранить вес</button></div>
    </form>
  `);
  on(document.getElementById('weighForm'), 'submit', async e => {
    e.preventDefault();
    const weight_g = parseInt(new FormData(e.target).get('weight_g'));
    run('UPDATE items SET weight_g=?, status=? WHERE id=?', [weight_g, 'Взвешен', id]);
    await persist();
    closeModal();
    renderAll();
    notify('Вес сохранён');
  });
}

export function itemHtml(i, orderStatus) {
  const statusCls = i.status === 'Взвешен' ? 'pill-good' : (i.status === 'Потерян' ? 'pill-bad' : (i.status === 'Пропущен' ? 'pill-warn' : 'pill-default'));
  return `
    <div class="item">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="font-bold truncate">${esc(i.name)}</div>
          <div class="text-xs text-slate-500 mt-0.5 truncate">${esc(i.customer_name)} · трек: ${esc(i.track || '—')}</div>
          <div class="flex items-center gap-2 flex-wrap mt-1.5">
            <span class="pill ${statusCls}">${esc(i.status)}</span>
            ${i.weight_g !== null && i.status === 'Взвешен' ? `<span class="text-xs text-slate-500 tabular-nums">${(i.weight_g / 1000).toFixed(3)} кг</span>` : ''}
          </div>
        </div>
        <div class="item-right shrink-0">
          <b class="tabular-nums">${(i.price || 0).toFixed(2)} Br</b>
          <div class="flex gap-2 justify-end mt-1.5">
            <button class="btn-secondary" data-edit="${i.id}">${I.pencil}</button>
            ${orderStatus === 'В сборке' ? `<button class="btn-secondary" data-move="${i.id}">${I.arrowRight}</button>` : ''}
            <button class="btn-danger" data-delete="${i.id}">${I.trash}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
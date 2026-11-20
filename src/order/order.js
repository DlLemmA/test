// order.js — Order management: form, switching, deletion
// Status derived from dates: shipped_at/received_at
import { one, run, persist, sql } from '../core/db.js';
import { setCurrentOrderId, createOrder } from '../core/init.js';
import { renderAll } from '../core/render.js';
import { esc, notify, I } from '../core/utils.js';
import { modal, closeModal, confirmSheet } from '../core/sheet.js';
import { on } from '../core/listeners.js';
import { canCloseOrder } from '../items/itemStatus.js';

/** Derive order status from dates */
export function getOrderStatus(order) {
  if (order.received_at) return 'Получен';
  if (order.shipped_at) return 'Отправлен';
  return 'В сборке';
}

export function switchOrder(id) {
  setCurrentOrderId(id);
  renderAll();
}

export async function deleteOrder(id) {
  confirmSheet('Удалить заказ', 'Заказ будет удалён со всеми товарами. Это действие нельзя отменить.', 'Удалить', async () => {
    run('DELETE FROM items WHERE order_id=?', [id]);
    run('DELETE FROM orders WHERE id=?', [id]);
    await persist();
    renderAll();
    notify('Заказ удалён');
  });
}

export function openOrderForm(orderId = null) {
  const o = orderId ? one('SELECT * FROM orders WHERE id=?', [orderId]) : null;
  const isNew = !o;
  const status = o ? getOrderStatus(o) : 'В сборке';

  // Check if order can be marked as received (all items terminal)
  const canReceive = o ? canCloseOrder(o.id) : false;

  modal(isNew ? 'Новый заказ' : 'Редактировать заказ', `
    <form id="orderForm" novalidate>
      <div class="field"><label>Название заказ *</label><input name="title" required autocomplete="organization-title" autofocus value="${esc(o?.title || '')}" placeholder="Например, Заказ от 20.11.2026"></div>
      
      <div class="field">
        <label>Статус</label>
        <div class="pill ${getStatusClass(status)}" style="width: fit-content; padding: 0.25rem 0.75rem;">${esc(status)}</div>
        <p class="text-xs text-slate-500 mt-1">
          ${status === 'В сборке' ? 'Укажите дату отправления → станет «Отправлен»' : ''}
          ${status === 'Отправлен' ? (canReceive ? 'Укажите дату получения → станет «Получен»' : '⚠ Не все товары доставлены/потеряны — заказ нельзя получить') : ''}
          ${status === 'Получен' ? 'Заказ завершён' : ''}
        </p>
      </div>

      <div class="field"><label>Дата отправления</label><input name="shipped_at" type="date" value="${o?.shipped_at || ''}" ${status === 'Получен' ? 'readonly' : ''}></div>
      <div class="field"><label>Дата получения</label><input name="received_at" type="date" value="${o?.received_at || ''}" ${status !== 'Отправлен' || !canReceive ? 'readonly' : ''}></div>
      
      ${!isNew ? `
        <div class="field"><label>Вес коробки (г)</label><input name="box_weight_g" type="number" min="0" step="1" inputmode="numeric" autocomplete="off" value="${o?.box_weight_g ?? ''}" placeholder="Например, 6000"></div>
        <div class="field"><label>Стоимость доставки (BYN)</label><input name="shipping_cost" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" value="${o?.shipping_cost ?? ''}" placeholder="Например, 30.00"></div>
      ` : ''}
      <div class="actions"><button type="submit" ${!isNew && status === 'Отправлен' && !canReceive ? 'disabled' : ''}>${isNew ? 'Создать' : 'Сохранить'}</button>${!isNew?'<button type="button" class="danger" id="deleteOrder">${I.trash} Удалить</button>':''}</div>
    </form>
  `);

  on(document.getElementById('orderForm'), 'submit', async e => {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const f = new FormData(form);
      const title = f.get('title').trim();
      const shipped_at = f.get('shipped_at') || null;
      const received_at = f.get('received_at') || null;
      const box_weight_g = f.get('box_weight_g') === '' ? null : parseInt(f.get('box_weight_g'));
      const shipping_cost = f.get('shipping_cost') === '' ? null : parseFloat(f.get('shipping_cost'));

      if (isNew) {
        await createOrder(title);
      } else {
        // Validate: can't set received_at unless all items terminal
        if (received_at && !canCloseOrder(orderId)) {
          notify('Нельзя получить заказ: не все товары доставлены или потеряны', 'error');
          return;
        }
        run(`UPDATE orders SET title=?, shipped_at=?, received_at=?, box_weight_g=?, shipping_cost=? WHERE id=?`,
          [title, shipped_at, received_at, box_weight_g, shipping_cost, orderId]);
        await persist();
      }
      closeModal();
      renderAll();
      notify(isNew ? 'Заказ создан' : 'Заказ сохранён');
    } finally {
      submitBtn.disabled = false;
    }
  });

  on(document.getElementById('deleteOrder'), 'click', async () => {
    confirmSheet('Удалить заказ', 'Заказ будет удалён со всеми товарами. Это действие нельзя отменить.', 'Удалить', async () => {
      run('DELETE FROM items WHERE order_id=?', [orderId]);
      run('DELETE FROM orders WHERE id=?', [orderId]);
      await persist();
      closeModal();
      renderAll();
      notify('Заказ удалён');
    });
  });
}

function getStatusClass(status) {
  switch (status) {
    case 'В сборке': return 'warn';
    case 'Отправлен': return 'info';
    case 'Получен': return 'good';
    default: return '';
  }
}
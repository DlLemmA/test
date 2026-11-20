// history.js — Order history logic
import { sql, run, one, persist } from '../core/db.js';
import { setCurrentOrderId, getCurrentOrderId } from '../core/init.js';
import { exportOrder } from '../core/events.js';
import { renderAll } from '../core/render.js';
import { esc, notify, confirmSheet } from '../core/utils.js';

export function getAllOrders() {
  return sql('SELECT * FROM orders ORDER BY created_at DESC');
}

export function renderHistoryData() {
  return getAllOrders().map(o => ({
    ...o,
    itemCount: sql('SELECT COUNT(*) as c FROM items WHERE order_id=?', [o.id])[0].c
  }));
}

export function switchToOrder(id) {
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

export function exportOrderData(o) {
  exportOrder(o);
}
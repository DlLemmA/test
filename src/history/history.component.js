// history.component.js — History view UI
import { renderHistoryData, switchToOrder, deleteOrder, exportOrderData } from './history.js';
import { getCurrentOrderId } from '../core/init.js';
import { sql } from '../core/db.js';
import { exportOrder } from '../core/events.js';
import { esc } from '../core/utils.js';

export function renderHistoryView() {
  const root = document.getElementById('historyView');
  if (!root) return;

  const orders = renderHistoryData();
  const currentId = getCurrentOrderId();
  
  root.innerHTML = `
    <div class="panel">
      <h2>История заказов</h2>
      ${orders.length ? orders.map(o => `
        <div class="item row between">
          <div>
            <b>${esc(o.title)}</b><br>
            <span class="small muted">${o.created_at} · ${o.status} · ${o.itemCount} товаров</span>
          </div>
          <div class="actions">
            <button class="secondary" data-switch="${o.id}">${o.id === currentId ? 'Текущий' : 'Сделать текущим'}</button>
            <button class="secondary" data-export="${o.id}">Excel</button>
            <button class="danger" data-del="${o.id}">Удалить</button>
          </div>
        </div>
      `).join('') : '<div class="empty">Нет заказов</div>'}
    </div>
  `;

  document.querySelectorAll('[data-switch]').forEach(b => {
    b.addEventListener('click', () => switchToOrder(parseInt(b.dataset.switch)));
  });
  document.querySelectorAll('[data-export]').forEach(b => {
    b.addEventListener('click', () => {
      const order = sql('SELECT * FROM orders WHERE id=?', [parseInt(b.dataset.export)])[0];
      exportOrder(order);
    });
  });
  document.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      await deleteOrder(parseInt(b.dataset.del));
    });
  });
}
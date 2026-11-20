// history.component.js — History view UI
import { renderHistoryData } from './history.js';
import { exportOrder, deleteOrder } from '../core/events.js';
import { getCurrentOrderId, setCurrentOrderId, setCurrentTab, createOrder } from '../core/init.js';
import { renderAll } from '../core/render.js';
import { esc, I } from '../core/utils.js';
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

export function renderHistoryView() {
  const root = document.getElementById('historyView');
  if (!root) return;

  const orders = renderHistoryData();
  const currentId = getCurrentOrderId();
  
  root.innerHTML = `
    <div class="panel">
      <div class="row between">
        <h2>История заказов</h2>
        <button class="btn-secondary" id="createOrderBtn">${I.plus} Создать заказ</button>
      </div>
      ${orders.length ? orders.map(o => `
        <div class="item flex items-center justify-between gap-3">
          <div>
            <b>${formatOrderTitle(o)}</b><br>
            <span class="small muted">${o.status} · ${o.itemCount} товаров</span>
          </div>
          <div class="actions">
            <button class="btn-secondary" data-switch="${o.id}">${o.id === currentId ? 'Текущий' : 'Открыть'}</button>
            <button class="btn-secondary" data-export="${o.id}">${I.sheet}</button>
            <button class="btn-danger" data-del="${o.id}">${I.trash}</button>
          </div>
        </div>
      `).join('') : '<div class="empty">Нет заказов</div>'}
    </div>
  `;

  on(document.getElementById('createOrderBtn'), 'click', async () => {
    await createOrder();
    setCurrentTab('order');
    renderAll();
  });

  document.querySelectorAll('[data-switch]').forEach(b => {
    on(b, 'click', () => {
      const id = parseInt(b.dataset.switch);
      setCurrentOrderId(id);
      setCurrentTab('order');
      renderAll();
    });
  });

  document.querySelectorAll('[data-export]').forEach(b => {
    on(b, 'click', () => {
      const orderId = parseInt(b.dataset.export);
      import('../core/db.js').then(m => {
        const order = m.one('SELECT * FROM orders WHERE id=?', [orderId])[0];
        if (order) exportOrder(order);
      });
    });
  });
  document.querySelectorAll('[data-del]').forEach(b => {
    on(b, 'click', async () => {
      await deleteOrder(parseInt(b.dataset.del));
    });
  });
}
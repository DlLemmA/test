// customers.component.js — Customers view UI
import { customerList } from './customers.js';
import { openCustomerForm, deleteCustomer } from '../core/events.js';
import { esc, I } from '../core/utils.js';
import { on } from '../core/listeners.js';

export function renderPeopleView() {
  const root = document.getElementById('peopleView');
  if (!root) return;

  const people = customerList();
  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2>Заказчики</h2>
        <button class="btn-secondary" id="addCustomer">${I.plus} Добавить</button>
      </div>
      ${people.length ? people.map(p => `
        <div class="item flex items-center justify-between gap-3">
          <div><b>${esc(p.name)}${p.is_self?' (я)':''}</b></div>
          <div class="flex gap-2">
            <button class="btn-secondary" data-edit-customer="${p.id}">Изменить</button>
            <button class="btn-danger" data-del-customer="${p.id}">Удалить</button>
          </div>
        </div>
      `).join('') : '<div class="empty">Нет заказчиков</div>'}
    </div>
  `;

  on(document.getElementById('addCustomer'), 'click', () => openCustomerForm());
  document.querySelectorAll('[data-edit-customer]').forEach(b => {
    on(b, 'click', () => openCustomerForm(parseInt(b.dataset.editCustomer)));
  });
  document.querySelectorAll('[data-del-customer]').forEach(b => {
    on(b, 'click', async () => {
      await deleteCustomer(parseInt(b.dataset.delCustomer));
    });
  });
}

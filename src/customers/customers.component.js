// customers.component.js — Customers view UI
import { customerList, openCustomerForm, deleteCustomer } from './customers.js';
import { esc } from '../core/utils.js';

export function renderPeopleView() {
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
      await deleteCustomer(parseInt(b.dataset.delCustomer));
    });
  });
}
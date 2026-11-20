// customers.js — Customer management logic
import { sql, run, one, persist } from '../core/db.js';
import { renderAll } from '../core/render.js';
import { esc, notify, modal, closeModal } from '../core/utils.js';

export function customerList() {
  return sql('SELECT * FROM customers ORDER BY is_self DESC, name');
}

export function openCustomerForm(id = null) {
  const c = id ? one('SELECT * FROM customers WHERE id=?', [id]) : null;
  const isNew = !c;
  
  modal(isNew ? 'Новый заказчик' : 'Редактировать заказчика', `
    <form id="customerForm" novalidate>
      <div class="field"><label>Имя *</label><input name="name" required autocomplete="name" autofocus value="${esc(c?.name || '')}" placeholder="Иван"></div>
      <div class="field"><label><input name="is_self" type="checkbox" ${c?.is_self ? 'checked' : ''}> Это я</label></div>
      <div class="actions"><button type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
    </form>
  `);

  document.getElementById('customerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    const is_self = f.get('is_self') ? 1 : 0;
    
    if (isNew) {
      run('INSERT INTO customers(name, is_self) VALUES(?, ?)', [name, is_self]);
    } else {
      run('UPDATE customers SET name=?, is_self=? WHERE id=?', [name, is_self, id]);
    }
    await persist();
    closeModal();
    renderAll();
    notify('Заказчик сохранён');
  });
}

export async function deleteCustomer(id) {
  if (confirm('Удалить заказчика?')) {
    run('DELETE FROM customers WHERE id=?', [id]);
    await persist();
    renderAll();
    notify('Заказчик удалён');
  }
}
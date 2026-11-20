// init.js — Application initialization
import { initDB, sql, run, persist } from './db.js';
import { renderAll, initStatic } from './render.js';
import { esc, notify } from './utils.js';
import { modal, closeModal } from './sheet.js';
import { on } from './listeners.js';

let currentOrderId = null;

export async function initApp() {
  await initDB();
  
  // Check if this is first run — no customers yet
  const customers = sql('SELECT * FROM customers');
  if (!customers.length) {
    await promptUserName();
  }
  
  await loadCurrentOrder();
  renderAll();
  initStatic();
}

async function promptUserName() {
  return new Promise(resolve => {
    modal('Добро пожаловать!', `
      <div class="notice">Давайте начнём с вашего имени.</div>
      <form id="nameForm">
        <div class="field"><label>Ваше имя *</label><input name="name" required autocomplete="name" autofocus placeholder="Иван"></div>
        <div class="actions"><button type="submit">Продолжить</button></div>
      </form>
    `);
    
    on(document.getElementById('nameForm'), 'submit', async e => {
      e.preventDefault();
      const name = new FormData(e.target).get('name').trim();
      run('INSERT INTO customers(name, is_self) VALUES(?, 1)', [name]);
      await persist();
      closeModal();
      notify('Привет, ' + esc(name) + '!');
      resolve();
    });
  });
}

export async function loadCurrentOrder() {
  const orders = sql(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 1`);
  if (orders.length) {
    currentOrderId = orders[0].id;
  }
  return currentOrderId;
}

export function getCurrentOrderId() {
  return currentOrderId;
}

export function setCurrentOrderId(id) {
  currentOrderId = id;
}

export async function createOrder(title = null) {
  const now = new Date().toISOString();
  let orderTitle = title;
  if (!orderTitle) {
    const dateStr = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    orderTitle = `Заказ от ${dateStr}`;
  }
  run(`INSERT INTO orders(title, status, created_at) VALUES(?, 'В процессе', ?)`, [orderTitle, now]);
  await persist();
  await loadCurrentOrder();
  return currentOrderId;
}

export { persist };
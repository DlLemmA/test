// init.js — Application initialization
import { initDB, sql, run, persist } from './db.js';
import { renderAll } from './render.js';
import { bindEvents } from './events.js';

let currentOrderId = null;

export async function initApp() {
  await initDB();
  await loadCurrentOrder();
  bindEvents();
  renderAll();
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
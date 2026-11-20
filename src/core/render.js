// render.js — All rendering functions
import { getCurrentOrderId } from './init.js';
import { sql, one, run, persist } from './db.js';
import { exportOrder } from './events.js';
import { renderOrderView } from '../order/order.component.js';
import { renderItemsView } from '../items/items.component.js';
import { renderPeopleView } from '../customers/customers.component.js';
import { renderHistoryView } from '../history/history.component.js';
import { esc, kg, money } from './utils.js';

export function renderAll() {
  renderOrderView();
  renderItemsView();
  renderPeopleView();
  renderHistoryView();
}

function getCurrentOrder() {
  const id = getCurrentOrderId();
  return id ? one('SELECT * FROM orders WHERE id=?', [id]) : null;
}

// Re-export from items module for order.component.js
import { calc, itemsFor, itemHtml } from '../items/items.js';
export { calc, getCurrentOrder, itemsFor, itemHtml };
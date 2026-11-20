// history.js — Order history data layer
import { sql, run, one, persist } from '../core/db.js';
import { setCurrentOrderId } from '../core/init.js';
import { renderAll } from '../core/render.js';
import { notify } from '../core/utils.js';
import { confirmSheet } from '../core/utils.js';

export function getAllOrders() {
  return sql('SELECT * FROM orders ORDER BY created_at DESC');
}

export function renderHistoryData() {
  return getAllOrders().map(o => ({
    ...o,
    itemCount: sql('SELECT COUNT(*) as c FROM items WHERE order_id=?', [o.id])[0].c
  }));
}
// itemStatus.js — Derived item status from actual data
// No explicit status column needed — status IS the data

/**
 * Derive item status from business data
 * @param {Object} item - Item row from DB
 * @returns {string} One of: 'Ожидает трек номер', 'В заказе', 'Доставлен', 'Потерян'
 */
export function getItemStatus(item) {
  if (item.lost_date) return 'Потерян';
  if (item.weight_g !== null && item.weight_g !== undefined) return 'Доставлен';
  if (item.track && item.track.trim()) return 'В заказе';
  return 'Ожидает трек номер';
}

/**
 * Check if item is in a terminal state (order can be completed)
 * @param {Object} item
 * @returns {boolean}
 */
export function isItemTerminal(item) {
  const status = getItemStatus(item);
  return status === 'Доставлен' || status === 'Потерян';
}

/**
 * Check if all items in an order are terminal (order can be closed)
 * @param {number} orderId
 * @returns {boolean}
 */
export function canCloseOrder(orderId) {
  const { sql } = window.db;
  const items = sql('SELECT * FROM items WHERE order_id=?', [orderId]);
  return items.length > 0 && items.every(isItemTerminal);
}

/**
 * Get display label + CSS class for status pill
 * @param {Object} item
 * @returns {{label: string, class: string}}
 */
export function getItemStatusUI(item) {
  const status = getItemStatus(item);
  const map = {
    'Ожидает трек номер': { label: 'Ожидает трек', class: 'pill-warn' },
    'В заказе': { label: 'В заказе', class: 'pill-default' },
    'Доставлен': { label: 'Доставлен', class: 'pill-good' },
    'Потерян': { label: 'Потерян', class: 'pill-bad' },
  };
  return map[status] || { label: status, class: 'pill-default' };
}

/**
 * Migration: add lost_date column, drop status column
 * Run once after updating schema version
 */
export async function migrateItemsStatus() {
  const { run, sql, persist } = window.db;
  
  // 1. Add lost_date column (nullable)
  try {
    run('ALTER TABLE items ADD COLUMN lost_date TEXT');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  
  // 2. Migrate existing status values to data fields
  //    'Потерян' → set lost_date to created_at (or today)
  //    'Взвешен' → weight_g already set
  //    Others → no action needed (track/weight_g drive status)
  const legacyLost = sql(`SELECT id, created_at FROM items WHERE status='Потерян' AND lost_date IS NULL`);
  for (const item of legacyLost) {
    run('UPDATE items SET lost_date=? WHERE id=?', [item.created_at, item.id]);
  }
  
  // 3. Drop status column (SQLite doesn't support DROP COLUMN directly)
  //    We'll keep it for now but ignore it in code. 
  //    To fully drop: create new table, copy, rename.
  
  await persist();
  console.log('Items status migration done');
}
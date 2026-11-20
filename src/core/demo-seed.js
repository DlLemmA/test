// demo-seed.js — Demo data seeding
import { sql, run, persist, one } from './db.js';
import { dateNow } from './utils.js';

export async function seedDemo() {
  // Clear existing data for current order
  const orderId = await ensureDemoOrder();
  
  // Create demo customers
  const ivan = await ensureCustomer('Иван', true);
  const sasha = await ensureCustomer('Саша', false);
  
  // Update order with demo details
  run(`UPDATE orders SET title=?, box_weight_g=?, shipping_cost=? WHERE id=?`, 
    ['Демо-заказ (Пиндуодуо)', 6000, 3000, orderId]);
  
  // Demo items: [name, customer_id, track, price, status, weight_g]
  const demo = [
    ['Кроссовки', ivan, 'CN100001', 1200, 'Взвешен', 1200],
    ['Футболка', ivan, 'CN100002', 350, 'Взвешен', 900],
    ['Рюкзак', ivan, 'CN100003', 800, 'Ожидает взвешивания', null],
    ['Наушники', sasha, 'CN200001', 450, 'Взвешен', 1000],
    ['Куртка', sasha, 'CN200002', 980, 'Взвешен', 1000],
    ['Чехол', sasha, 'CN200003', 80, 'Потерян', null]
  ];
  
  for (const [name, customer_id, track, price, status, weight_g] of demo) {
    run(`INSERT INTO items(order_id, customer_id, name, track, price, status, weight_g, created_at) 
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, 
      [orderId, customer_id, name, track, price, status, weight_g, dateNow()]);
  }
  
  await persist();
  return orderId;
}

async function ensureDemoOrder() {
  let order = one(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 1`);
  if (!order) {
    run(`INSERT INTO orders(title, status, created_at) VALUES('Демо-заказ', 'В процессе', ?)`, [dateNow()]);
    order = one(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 1`);
  }
  return order.id;
}

async function ensureCustomer(name, is_self) {
  let c = one(`SELECT * FROM customers WHERE name=?`, [name]);
  if (!c) {
    run(`INSERT INTO customers(name, is_self) VALUES(?, ?)`, [name, is_self ? 1 : 0]);
    c = one(`SELECT * FROM customers WHERE name=?`, [name]);
  }
  return c.id;
}
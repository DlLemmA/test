// demo-seed.js — Demo data seeding
import { sql, run, persist, one } from './db.js';
import { dateNow } from './utils.js';

export async function seedDemo() {
  // Clear existing data for current order
  const orderId = await ensureDemoOrder();
  
  // Create demo customers
  const ivan = await ensureCustomer('Иван', false);
  const sasha = await ensureCustomer('Саша', false);
  
  // Update order with demo details: 25 kg box, 15 BYN/kg = 375 BYN shipping
  run(`UPDATE orders SET title=?, box_weight_g=?, shipping_cost=? WHERE id=?`, 
    ['Демо-заказ (Пиндуодуо)', 25000, 375, orderId]);
  
  // Demo items: [name, customer_id, track, price, status, weight_g]
  // Realistic BYN prices: most items under 50 BYN, electronics up to 500 BYN, dish sets ~300 BYN
  const demo = [
    ['Кроссовки', ivan, 'CN100001', 45, 'Взвешен', 3500],
    ['Футболка', ivan, 'CN100002', 12, 'Взвешен', 800],
    ['Джинсы', ivan, 'CN100003', 25, 'Взвешен', 1200],
    ['Худи', ivan, 'CN100004', 35, 'Взвешен', 2000],
    ['Куртка', ivan, 'CN100005', 55, 'Взвешен', 4000],
    ['Наушники', sasha, 'CN200001', 28, 'Взвешен', 600],
    ['Рюкзак', sasha, 'CN200002', 42, 'Взвешен', 2500],
    ['Умные часы', sasha, 'CN200003', 180, 'Взвешен', 300],
    ['Платье', sasha, 'CN200004', 18, 'Взвешен', 900],
    ['Ботинки', sasha, 'CN200005', 48, 'Взвешен', 3200],
    ['Пылесос робот', sasha, 'CN200006', 520, 'Ожидает взвешивания', null],
    ['Набор посуды 24 предмета', ivan, 'CN200007', 320, 'Ожидает взвешивания', null],
    ['Шарф', sasha, 'CN200008', 8, 'Ожидает взвешивания', null],
    ['Перчатки', sasha, 'CN200009', 6, 'Ожидает взвешивания', null]
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
// ============================================
// Demo Data Seeding (Dexie version)
// ============================================

import { db } from "./database";
import { Customer } from "@/features/customers/domain";
import { Order, Item } from "@/features/orders/domain";

export async function seedDemo(force = false): Promise<void> {
  if (!force) {
    // Check if demo data already exists
    const existingCustomers = await db.customers.count();
    if (existingCustomers > 0) {
      console.log("Demo data already exists, skipping seed (use force=true to override)");
      return;
    }
  } else {
    // Clear existing data
    await db.customers.clear();
    await db.orders.clear();
    await db.items.clear();
  }

  console.log("Seeding demo data...");

  // Create demo customers
  const ivan = await db.customers.add(
    Customer.create({ name: "Иван", isSelf: false }).toPersistence(),
  );
  const sasha = await db.customers.add(
    Customer.create({ name: "Саша", isSelf: false }).toPersistence(),
  );

  // Create self customer
  const self = await db.customers.add(Customer.create({ name: "Я", isSelf: true }).toPersistence());

  // Create demo order
  const order = await db.orders.add(
    Order.create({ title: "Демо-заказ (Пиндуодуо)" }).toPersistence(),
  );

  // Demo items: [name, customerId, track, price, status, weightG]
  const demoItems = [
    {
      name: "Кроссовки",
      customerId: ivan,
      track: "CN100001",
      price: 45,
      status: "Взвешен" as const,
      weightG: 3500,
    },
    {
      name: "Футболка",
      customerId: ivan,
      track: "CN100002",
      price: 12,
      status: "Взвешен" as const,
      weightG: 800,
    },
    {
      name: "Джинсы",
      customerId: ivan,
      track: "CN100003",
      price: 25,
      status: "Взвешен" as const,
      weightG: 1200,
    },
    {
      name: "Худи",
      customerId: ivan,
      track: "CN100004",
      price: 35,
      status: "Взвешен" as const,
      weightG: 2000,
    },
    {
      name: "Куртка",
      customerId: sasha,
      track: "CN100005",
      price: 55,
      status: "Взвешен" as const,
      weightG: 4000,
    },
    {
      name: "Кроссовки 2",
      customerId: sasha,
      track: "CN100006",
      price: 48,
      status: "Взвешен" as const,
      weightG: 3200,
    },
    {
      name: "Штаны",
      customerId: sasha,
      track: "CN100007",
      price: 30,
      status: "В сборке" as const,
      weightG: 1500,
    },
    {
      name: "Кепка",
      customerId: self,
      track: "CN100008",
      price: 15,
      status: "В сборке" as const,
      weightG: 200,
    },
    {
      name: "Ремень",
      customerId: self,
      track: "CN100009",
      price: 10,
      status: "В сборке" as const,
      weightG: 150,
    },
    {
      name: "Носки",
      customerId: self,
      track: "CN100010",
      price: 5,
      status: "Ожидает взвешивания" as const,
      weightG: undefined,
    },
  ];

  for (const item of demoItems) {
    await db.items.add(
      Item.create({
        orderId: order,
        customerId: item.customerId,
        name: item.name,
        track: item.track,
        price: item.price,
        status: item.status,
        weightG: item.weightG,
      }).toPersistence(),
    );
  }

  console.log("Demo data seeded successfully");
}

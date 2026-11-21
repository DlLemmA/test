import { db } from "@/core/database";
import type { OrderRepository, ItemRepository } from "./domain";
import { Order, Item } from "./domain";

// ============================================
// Dexie Implementation
// ============================================

export class DexieOrderRepository implements OrderRepository {
  async findAll(): Promise<Order[]> {
    const rows = await db.orders.orderBy("createdAt").reverse().toArray();
    return rows.map(Order.fromPersistence);
  }

  async findById(id: number): Promise<Order | null> {
    const row = await db.orders.get(id);
    return row ? Order.fromPersistence(row) : null;
  }

  async save(order: Order): Promise<Order> {
    if (order.id === 0) {
      const id = await db.orders.add(order.toPersistence());
      return Order.fromPersistence({ ...order.toPersistence(), id });
    } else {
      await db.orders.update(order.id, order.toPersistence());
      return order;
    }
  }

  async delete(id: number): Promise<void> {
    await db.transaction("rw", db.orders, db.items, async () => {
      await db.items.where("orderId").equals(id).delete();
      await db.orders.delete(id);
    });
  }
}

export class DexieItemRepository implements ItemRepository {
  async findByOrderId(orderId: number): Promise<Item[]> {
    const rows = await db.items.where("orderId").equals(orderId).toArray();
    return rows.map(Item.fromPersistence);
  }

  async findById(id: number): Promise<Item | null> {
    const row = await db.items.get(id);
    return row ? Item.fromPersistence(row) : null;
  }

  async save(item: Item): Promise<Item> {
    if (item.id === 0) {
      const id = await db.items.add(item.toPersistence());
      return Item.fromPersistence({ ...item.toPersistence(), id });
    } else {
      await db.items.update(item.id, item.toPersistence());
      return item;
    }
  }

  async delete(id: number): Promise<void> {
    await db.items.delete(id);
  }

  async moveToOrder(itemId: number, newOrderId: number): Promise<void> {
    await db.items.update(itemId, { orderId: newOrderId });
  }
}

// ============================================
// Export singleton instances
// ============================================

export const orderRepository = new DexieOrderRepository();
export const itemRepository = new DexieItemRepository();

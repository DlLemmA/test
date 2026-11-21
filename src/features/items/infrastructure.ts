import { db } from "@/core/database";
import type { ItemRepository } from "./domain";
import { Item } from "./domain";

// ============================================
// Dexie Implementation
// ============================================

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
// Export singleton instance
// ============================================

export const itemRepository = new DexieItemRepository();

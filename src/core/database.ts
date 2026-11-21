import Dexie, { type Table } from "dexie";

// ============================================
// Domain Types (matching domain.ts in features)
// ============================================

export interface CustomerRow {
  id?: number;
  name: string;
  isSelf: boolean;
}

export interface OrderRow {
  id?: number;
  title: string;
  status: OrderStatus;
  createdAt: string;
  shippedAt?: string;
  receivedAt?: string;
  boxWeightG?: number;
  shippingCost?: number;
}

export type OrderStatus = "В сборке" | "Отправлен" | "Получен";

export interface ItemRow {
  id?: number;
  orderId: number;
  customerId: number;
  name: string;
  track?: string;
  price: number;
  weightG?: number;
  status: ItemStatus;
  notes?: string;
  createdAt: string;
}

export type ItemStatus = "В сборке" | "Взвешен" | "Ожидает взвешивания" | "Потерян" | "Пропущен";

// ============================================
// Dexie Database Class
// ============================================

export class AppDatabase extends Dexie {
  customers!: Table<CustomerRow, number>;
  orders!: Table<OrderRow, number>;
  items!: Table<ItemRow, number>;

  constructor() {
    super("pinduoduo-db");
    this.version(1).stores({
      customers: "++id, name, isSelf",
      orders: "++id, title, status, createdAt, shippedAt, receivedAt",
      items: "++id, orderId, customerId, name, track, status, createdAt",
    });

    // Hooks for derived status (optional - can also do in domain)
    this.items.hook("creating", (_primKey, obj, _trans) => {
      if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    });
  }
}

export const db = new AppDatabase();

// ============================================
// Migration Helpers
// ============================================

export async function migrateFromSqlJs(_sqlJsBytes: Uint8Array): Promise<void> {
  // This would be used for one-time migration from sql.js
  // Implementation depends on your sql.js schema
  console.log("Migration from sql.js not implemented yet");
}

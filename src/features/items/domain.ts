import { z } from "zod";
import type { ItemRow, ItemStatus } from "@/core/database";

// ============================================
// Zod Schemas (boundary validation)
// ============================================

export const ItemCreateSchema = z.object({
  orderId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  name: z.string().min(1, "Название обязательно").max(200),
  track: z.string().optional().nullable(),
  price: z.number().min(0, "Цена не может быть отрицательной"),
  status: z
    .enum(["В сборке", "Взвешен", "Ожидает взвешивания", "Потерян", "Пропущен"])
    .default("Ожидает взвешивания"),
  weightG: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const ItemUpdateSchema = ItemCreateSchema.partial().omit({
  orderId: true,
  customerId: true,
});

export type ItemCreateInput = z.infer<typeof ItemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof ItemUpdateSchema>;

// ============================================
// Item Domain Entity (also in orders/domain.ts - keeping here for feature isolation)
// ============================================

export class Item {
  readonly id: number;
  readonly orderId: number;
  readonly customerId: number;
  readonly name: string;
  readonly track?: string;
  readonly price: number;
  readonly weightG?: number;
  readonly status: ItemStatus;
  readonly notes?: string;
  readonly createdAt: string;

  private constructor(data: {
    id: number;
    orderId: number;
    customerId: number;
    name: string;
    track?: string;
    price: number;
    weightG?: number;
    status: ItemStatus;
    notes?: string;
    createdAt: string;
  }) {
    this.id = data.id;
    this.orderId = data.orderId;
    this.customerId = data.customerId;
    this.name = data.name;
    this.track = data.track;
    this.price = data.price;
    this.weightG = data.weightG;
    this.status = data.status;
    this.notes = data.notes;
    this.createdAt = data.createdAt;
  }

  static create(input: ItemCreateInput): Item {
    return new Item({
      id: 0,
      orderId: input.orderId,
      customerId: input.customerId,
      name: input.name,
      track: input.track ?? undefined,
      price: input.price,
      weightG: input.weightG ?? undefined,
      status: input.status,
      notes: input.notes ?? undefined,
      createdAt: new Date().toISOString(),
    });
  }

  static fromPersistence(row: ItemRow): Item {
    if (!row.id) throw new Error("Item must have ID from persistence");
    return new Item({
      id: row.id,
      orderId: row.orderId,
      customerId: row.customerId,
      name: row.name,
      track: row.track,
      price: row.price,
      weightG: row.weightG,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
    });
  }

  toPersistence(): Omit<ItemRow, "id"> {
    return {
      orderId: this.orderId,
      customerId: this.customerId,
      name: this.name,
      track: this.track,
      price: this.price,
      weightG: this.weightG,
      status: this.status,
      notes: this.notes,
      createdAt: this.createdAt,
    };
  }

  update(input: ItemUpdateInput): Item {
    return new Item({
      id: this.id,
      orderId: this.orderId,
      customerId: this.customerId,
      name: input.name ?? this.name,
      track: input.track ?? this.track,
      price: input.price ?? this.price,
      weightG: input.weightG ?? this.weightG,
      status: input.status ?? this.status,
      notes: input.notes ?? this.notes,
      createdAt: this.createdAt,
    });
  }

  // Domain behavior - derived status from data
  static deriveStatus(item: Pick<Item, "track" | "weightG" | "status">): ItemStatus {
    if (item.status === "Потерян") return "Потерян";
    if (item.weightG !== null && item.weightG !== undefined) return "Взвешен";
    // 'В заказе' is a derived status, not a stored status - treat as 'В сборке'
    return "Ожидает взвешивания";
  }

  get isTerminal(): boolean {
    return this.status === "Взвешен" || this.status === "Потерян";
  }

  get displayWeight(): string {
    return this.weightG ? `${(this.weightG / 1000).toFixed(3)} кг` : "—";
  }

  get statusClass(): string {
    switch (this.status) {
      case "Взвешен":
        return "pill-good";
      case "Потерян":
        return "pill-bad";
      case "Пропущен":
        return "pill-warn";
      default:
        return "pill-default";
    }
  }
}

// ============================================
// Repository Interface (Port)
// ============================================

export interface ItemRepository {
  findByOrderId(orderId: number): Promise<Item[]>;
  findById(id: number): Promise<Item | null>;
  save(item: Item): Promise<Item>;
  delete(id: number): Promise<void>;
  moveToOrder(itemId: number, newOrderId: number): Promise<void>;
}

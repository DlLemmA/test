import { z } from "zod";
import type { OrderRow, ItemRow, OrderStatus, ItemStatus } from "@/core/database";
import { Customer } from "@/features/customers/domain";

// ============================================
// Zod Schemas (boundary validation)
// ============================================

export const OrderCreateSchema = z.object({
  title: z.string().min(1, "Название заказа обязательно").max(200),
});

export const OrderUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  shippedAt: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  boxWeightG: z.number().int().min(0).optional().nullable(),
  shippingCost: z.number().min(0).optional().nullable(),
});

export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>;

// ============================================
// Domain Entity
// ============================================

export class Order {
  readonly id: number;
  readonly title: string;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly shippedAt?: string;
  readonly receivedAt?: string;
  readonly boxWeightG?: number;
  readonly shippingCost?: number;

  private constructor(data: {
    id: number;
    title: string;
    status: OrderStatus;
    createdAt: string;
    shippedAt?: string;
    receivedAt?: string;
    boxWeightG?: number;
    shippingCost?: number;
  }) {
    this.id = data.id;
    this.title = data.title;
    this.status = data.status;
    this.createdAt = data.createdAt;
    this.shippedAt = data.shippedAt;
    this.receivedAt = data.receivedAt;
    this.boxWeightG = data.boxWeightG;
    this.shippingCost = data.shippingCost;
  }

  static create(input: OrderCreateInput): Order {
    return new Order({
      id: 0,
      title: input.title,
      status: "В сборке",
      createdAt: new Date().toISOString(),
    });
  }

  static fromPersistence(row: OrderRow): Order {
    if (!row.id) throw new Error("Order must have ID from persistence");
    return new Order({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      shippedAt: row.shippedAt,
      receivedAt: row.receivedAt,
      boxWeightG: row.boxWeightG,
      shippingCost: row.shippingCost,
    });
  }

  toPersistence(): Omit<OrderRow, "id"> {
    return {
      title: this.title,
      status: this.status,
      createdAt: this.createdAt,
      shippedAt: this.shippedAt,
      receivedAt: this.receivedAt,
      boxWeightG: this.boxWeightG,
      shippingCost: this.shippingCost,
    };
  }

  update(input: OrderUpdateInput): Order {
    return new Order({
      id: this.id,
      title: input.title ?? this.title,
      status: this.status, // Status is derived, not set directly
      createdAt: this.createdAt,
      shippedAt: input.shippedAt ?? this.shippedAt,
      receivedAt: input.receivedAt ?? this.receivedAt,
      boxWeightG: input.boxWeightG ?? this.boxWeightG,
      shippingCost: input.shippingCost ?? this.shippingCost,
    });
  }

  // Domain behavior - status is derived from dates
  static deriveStatus(shippedAt?: string, receivedAt?: string): OrderStatus {
    if (receivedAt) return "Получен";
    if (shippedAt) return "Отправлен";
    return "В сборке";
  }

  get derivedStatus(): OrderStatus {
    return Order.deriveStatus(this.shippedAt, this.receivedAt);
  }

  canReceive(): boolean {
    // Checked via Item domain service
    return this.derivedStatus === "Отправлен";
  }

  get formattedTitle(): string {
    const parts = [];
    if (this.shippedAt) {
      const date = new Date(this.shippedAt).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      parts.push(`отправлен ${date}`);
    }
    if (this.receivedAt) {
      const date = new Date(this.receivedAt).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      parts.push(`получен ${date}`);
    }
    return parts.length ? `№${this.id} · ${parts.join(" · ")}` : `№${this.id}`;
  }
}

// ============================================
// Item Domain Entity (referenced by Order)
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

  static create(input: {
    orderId: number;
    customerId: number;
    name: string;
    track?: string;
    price: number;
    status: ItemStatus;
    weightG?: number;
    notes?: string;
  }): Item {
    return new Item({
      id: 0,
      ...input,
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

  update(
    input: Partial<{
      name: string;
      customerId: number;
      track?: string;
      price: number;
      weightG?: number;
      status: ItemStatus;
      notes?: string;
    }>,
  ): Item {
    return new Item({
      id: this.id,
      orderId: this.orderId,
      customerId: input.customerId ?? this.customerId,
      name: input.name ?? this.name,
      track: input.track ?? this.track,
      price: input.price ?? this.price,
      weightG: input.weightG ?? this.weightG,
      status: input.status ?? this.status,
      notes: input.notes ?? this.notes,
      createdAt: this.createdAt,
    });
  }

  // Domain behavior - derived status from data (like itemStatus.js)
  static deriveStatus(item: Pick<Item, "track" | "weightG" | "status" | "notes">): ItemStatus {
    if (item.status === "Потерян") return "Потерян";
    if (item.weightG !== null && item.weightG !== undefined) return "Взвешен";
    // 'В заказе' is a derived status, not a stored status
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
        return "good";
      case "Потерян":
        return "bad";
      case "Пропущен":
        return "warn";
      default:
        return "default";
    }
  }
}

// ============================================
// Repository Interfaces (Ports)
// ============================================

export interface OrderRepository {
  findAll(): Promise<Order[]>;
  findById(id: number): Promise<Order | null>;
  save(order: Order): Promise<Order>;
  delete(id: number): Promise<void>;
}

export interface ItemRepository {
  findByOrderId(orderId: number): Promise<Item[]>;
  findById(id: number): Promise<Item | null>;
  save(item: Item): Promise<Item>;
  delete(id: number): Promise<void>;
  moveToOrder(itemId: number, newOrderId: number): Promise<void>;
}

// ============================================
// Domain Services
// ============================================

export interface OrderWithItems {
  order: Order;
  items: Item[];
  customers: Map<number, Customer>;
}

export class OrderService {
  constructor(
    private orderRepo: OrderRepository,
    private itemRepo: ItemRepository,
  ) {}

  async getOrderWithItems(orderId: number): Promise<OrderWithItems | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return null;
    const items = await this.itemRepo.findByOrderId(orderId);
    return { order, items, customers: new Map() };
  }

  async getCurrentOrder(): Promise<OrderWithItems | null> {
    const orders = await this.orderRepo.findAll();
    const firstOrder = orders[0];
    if (!firstOrder) return null;
    return this.getOrderWithItems(firstOrder.id);
  }

  async createOrder(title: string): Promise<Order> {
    return this.orderRepo.save(Order.create({ title }));
  }

  async shipOrder(orderId: number): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");
    const now = new Date().toISOString().split("T")[0];
    return this.orderRepo.save(order.update({ shippedAt: now }));
  }

  async receiveOrder(orderId: number): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (!order.canReceive()) throw new Error("Order cannot be received");
    const now = new Date().toISOString().split("T")[0];
    return this.orderRepo.save(order.update({ receivedAt: now }));
  }

  async returnToAssembly(orderId: number): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");
    return this.orderRepo.save(order.update({ shippedAt: null, receivedAt: null }));
  }
}

export class ItemService {
  constructor(
    private itemRepo: ItemRepository,
    private orderRepo: OrderRepository,
  ) {}

  async weighItem(itemId: number, weightG: number): Promise<Item> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    // Status derives from weight being set
    const updated = item.update({ weightG, status: "Взвешен" as ItemStatus });
    return this.itemRepo.save(updated);
  }

  async moveItem(itemId: number): Promise<void> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");

    // Find next unshipped order
    const orders = await this.orderRepo.findAll();
    const nextOrder = orders
      .filter((o) => o.id !== item.orderId && !o.shippedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (nextOrder) {
      await this.itemRepo.moveToOrder(itemId, nextOrder.id);
    } else {
      // Create new order
      const dateStr = new Date().toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const newOrder = await this.orderRepo.save(Order.create({ title: `Заказ от ${dateStr}` }));
      await this.itemRepo.moveToOrder(itemId, newOrder.id);
    }
  }
}

// ============================================
// Calculation Domain (pure functions)
// ============================================

export interface OrderCalculation {
  items: Item[];
  totalWeight: number;
  freeWeight: number;
  tariff: number;
  deliveryTotal: number;
  perCustomer: Map<number, CustomerSummary>;
}

export interface CustomerSummary {
  customer: Customer;
  items: Item[];
  weight: number;
  value: number;
  delivery: number;
  total: number;
  deliveredCount: number;
}

export function calculateOrder(
  order: Order,
  items: Item[],
  customers: Customer[],
): OrderCalculation {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const perCustomer = new Map<number, CustomerSummary>();

  items.forEach((item) => {
    const customer = customerMap.get(item.customerId);
    if (!customer) return;

    if (!perCustomer.has(customer.id)) {
      perCustomer.set(customer.id, {
        customer,
        items: [],
        weight: 0,
        value: 0,
        delivery: 0,
        total: 0,
        deliveredCount: 0,
      });
    }

    const summary = perCustomer.get(customer.id)!;
    summary.items.push(item);
    summary.value += item.price;

    if (item.weightG && item.status === "Взвешен") {
      summary.weight += item.weightG;
      summary.deliveredCount++;
    }
  });

  const weighedItems = items.filter(
    (i) => i.weightG !== null && i.weightG !== undefined && i.status === "Взвешен",
  );
  const totalWeight = weighedItems.reduce((sum, i) => sum + (i.weightG || 0), 0);
  const boxWeight = order.boxWeightG || 0;
  const freeWeight = Math.max(0, boxWeight - totalWeight);
  const tariff =
    boxWeight > 0 && order.shippingCost
      ? Math.round((order.shippingCost / (boxWeight / 1000)) * 100) / 100
      : 0;
  const deliveryTotal = items.reduce(
    (sum, i) => sum + (i.weightG ? (i.weightG / 1000) * tariff : 0),
    0,
  );

  perCustomer.forEach((summary) => {
    if (tariff > 0) {
      summary.delivery = summary.items
        .filter((i) => i.weightG && i.status === "Взвешен")
        .reduce((sum, i) => sum + (i.weightG! / 1000) * tariff, 0);
    }
    summary.total = summary.value + summary.delivery;
  });

  return {
    items,
    totalWeight,
    freeWeight,
    tariff,
    deliveryTotal,
    perCustomer,
  };
}

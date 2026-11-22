import { z } from "zod";
import type { Customer } from "@/features/customers/domain";
import type {
  ParcelRow,
  ParcelItemRow,
  ParcelStatus,
  ParcelItemStatus,
  PaymentRow,
} from "@/core/database";

// ============================================
// Zod Schemas (boundary validation)
// ============================================

export const ParcelCreateSchema = z.object({});

export const ParcelUpdateSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  boxWeightG: z.number().int().min(0).optional().nullable(),
  shippingCostBYN: z.number().min(0).optional().nullable(),
});

export type ParcelCreateInput = z.infer<typeof ParcelCreateSchema>;
export type ParcelUpdateInput = z.infer<typeof ParcelUpdateSchema>;

export const ParcelItemCreateSchema = z.object({
  parcelId: z.number().int().positive(),
  name: z.string().min(1, "Название обязательно").max(200),
  priceCNY: z.number().min(0, "Цена в юанях должна быть >= 0"),
  priceBYN: z.number().min(0, "Цена в рублях должна быть >= 0"),
  quantity: z.number().int().min(1, "Количество >= 1"),
  unit: z.enum(["pcs", "packs"]),
  customerId: z.number().int().positive(),
});

export const ParcelItemUpdateSchema = z.object({
  parcelId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200).optional(),
  priceCNY: z.number().min(0).optional(),
  priceBYN: z.number().min(0).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.enum(["pcs", "packs"]).optional(),
  customerId: z.number().int().positive().optional(),
  trackNumbers: z.array(z.string()).optional(),
  weightsG: z.array(z.number()).optional(),
  status: z.enum(["ordered", "shipped", "received", "lost"]).optional(),
  tracksCompletedAt: z.string().optional(),
});

export type ParcelItemCreateInput = z.infer<typeof ParcelItemCreateSchema>;
export type ParcelItemUpdateInput = z.infer<typeof ParcelItemUpdateSchema>;

// ============================================
// Domain Entities
// ============================================

export class Parcel {
  readonly id: number;
  readonly name?: string;
  readonly status: ParcelStatus;
  readonly boxWeightG?: number;
  readonly shippingCostBYN?: number;
  readonly shippedAt?: string;
  readonly receivedAt?: string;
  readonly completedAt?: string; // when all tracks filled
  readonly createdAt: string;

  private constructor(data: {
    id: number;
    name?: string;
    status: ParcelStatus;
    boxWeightG?: number;
    shippingCostBYN?: number;
    shippedAt?: string;
    receivedAt?: string;
    completedAt?: string;
    createdAt: string;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.status = data.status;
    this.boxWeightG = data.boxWeightG;
    this.shippingCostBYN = data.shippingCostBYN;
    this.shippedAt = data.shippedAt;
    this.receivedAt = data.receivedAt;
    this.completedAt = data.completedAt;
    this.createdAt = data.createdAt;
  }

  static create(): Parcel {
    return new Parcel({
      id: 0,
      status: "draft",
      createdAt: new Date().toISOString(),
    });
  }

  static fromPersistence(row: ParcelRow): Parcel {
    if (!row.id) throw new Error("Parcel must have ID from persistence");
    return new Parcel({
      id: row.id,
      name: row.name,
      status: row.status,
      boxWeightG: row.boxWeightG,
      shippingCostBYN: row.shippingCostBYN,
      shippedAt: row.shippedAt,
      receivedAt: row.receivedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
    });
  }

  toPersistence(): Omit<ParcelRow, "id"> {
    return {
      name: this.name,
      status: this.status,
      boxWeightG: this.boxWeightG,
      shippingCostBYN: this.shippingCostBYN,
      shippedAt: this.shippedAt,
      receivedAt: this.receivedAt,
      completedAt: this.completedAt,
      createdAt: this.createdAt,
    };
  }

  update(input: ParcelUpdateInput): Parcel {
    return new Parcel({
      id: this.id,
      name: input.name ?? this.name,
      status: this.status,
      boxWeightG: input.boxWeightG ?? this.boxWeightG,
      shippingCostBYN: input.shippingCostBYN ?? this.shippingCostBYN,
      shippedAt: this.shippedAt,
      receivedAt: this.receivedAt,
      completedAt: this.completedAt,
      createdAt: this.createdAt,
    });
  }

  setCompleted(): Parcel {
    if (this.status !== "draft" && this.status !== "shipped")
      throw new Error("Can only complete draft/shipped parcel");
    if (this.completedAt) return this; // already completed
    return new Parcel({
      ...this,
      completedAt: new Date().toISOString().split("T")[0],
    });
  }

  // Status transitions
  ship(): Parcel {
    if (this.status !== "draft") throw new Error("Can only ship draft parcel");
    return new Parcel({
      ...this,
      status: "shipped",
      shippedAt: new Date().toISOString().split("T")[0],
    });
  }

  receive(boxWeightG: number, shippingCostBYN: number): Parcel {
    if (this.status !== "shipped") throw new Error("Can only receive shipped parcel");
    return new Parcel({
      ...this,
      status: "received",
      boxWeightG,
      shippingCostBYN,
      receivedAt: new Date().toISOString().split("T")[0],
    });
  }

  markAsDone(): Parcel {
    if (this.status !== "received") throw new Error("Can only mark received parcel as done");
    return new Parcel({
      ...this,
      status: "done",
    });
  }

  get statusLabel(): string {
    switch (this.status) {
      case "draft":
        return "Черновик";
      case "shipped":
        return "Отправлена";
      case "received":
        return "Получена";
      case "done":
        return "Готово";
    }
  }

  get statusClass(): string {
    switch (this.status) {
      case "draft":
        return "warn";
      case "shipped":
        return "info";
      case "received":
        return "good";
      case "done":
        return "good";
    }
  }

  get formattedDate(): string {
    const date = new Date(this.createdAt);
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  get totalItems(): number {
    // Will be computed from items
    return 0;
  }
}

export class ParcelItem {
  readonly id: number;
  readonly parcelId: number;
  readonly name: string;
  readonly priceCNY: number;
  readonly priceBYN: number;
  readonly quantity: number;
  readonly unit: "pcs" | "packs";
  readonly customerId: number;
  readonly trackNumbers: string[];
  readonly weightsG: number[];
  readonly status: ParcelItemStatus;
  readonly tracksCompletedAt?: string; // when all tracks filled (timestamp)
  readonly createdAt: string;

  private constructor(data: {
    id: number;
    parcelId: number;
    name: string;
    priceCNY: number;
    priceBYN: number;
    quantity: number;
    unit: "pcs" | "packs";
    customerId: number;
    trackNumbers: string[];
    weightsG: number[];
    status: ParcelItemStatus;
    tracksCompletedAt?: string;
    createdAt: string;
  }) {
    this.id = data.id;
    this.parcelId = data.parcelId;
    this.name = data.name;
    this.priceCNY = data.priceCNY;
    this.priceBYN = data.priceBYN;
    this.quantity = data.quantity;
    this.unit = data.unit;
    this.customerId = data.customerId;
    this.trackNumbers = data.trackNumbers;
    this.weightsG = data.weightsG;
    this.status = data.status;
    this.tracksCompletedAt = data.tracksCompletedAt;
    this.createdAt = data.createdAt;
  }

  static create(input: ParcelItemCreateInput): ParcelItem {
    return new ParcelItem({
      id: 0,
      trackNumbers: [],
      weightsG: [],
      status: "ordered",
      ...input,
      createdAt: new Date().toISOString(),
    });
  }

  static fromPersistence(row: ParcelItemRow): ParcelItem {
    if (!row.id) throw new Error("ParcelItem must have ID from persistence");
    return new ParcelItem({
      id: row.id,
      parcelId: row.parcelId,
      name: row.name,
      priceCNY: row.priceCNY,
      priceBYN: row.priceBYN,
      quantity: row.quantity,
      unit: row.unit,
      customerId: row.customerId,
      trackNumbers: JSON.parse(row.trackNumbers || "[]"),
      weightsG: JSON.parse(row.weightsG || "[]"),
      status: row.status,
      tracksCompletedAt: row.tracksCompletedAt,
      createdAt: row.createdAt,
    });
  }

  toPersistence(): Omit<ParcelItemRow, "id"> {
    return {
      parcelId: this.parcelId,
      name: this.name,
      priceCNY: this.priceCNY,
      priceBYN: this.priceBYN,
      quantity: this.quantity,
      unit: this.unit,
      customerId: this.customerId,
      trackNumbers: JSON.stringify(this.trackNumbers),
      weightsG: JSON.stringify(this.weightsG),
      status: this.status,
      tracksCompletedAt: this.tracksCompletedAt,
      createdAt: this.createdAt,
    };
  }

  update(input: ParcelItemUpdateInput): ParcelItem {
    return new ParcelItem({
      id: this.id,
      parcelId: input.parcelId ?? this.parcelId,
      name: input.name ?? this.name,
      priceCNY: input.priceCNY ?? this.priceCNY,
      priceBYN: input.priceBYN ?? this.priceBYN,
      quantity: input.quantity ?? this.quantity,
      unit: input.unit ?? this.unit,
      customerId: input.customerId ?? this.customerId,
      trackNumbers: input.trackNumbers ?? this.trackNumbers,
      weightsG: input.weightsG ?? this.weightsG,
      tracksCompletedAt: input.trackNumbers
        ? undefined
        : (input.tracksCompletedAt ?? this.tracksCompletedAt),
      status: input.status ?? this.status,
      createdAt: this.createdAt,
    });
  }

  // Domain behavior
  get tracksCompleted(): boolean {
    return this.tracksCompletedAt !== undefined;
  }

  get filledTracksCount(): number {
    return this.trackNumbers.filter((t) => t.trim() !== "").length;
  }

  get hasAllWeights(): boolean {
    return this.weightsG.length >= this.trackNumbers.length && this.weightsG.every((w) => w > 0);
  }

  get filledWeightsCount(): number {
    return this.weightsG.filter((w) => w > 0).length;
  }

  get totalPriceBYN(): number {
    return this.priceBYN * this.quantity;
  }

  get totalPriceCNY(): number {
    return this.priceCNY * this.quantity;
  }

  get unitLabel(): string {
    return this.unit === "pcs" ? "шт" : "упак";
  }

  get statusLabel(): string {
    switch (this.status) {
      case "ordered":
        return "Заказан";
      case "shipped":
        return "В пути";
      case "received":
        return "Получен";
      case "lost":
        return "Потерян";
    }
  }

  get statusClass(): string {
    switch (this.status) {
      case "received":
        return "good";
      case "lost":
        return "bad";
      case "shipped":
        return "info";
      default:
        return "default";
    }
  }

  // Derived status based on parcel status and own data
  static deriveStatus(
    parcelStatus: ParcelStatus,
    item: Pick<ParcelItem, "trackNumbers" | "weightsG" | "status">,
  ): ParcelItemStatus {
    if (item.status === "lost") return "lost";
    if (parcelStatus === "received") return "received";
    if (parcelStatus === "shipped" || item.trackNumbers.length > 0) return "shipped";
    return "ordered";
  }
}

// ============================================
// Payment Entity (Persisted)
// ============================================

export class Payment {
  readonly id: number;
  readonly parcelId: number;
  readonly customerId: number;
  readonly itemId?: number; // undefined = shipping payment
  readonly type: "item" | "shipping";
  readonly paid: boolean;
  readonly paidAt?: string;
  readonly createdAt: string;

  private constructor(data: {
    id: number;
    parcelId: number;
    customerId: number;
    itemId?: number;
    type: "item" | "shipping";
    paid: boolean;
    paidAt?: string;
    createdAt: string;
  }) {
    this.id = data.id;
    this.parcelId = data.parcelId;
    this.customerId = data.customerId;
    this.itemId = data.itemId;
    this.type = data.type;
    this.paid = data.paid;
    this.paidAt = data.paidAt;
    this.createdAt = data.createdAt;
  }

  static create(input: {
    parcelId: number;
    customerId: number;
    itemId?: number;
    type: "item" | "shipping";
    paid: boolean;
  }): Payment {
    return new Payment({
      id: 0,
      ...input,
      paidAt: input.paid ? new Date().toISOString().split("T")[0] : undefined,
      createdAt: new Date().toISOString(),
    });
  }

  static fromPersistence(row: PaymentRow): Payment {
    if (!row.id) throw new Error("Payment must have ID from persistence");
    return new Payment({
      id: row.id,
      parcelId: row.parcelId,
      customerId: row.customerId,
      itemId: row.itemId,
      type: row.type,
      paid: row.paid,
      paidAt: row.paidAt,
      createdAt: row.createdAt,
    });
  }

  toPersistence(): Omit<PaymentRow, "id"> {
    return {
      parcelId: this.parcelId,
      customerId: this.customerId,
      itemId: this.itemId,
      type: this.type,
      paid: this.paid,
      paidAt: this.paidAt,
      createdAt: this.createdAt,
    };
  }

  update(input: { paid?: boolean }): Payment {
    return new Payment({
      id: this.id,
      parcelId: this.parcelId,
      customerId: this.customerId,
      itemId: this.itemId,
      type: this.type,
      paid: input.paid ?? this.paid,
      paidAt:
        input.paid !== undefined && input.paid !== this.paid
          ? input.paid
            ? new Date().toISOString().split("T")[0]
            : undefined
          : this.paidAt,
      createdAt: this.createdAt,
    });
  }
}

// ============================================
// Payment Tracking (Value Object - for backward compat)
// ============================================

export interface PaymentState {
  // itemId -> paid
  itemPaid: Map<number, boolean>;
  // customerId -> shippingPaid
  shippingPaid: Map<number, boolean>;
}

export function createEmptyPaymentState(): PaymentState {
  return {
    itemPaid: new Map(),
    shippingPaid: new Map(),
  };
}

export function paymentStateFromPayments(payments: Payment[]): PaymentState {
  const itemPaid = new Map<number, boolean>();
  const shippingPaid = new Map<number, boolean>();

  for (const p of payments) {
    if (p.type === "item" && p.itemId) {
      itemPaid.set(p.itemId, p.paid);
    } else if (p.type === "shipping") {
      shippingPaid.set(p.customerId, p.paid);
    }
  }

  return { itemPaid, shippingPaid };
}

export function calculateCustomerBalance(
  items: ParcelItem[],
  customers: Customer[],
  parcel: Parcel,
  paymentState: PaymentState,
  selfCustomerId?: number, // if provided, this customer's items are auto-paid
): Map<number, { owed: number; paid: number; remaining: number }> {
  const result = new Map<number, { owed: number; paid: number; remaining: number }>();

  // Group items by customer
  const itemsByCustomer = new Map<number, ParcelItem[]>();
  for (const item of items) {
    if (!itemsByCustomer.has(item.customerId)) {
      itemsByCustomer.set(item.customerId, []);
    }
    itemsByCustomer.get(item.customerId)!.push(item);
  }

  // Calculate shipping share per customer (proportional to weight)
  let totalWeight = 0;
  const weightByCustomer = new Map<number, number>();

  if (parcel.status === "received" && parcel.boxWeightG && parcel.shippingCostBYN) {
    for (const item of items) {
      if (item.weightsG.length > 0) {
        const itemWeight = item.weightsG.reduce((a, b) => a + b, 0);
        weightByCustomer.set(
          item.customerId,
          (weightByCustomer.get(item.customerId) || 0) + itemWeight,
        );
        totalWeight += itemWeight;
      }
    }
  }

  const shippingShareByCustomer = new Map<number, number>();
  if (totalWeight > 0 && parcel.shippingCostBYN) {
    for (const [customerId, weight] of weightByCustomer) {
      shippingShareByCustomer.set(customerId, (weight / totalWeight) * parcel.shippingCostBYN);
    }
  }

  for (const [customerId, customerItems] of itemsByCustomer) {
    let owed = 0;
    let paid = 0;

    const isSelf = customerId === selfCustomerId;

    for (const item of customerItems) {
      owed += item.totalPriceBYN;
      // Auto-paid for self customer, otherwise check payment state
      if (isSelf || paymentState.itemPaid.get(item.id)) {
        paid += item.totalPriceBYN;
      }
    }

    const shippingShare = shippingShareByCustomer.get(customerId) || 0;
    owed += shippingShare;
    // Auto-paid shipping for self customer
    if (isSelf || paymentState.shippingPaid.get(customerId)) {
      paid += shippingShare;
    }

    result.set(customerId, {
      owed,
      paid,
      remaining: owed - paid,
    });
  }

  return result;
}

// ============================================
// Repository Interfaces (Ports)
// ============================================

export interface ParcelRepository {
  findAll(): Promise<Parcel[]>;
  findById(id: number): Promise<Parcel | null>;
  findByIdWithItems(id: number): Promise<ParcelWithItems | null>;
  save(parcel: Parcel): Promise<Parcel>;
  delete(id: number): Promise<void>;
}

export interface ParcelItemRepository {
  findByParcelId(parcelId: number): Promise<ParcelItem[]>;
  findAll(): Promise<ParcelItem[]>;
  findById(id: number): Promise<ParcelItem | null>;
  save(item: ParcelItem): Promise<ParcelItem>;
  delete(id: number): Promise<void>;
  deleteByParcelId(parcelId: number): Promise<void>;
}

export interface PaymentRepository {
  findAll(): Promise<Payment[]>;
  findByParcelId(parcelId: number): Promise<Payment[]>;
  findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]>;
  findByCustomer(customerId: number): Promise<Payment[]>;
  save(payment: Payment): Promise<Payment>;
  delete(id: number): Promise<void>;
}

export interface ParcelWithItems {
  parcel: Parcel;
  items: ParcelItem[];
}

// ============================================
// Domain Services
// ============================================

export class ParcelService {
  constructor(
    private parcelRepo: ParcelRepository,
    private itemRepo: ParcelItemRepository,
  ) {}

  async getParcelWithItems(parcelId: number): Promise<ParcelWithItems | null> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) return null;
    const items = await this.itemRepo.findByParcelId(parcelId);
    return { parcel, items };
  }

  async createParcel(): Promise<Parcel> {
    return this.parcelRepo.save(Parcel.create());
  }

  async shipParcel(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const canShip = await this.canShip(parcelId);
    if (!canShip) throw new Error("Cannot ship parcel: not all items have track numbers");
    const shipped = parcel.ship();
    return this.parcelRepo.save(shipped);
  }

  async receiveParcel(
    parcelId: number,
    boxWeightG: number,
    shippingCostBYN: number,
  ): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const received = parcel.receive(boxWeightG, shippingCostBYN);
    return this.parcelRepo.save(received);
  }

  async markAsDoneParcel(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const done = parcel.markAsDone();
    return this.parcelRepo.save(done);
  }

  async canShip(parcelId: number): Promise<boolean> {
    const items = await this.itemRepo.findByParcelId(parcelId);
    return items.length > 0 && items.every((item) => item.tracksCompleted);
  }

  // Mark parcel as having all tracks filled (sets completedAt)
  async completeTracks(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const items = await this.itemRepo.findByParcelId(parcelId);
    if (!items.every((item) => item.tracksCompleted)) {
      throw new Error("Not all items have all track numbers filled");
    }
    const completed = parcel.setCompleted();
    return this.parcelRepo.save(completed);
  }
}

export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository,
    private parcelRepo: ParcelRepository,
    private itemRepo: ParcelItemRepository,
  ) {}

  async getPaymentsForParcel(parcelId: number): Promise<Payment[]> {
    return this.paymentRepo.findByParcelId(parcelId);
  }

  async toggleItemPayment(paymentId: number): Promise<Payment> {
    const payments = await this.paymentRepo.findByParcelId(0); // will need to fetch specific
    // Actually let's just save directly
    throw new Error("Not implemented - use repository directly");
  }

  async setItemPaid(
    parcelId: number,
    itemId: number,
    customerId: number,
    paid: boolean,
  ): Promise<Payment> {
    const existing = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const itemPayment = existing.find((p) => p.type === "item" && p.itemId === itemId);

    if (itemPayment) {
      const updated = itemPayment.update({ paid });
      return this.paymentRepo.save(updated);
    } else {
      const payment = Payment.create({ parcelId, customerId, itemId, type: "item", paid });
      return this.paymentRepo.save(payment);
    }
  }

  async setShippingPaid(parcelId: number, customerId: number, paid: boolean): Promise<Payment> {
    const existing = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const shippingPayment = existing.find((p) => p.type === "shipping");

    if (shippingPayment) {
      const updated = shippingPayment.update({ paid });
      return this.paymentRepo.save(updated);
    } else {
      const payment = Payment.create({ parcelId, customerId, type: "shipping", paid });
      return this.paymentRepo.save(payment);
    }
  }
}

export class ParcelItemService {
  constructor(
    private itemRepo: ParcelItemRepository,
    private parcelRepo: ParcelRepository,
  ) {}

  async addBatch(parcelId: number, items: ParcelItemCreateInput[]): Promise<ParcelItem[]> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    if (parcel.status !== "draft") throw new Error("Can only add items to draft parcel");

    const created: ParcelItem[] = [];
    for (const input of items) {
      const item = ParcelItem.create({ ...input, parcelId });
      const saved = await this.itemRepo.save(item);
      created.push(saved);
    }
    return created;
  }

  async updateItem(itemId: number, input: ParcelItemUpdateInput): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const parcel = await this.parcelRepo.findById(item.parcelId);
    if (!parcel) throw new Error("Parcel not found");

    // If parcel is shipped/received, only allow track/weight/tracks-completed updates
    if (parcel.status !== "draft") {
      const allowedKeys: (keyof ParcelItemUpdateInput)[] = [
        "trackNumbers",
        "weightsG",
        "status",
        "tracksCompletedAt",
      ];
      const filteredInput: ParcelItemUpdateInput = {};
      for (const key of allowedKeys) {
        if (key in input) (filteredInput as any)[key] = (input as any)[key];
      }
      const updated = item.update(filteredInput);
      return this.itemRepo.save(updated);
    }

    const updated = item.update(input);
    return this.itemRepo.save(updated);
  }

  async deleteItem(itemId: number): Promise<void> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const parcel = await this.parcelRepo.findById(item.parcelId);
    if (!parcel) throw new Error("Parcel not found");
    if (parcel.status !== "draft") throw new Error("Can only delete items from draft parcel");
    await this.itemRepo.delete(itemId);
  }

  async setTracks(itemId: number, tracks: string[]): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const updated = item.update({ trackNumbers: tracks });
    return this.itemRepo.save(updated);
  }

  async setWeights(itemId: number, weights: number[]): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const updated = item.update({ weightsG: weights });
    return this.itemRepo.save(updated);
  }
}

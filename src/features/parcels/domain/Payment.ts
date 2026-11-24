import type { PaymentRow } from "@/core/dbSchema";

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

import { z } from "zod";
import type { ParcelRow, ParcelStatus } from "@/core/dbSchema";

// ============================================
// Zod Schemas (boundary validation)
// ============================================

export const ParcelCreateSchema = z.object({});

export const ParcelUpdateSchema = z.object({
  name: z.string().max(200, "Название слишком длинное").optional().nullable(),
  comment: z.string().max(20000, "Комментарий слишком длинный").optional().nullable(),
  boxWeightG: z.number().int().min(0, "Вес должен быть >= 0").optional().nullable(),
  shippingCostBYN: z.number().min(0, "Стоимость доставки должна быть >= 0").optional().nullable(),
});

export type ParcelCreateInput = z.infer<typeof ParcelCreateSchema>;
export type ParcelUpdateInput = z.infer<typeof ParcelUpdateSchema>;

// ============================================
// Domain Entities
// ============================================

export class Parcel {
  readonly id: number;
  readonly name?: string;
  readonly status: ParcelStatus;
  readonly comment?: string;
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
    comment?: string;
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
    this.comment = data.comment;
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
      comment: row.comment,
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
      comment: this.comment,
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
      name: input.name === null ? undefined : (input.name ?? this.name),
      status: this.status,
      comment: input.comment === null ? undefined : (input.comment ?? this.comment),
      boxWeightG: input.boxWeightG === null ? undefined : (input.boxWeightG ?? this.boxWeightG),
      shippingCostBYN:
        input.shippingCostBYN === null
          ? undefined
          : (input.shippingCostBYN ?? this.shippingCostBYN),
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

  get totalItems(): number {
    // Will be computed from items
    return 0;
  }
}

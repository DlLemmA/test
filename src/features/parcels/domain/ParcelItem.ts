import { z } from "zod";
import type { ParcelItemRow, ParcelStatus, ParcelItemStatus } from "@/core/database";

export const ParcelItemCreateSchema = z.object({
  parcelId: z.number().int().positive(),
  name: z.string().min(1, "Название обязательно").max(200),
  priceCNY: z.number().min(0, "Сумма в юанях должна быть >= 0"),
  priceBYN: z.number().min(0, "Сумма в рублях должна быть >= 0"),
  quantity: z.number().int().min(1, "Количество >= 1"),
  unit: z.enum(["pcs", "packs", "pairs"]),
  customerId: z.number().int().positive(),
});

export const ParcelItemUpdateSchema = z.object({
  parcelId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200).optional(),
  priceCNY: z.number().min(0).optional(),
  priceBYN: z.number().min(0).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.enum(["pcs", "packs", "pairs"]).optional(),
  customerId: z.number().int().positive().optional(),
  trackNumbers: z.array(z.string()).optional(),
  weightsG: z.array(z.number()).optional(),
  status: z.enum(["ordered", "shipped", "received", "lost"]).optional(),
  tracksCompletedAt: z.string().optional(),
});

export type ParcelItemCreateInput = z.infer<typeof ParcelItemCreateSchema>;
export type ParcelItemUpdateInput = z.infer<typeof ParcelItemUpdateSchema>;

export class ParcelItem {
  readonly id: number;
  readonly parcelId: number;
  readonly name: string;
  // priceCNY/priceBYN are the total for the whole line (quantity included),
  // not the price of a single unit.
  readonly priceCNY: number;
  readonly priceBYN: number;
  readonly quantity: number;
  readonly unit: "pcs" | "packs" | "pairs";
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
    unit: "pcs" | "packs" | "pairs";
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

  get totalPriceBYN(): number {
    return this.priceBYN;
  }

  get totalPriceCNY(): number {
    return this.priceCNY;
  }

  get unitLabel(): string {
    switch (this.unit) {
      case "pcs":
        return "шт";
      case "packs":
        return "упак";
      case "pairs":
        return "пар";
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

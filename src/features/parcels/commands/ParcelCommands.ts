// ============================================
// The one write module for the parcel aggregate. Every mutation is a named
// command that validates its input and checks the domain status before it
// reaches the transactional write store. Views never touch a repository.
// ============================================

import { z } from "zod";
import { Parcel, ParcelUpdateSchema, type ParcelUpdateInput } from "../domain/Parcel";
import {
  ParcelItem,
  ParcelItemBatchCreateSchema,
  ParcelItemCreateSchema,
  ParcelItemUpdateSchema,
  type ParcelItemBatchCreateInput,
  type ParcelItemCreateInput,
  type ParcelItemUpdateInput,
} from "../domain/ParcelItem";
import { parcelReadiness } from "../domain/ParcelReadiness";
import type {
  CreatedParcelBatch,
  ParcelItemRepository,
  ParcelRepository,
  ParcelWriteStore,
  PlannedPayment,
} from "../domain/ports";

function validated<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Некорректные данные");
  }
  return result.data;
}

function reasons(codes: { reason: string }[]): string {
  return codes.map((issue) => issue.reason).join(", ");
}

const LATE_UPDATE_KEYS = [
  "trackNumbers",
  "weightsG",
  "status",
  "tracksCompletedAt",
] as const satisfies ReadonlyArray<keyof ParcelItemUpdateInput>;

export class ParcelCommands {
  constructor(
    private readonly parcels: ParcelRepository,
    private readonly items: ParcelItemRepository,
    private readonly writes: ParcelWriteStore,
  ) {}

  async createParcel(): Promise<Parcel> {
    return this.writes.saveParcel(Parcel.create());
  }

  /** Validate a whole batch, then persist parcel, items and payments atomically. */
  async createParcelWithItems(
    inputs: ParcelItemBatchCreateInput[],
    payments: PlannedPayment[],
  ): Promise<CreatedParcelBatch> {
    const items = inputs.map((input) =>
      ParcelItem.create({ ...validated(ParcelItemBatchCreateSchema, input), parcelId: 0 }),
    );
    return this.writes.createParcelWithItems(Parcel.create(), items, payments);
  }

  async updateParcel(parcelId: number, input: ParcelUpdateInput): Promise<Parcel> {
    const data = validated(ParcelUpdateSchema, input);
    const parcel = await this.requireParcel(parcelId);
    return this.writes.saveParcel(parcel.update(data));
  }

  async shipParcel(
    parcelId: number,
    boxWeightG?: number,
    shippingCostBYN?: number,
  ): Promise<Parcel> {
    const parcel = await this.requireParcel(parcelId);
    const { ship } = parcelReadiness(parcel, await this.items.findByParcelId(parcelId));
    if (!ship.ok) throw new Error(`Нельзя отправить посылку: ${reasons(ship.issues)}`);
    const update: ParcelUpdateInput = {};
    if (boxWeightG !== undefined) update.boxWeightG = boxWeightG;
    if (shippingCostBYN !== undefined) update.shippingCostBYN = shippingCostBYN;
    const ready = Object.keys(update).length > 0 ? parcel.update(update) : parcel;
    return this.writes.saveParcel(ready.ship());
  }

  async receiveParcel(
    parcelId: number,
    boxWeightG: number,
    shippingCostBYN: number,
  ): Promise<Parcel> {
    const parcel = await this.requireParcel(parcelId);
    return this.writes.saveParcel(parcel.receive(boxWeightG, shippingCostBYN));
  }

  async markAsDoneParcel(parcelId: number): Promise<Parcel> {
    const parcel = await this.requireParcel(parcelId);
    const { finish } = parcelReadiness(parcel, await this.items.findByParcelId(parcelId));
    if (!finish.ok) throw new Error(`Нельзя завершить посылку: ${reasons(finish.issues)}`);
    return this.writes.saveParcel(parcel.markAsDone());
  }

  async completeTracks(parcelId: number): Promise<Parcel> {
    const parcel = await this.requireParcel(parcelId);
    const { completeTracks } = parcelReadiness(parcel, await this.items.findByParcelId(parcelId));
    if (!completeTracks.ok) {
      throw new Error(`Нельзя отметить треки готовыми: ${reasons(completeTracks.issues)}`);
    }
    return this.writes.saveParcel(parcel.setCompleted());
  }

  /** Validate and insert a whole batch in one adapter transaction. */
  async commitBatch(
    parcelId: number,
    inputs: Omit<ParcelItemCreateInput, "parcelId">[],
  ): Promise<ParcelItem[]> {
    const parcel = await this.requireParcel(parcelId);
    if (parcel.status !== "draft") {
      throw new Error("Товары можно добавлять только в черновик");
    }
    const items = inputs.map((input) =>
      ParcelItem.create(validated(ParcelItemCreateSchema, { ...input, parcelId })),
    );
    return this.writes.addItems(items);
  }

  async updateItem(itemId: number, input: ParcelItemUpdateInput): Promise<ParcelItem> {
    const data = validated(ParcelItemUpdateSchema, input);
    const item = await this.requireItem(itemId);
    const parcel = await this.requireParcel(item.parcelId);
    const allowed: readonly string[] =
      parcel.status === "draft" ? Object.keys(data) : LATE_UPDATE_KEYS;
    const update = Object.fromEntries(
      Object.entries(data).filter(([key]) => allowed.includes(key)),
    ) as ParcelItemUpdateInput;
    return this.writes.saveItem(item.update(update));
  }

  async moveItem(itemId: number, targetParcelId: number): Promise<ParcelItem> {
    const item = await this.requireItem(itemId);
    const source = await this.requireParcel(item.parcelId);
    const target = await this.requireParcel(targetParcelId);
    if (source.status !== "draft" || target.status !== "draft") {
      throw new Error("Перемещать товары можно только между черновиками");
    }
    return this.writes.saveItem(item.update({ parcelId: targetParcelId }));
  }

  async deleteItem(itemId: number): Promise<void> {
    const item = await this.requireItem(itemId);
    const parcel = await this.requireParcel(item.parcelId);
    if (parcel.status !== "draft") {
      throw new Error("Товары можно удалять только из черновика");
    }
    await this.writes.deleteItem(itemId);
  }

  async deleteParcel(parcelId: number): Promise<void> {
    await this.requireParcel(parcelId);
    await this.writes.deleteParcel(parcelId);
  }

  private async requireParcel(id: number): Promise<Parcel> {
    const parcel = await this.parcels.findById(id);
    if (!parcel) throw new Error("Посылка не найдена");
    return parcel;
  }

  private async requireItem(id: number): Promise<ParcelItem> {
    const item = await this.items.findById(id);
    if (!item) throw new Error("Товар не найден");
    return item;
  }
}

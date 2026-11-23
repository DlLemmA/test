import { describe, expect, it } from "vitest";
import { Parcel } from "../domain/Parcel";
import { ParcelItem } from "../domain/ParcelItem";
import { Payment } from "../domain/Payment";
import type { ParcelItemRepository, ParcelRepository, ParcelWriteStore } from "../domain/ports";
import { ParcelCommands } from "./ParcelCommands";

class SharedData {
  parcels = new Map<number, Parcel>();
  items = new Map<number, ParcelItem>();
  payments = new Map<number, Payment>();
  nextId = 1;
}

class Parcels implements ParcelRepository {
  constructor(private readonly data: SharedData) {}
  async findAll(): Promise<Parcel[]> {
    return [...this.data.parcels.values()];
  }
  async findById(id: number): Promise<Parcel | null> {
    return this.data.parcels.get(id) ?? null;
  }
}

class Items implements ParcelItemRepository {
  constructor(private readonly data: SharedData) {}
  async findByParcelId(parcelId: number): Promise<ParcelItem[]> {
    return [...this.data.items.values()].filter((item) => item.parcelId === parcelId);
  }
  async findAll(): Promise<ParcelItem[]> {
    return [...this.data.items.values()];
  }
  async findById(id: number): Promise<ParcelItem | null> {
    return this.data.items.get(id) ?? null;
  }
}

class Writes implements ParcelWriteStore {
  constructor(private readonly data: SharedData) {}
  async saveParcel(parcel: Parcel): Promise<Parcel> {
    const id = parcel.id || this.data.nextId++;
    const saved = Parcel.fromPersistence({ ...parcel.toPersistence(), id });
    this.data.parcels.set(id, saved);
    return saved;
  }
  async addItems(items: ParcelItem[]): Promise<ParcelItem[]> {
    return Promise.all(items.map((item) => this.saveItem(item)));
  }
  async saveItem(item: ParcelItem): Promise<ParcelItem> {
    const id = item.id || this.data.nextId++;
    const saved = ParcelItem.fromPersistence({ ...item.toPersistence(), id });
    this.data.items.set(id, saved);
    return saved;
  }
  async deleteItem(id: number): Promise<void> {
    this.data.items.delete(id);
  }
  async deleteParcel(id: number): Promise<void> {
    for (const [itemId, item] of this.data.items) {
      if (item.parcelId === id) this.data.items.delete(itemId);
    }
    for (const [paymentId, payment] of this.data.payments) {
      if (payment.parcelId === id) this.data.payments.delete(paymentId);
    }
    this.data.parcels.delete(id);
  }
}

function makeCommands() {
  const data = new SharedData();
  const commands = new ParcelCommands(new Parcels(data), new Items(data), new Writes(data));
  return { data, commands };
}

async function draftWithItem() {
  const ctx = makeCommands();
  const parcel = await ctx.commands.createParcel();
  const items = await ctx.commands.commitBatch(parcel.id, [
    {
      name: "Товар",
      priceCNY: 10,
      priceBYN: 30,
      quantity: 1,
      unit: "pcs",
      customerId: 2,
    },
  ]);
  const item = items[0];
  if (!item) throw new Error("fixture item missing");
  await ctx.commands.updateItem(item.id, { tracksCompletedAt: new Date().toISOString() });
  return { ...ctx, itemId: item.id };
}

describe("ParcelCommands", () => {
  it("validates input at the boundary before saving", async () => {
    const { commands, data } = makeCommands();
    await expect(commands.createParcel()).resolves.toBeDefined();
    await expect(commands.updateParcel(1, { name: "x".repeat(201) })).rejects.toThrow(
      "Название слишком длинное",
    );
    const parcel = await commands.createParcel();
    await expect(
      commands.commitBatch(parcel.id, [
        { name: "", priceCNY: -1, priceBYN: 0, quantity: 0, unit: "pcs", customerId: 2 },
      ]),
    ).rejects.toThrow("Название обязательно");
    expect(data.items.size).toBe(0);
  });

  it("does not add or delete items on a shipped parcel", async () => {
    const { commands, itemId } = await draftWithItem();
    await commands.shipParcel(1);

    await expect(
      commands.commitBatch(1, [
        { name: "Ещё", priceCNY: 1, priceBYN: 1, quantity: 1, unit: "pcs", customerId: 2 },
      ]),
    ).rejects.toThrow(/черновик/);
    await expect(commands.deleteItem(itemId)).rejects.toThrow(/черновик/);
  });

  it("freezes draft-only fields once shipped but still accepts tracks", async () => {
    const { commands, itemId } = await draftWithItem();
    await commands.shipParcel(1);

    const unchanged = await commands.updateItem(itemId, { name: "Другое" });
    expect(unchanged.name).toBe("Товар");
    const item = await commands.updateItem(itemId, { trackNumbers: ["TRACK-1"] });
    expect(item.name).toBe("Товар");
    expect(item.trackNumbers).toEqual(["TRACK-1"]);
  });

  it("deletes items and payments together with the parcel", async () => {
    const { commands, data } = await draftWithItem();
    data.payments.set(
      1,
      Payment.create({ parcelId: 1, customerId: 2, type: "shipping", paid: true }),
    );

    await commands.deleteParcel(1);

    expect(data.parcels.size).toBe(0);
    expect(data.items.size).toBe(0);
    expect(data.payments.size).toBe(0);
  });
});

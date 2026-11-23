import { describe, expect, it } from "vitest";
import {
  CNY_TO_BYN,
  ITEM_STATUSES,
  PARCEL_STATUSES,
  SCHEMA_VERSION,
  STORES,
  TABLES,
  UNITS,
  numberArray,
  stringArray,
  replaceAll,
  type DbSnapshot,
  type ReplaceableDb,
  type ReplaceableTable,
} from "./dbSchema";

class MemoryTable<T extends { id?: number }> implements ReplaceableTable<T> {
  rows: T[] = [];
  async clear(): Promise<void> {
    this.rows = [];
  }
  async bulkAdd(rows: readonly T[]): Promise<void> {
    this.rows.push(...rows.map((row) => ({ ...row })));
  }
}

class MemoryDb implements ReplaceableDb {
  customers = new MemoryTable<DbSnapshot["customers"][number]>();
  parcels = new MemoryTable<DbSnapshot["parcels"][number]>();
  parcelItems = new MemoryTable<DbSnapshot["parcelItems"][number]>();
  payments = new MemoryTable<DbSnapshot["payments"][number]>();
  inTransaction = false;

  async transaction<T>(_mode: "rw", ...args: unknown[]): Promise<T> {
    const scope = args.at(-1) as () => Promise<T>;
    this.inTransaction = true;
    try {
      return await scope();
    } finally {
      this.inTransaction = false;
    }
  }
}

const snapshot = (): DbSnapshot => ({
  customers: [{ id: 1, name: "Катя", isSelf: false }],
  parcels: [{ id: 2, status: "draft", createdAt: "2026-01-01" }],
  parcelItems: [
    {
      id: 3,
      parcelId: 2,
      name: "Товар",
      priceCNY: 10,
      priceBYN: 30,
      quantity: 1,
      unit: "pcs",
      customerId: 1,
      trackNumbers: stringArray.encode(["T-1"]),
      weightsG: numberArray.encode([100]),
      status: "ordered",
      createdAt: "2026-01-01",
    },
  ],
  payments: [
    { id: 4, parcelId: 2, customerId: 1, type: "item", paid: false, createdAt: "2026-01-01" },
  ],
});

describe("schema descriptor", () => {
  it("owns every storage string used by writers and the console", () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(TABLES).toEqual(["customers", "parcels", "parcelItems", "payments"]);
    expect(Object.keys(STORES)).toEqual([...TABLES]);
    expect(PARCEL_STATUSES).toContain("received");
    expect(ITEM_STATUSES).toContain("lost");
    expect(UNITS).toEqual(["pcs", "packs", "pairs"]);
    expect(CNY_TO_BYN).toBe(0.13);
  });

  it("round-trips JSON fields through one codec", () => {
    expect(stringArray.decode(stringArray.encode(["a", "b"]))).toEqual(["a", "b"]);
    expect(numberArray.decode(numberArray.encode([100, 200]))).toEqual([100, 200]);
    expect(stringArray.decode(undefined)).toEqual([]);
    expect(numberArray.decode(null)).toEqual([]);
    expect(() => stringArray.decode('{"not":"an array"}')).toThrow(/JSON-массив/);
  });

  it("clears and repopulates all four tables inside one transaction", async () => {
    const db = new MemoryDb();
    await db.customers.bulkAdd([{ id: 99, name: "Старый", isSelf: false }]);

    const observed: boolean[] = [];
    const originalAdd = db.customers.bulkAdd.bind(db.customers);
    db.customers.bulkAdd = async (rows) => {
      observed.push(db.inTransaction);
      await originalAdd(rows);
    };

    await replaceAll(db, snapshot());

    expect(observed.every(Boolean)).toBe(true);
    expect(db.customers.rows).toEqual([{ id: 1, name: "Катя", isSelf: false }]);
    expect(db.parcels.rows).toHaveLength(1);
    expect(db.parcelItems.rows).toHaveLength(1);
    expect(db.payments.rows).toHaveLength(1);
  });

  it("leaves a table empty when the snapshot has no rows for it", async () => {
    const db = new MemoryDb();
    await db.payments.bulkAdd([
      { id: 8, parcelId: 1, customerId: 1, type: "shipping", paid: true, createdAt: "2026-01-01" },
    ]);
    const data = snapshot();
    data.payments = [];
    await replaceAll(db, data);
    expect(db.payments.rows).toEqual([]);
    expect(db.customers.rows).toHaveLength(1);
  });
});

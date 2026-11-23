import { afterEach, describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, PARCEL_STATUSES, UNITS } from "./dbSchema";
import {
  createBackup,
  importBackup,
  parseBackup,
  resolveBackupIds,
  setBackupStore,
  type BackupStore,
} from "./backup";
import type { DbSnapshot } from "./dbSchema";

function memoryStore(
  initial?: Partial<DbSnapshot>,
): BackupStore & { data: DbSnapshot; calls: number } {
  const data: DbSnapshot = {
    customers: initial?.customers ?? [],
    parcels: initial?.parcels ?? [],
    parcelItems: initial?.parcelItems ?? [],
    payments: initial?.payments ?? [],
  };
  return {
    data,
    calls: 0,
    async snapshot() {
      return {
        customers: [...data.customers],
        parcels: [...data.parcels],
        parcelItems: [...data.parcelItems],
        payments: [...data.payments],
      };
    },
    async replace(snapshot) {
      data.customers = [...snapshot.customers];
      data.parcels = [...snapshot.parcels];
      data.parcelItems = [...snapshot.parcelItems];
      data.payments = [...snapshot.payments];
      this.calls++;
    },
  };
}

const backupJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    customers: [{ id: 5, name: "Катя", isSelf: false }],
    parcels: [{ id: 7, status: PARCEL_STATUSES[1], createdAt: "2026-01-01" }],
    parcelItems: [
      {
        id: 9,
        parcelId: 7,
        customerId: 5,
        name: "Товар",
        priceCNY: 10,
        priceBYN: 30,
        quantity: 1,
        unit: UNITS[0],
        trackNumbers: JSON.stringify(["T-1"]),
        weightsG: JSON.stringify([100]),
        status: "shipped",
        createdAt: "2026-01-01",
      },
    ],
    payments: [
      {
        id: 11,
        parcelId: 7,
        customerId: 5,
        itemId: 9,
        type: "item",
        paid: true,
        createdAt: "2026-01-01",
      },
    ],
    ...overrides,
  });

describe("backup schema seam", () => {
  afterEach(() => {
    setBackupStore({
      async snapshot() {
        return { customers: [], parcels: [], parcelItems: [], payments: [] };
      },
      async replace() {},
    });
  });

  it("exports format and version from the schema descriptor", async () => {
    const store = memoryStore();
    const restore = setBackupStore(store);
    const backup = await createBackup();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    restore();
  });

  it("parses rows through the shared status, unit and JSON rules", () => {
    const data = parseBackup(backupJson());
    expect(data.parcelItems[0]?.unit).toBe(UNITS[0]);
    expect(data.parcelItems[0]?.trackNumbers).toBe('["T-1"]');
    expect(() => parseBackup(backupJson({ parcels: [{ id: 7, status: "unknown" }] }))).toThrow(
      /недопустимое значение/,
    );
    const badJson = JSON.parse(backupJson());
    badJson.parcelItems[0].trackNumbers = "not-json";
    expect(() => parseBackup(JSON.stringify(badJson))).toThrow(/JSON-массив/);
  });

  it("remaps local ids to fresh contiguous ids in every table", () => {
    const snapshot = resolveBackupIds(parseBackup(backupJson()));
    expect(snapshot.customers[0]?.id).toBe(1);
    expect(snapshot.parcels[0]?.id).toBe(2);
    expect(snapshot.parcelItems[0]?.id).toBe(3);
    expect(snapshot.parcelItems[0]?.parcelId).toBe(2);
    expect(snapshot.parcelItems[0]?.customerId).toBe(1);
    expect(snapshot.payments[0]?.itemId).toBe(3);
    expect(snapshot.payments[0]?.parcelId).toBe(2);
  });

  it("rejects references that do not exist in the backup", () => {
    const raw = JSON.parse(backupJson());
    raw.parcelItems[0].customerId = 999;
    expect(() => resolveBackupIds(parseBackup(JSON.stringify(raw)))).toThrow(
      /несуществующую запись/,
    );
  });

  it("replaces the whole snapshot through the seam and reports counts", async () => {
    const store = memoryStore();
    const restore = setBackupStore(store);
    const result = await importBackup(backupJson());
    expect(store.calls).toBe(1);
    expect(store.data.customers).toHaveLength(1);
    expect(store.data.parcels).toHaveLength(1);
    expect(store.data.parcelItems).toHaveLength(1);
    expect(store.data.payments).toHaveLength(1);
    expect(result).toEqual({ customers: 1, parcels: 1, items: 1, payments: 1 });
    restore();
  });
});

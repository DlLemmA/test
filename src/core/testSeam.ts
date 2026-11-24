// ============================================
// DEV-only fixtures. Production builds never install this; e2e seeds the
// in-memory cache and enters a fake session without touching Supabase.
// ============================================

import { enableTestSession } from "./auth";
import {
  appendCachedRows,
  getSnapshot,
  removeCachedRows,
  replaceCache,
  upsertCachedRow,
} from "./cache";
import { ITEM_STATUSES, PARCEL_STATUSES, PAYMENT_TYPES, UNITS, type DbSnapshot } from "./dbSchema";
import type { CachedRow, CachedTable } from "./rowMappers";

type AnyRow = Record<string, unknown> & { id?: number; updatedAt?: string };

export interface TestTable {
  clear(): Promise<void>;
  get(id: number): Promise<AnyRow | undefined>;
  add(row: AnyRow): Promise<AnyRow>;
  bulkAdd(rows: readonly AnyRow[]): Promise<AnyRow[]>;
  update(id: number, changes: AnyRow): Promise<AnyRow>;
  toArray(): Promise<AnyRow[]>;
}

type TestCache = Record<CachedTable, TestTable>;

type TestSchema = {
  parcelStatus: typeof PARCEL_STATUSES;
  itemStatus: typeof ITEM_STATUSES;
  paymentType: typeof PAYMENT_TYPES;
  unit: typeof UNITS;
  replaceAll(snapshot: DbSnapshot): Promise<void>;
};

declare global {
  interface Window {
    appCache: TestCache;
    appSchema: TestSchema;
    appAuth: { enterTestMode(): void };
  }
}

function now(): string {
  return new Date().toISOString();
}

function nextId(rows: readonly AnyRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id ?? 0), 0) + 1;
}

function testTable(table: CachedTable): TestTable {
  const rows = () => getSnapshot()[table] as unknown as AnyRow[];

  return {
    async toArray() {
      return rows().map((row) => Object.assign({}, row));
    },
    async get(id) {
      const found = rows().find((row) => row.id === id);
      return found ? { ...found } : undefined;
    },
    async add(row) {
      const next: AnyRow = {
        ...row,
        id: row.id ?? nextId(rows()),
        updatedAt: row.updatedAt ?? now(),
      };
      upsertCachedRow(table, next as unknown as CachedRow);
      return { ...next };
    },
    async bulkAdd(incoming) {
      const current = rows();
      let id = nextId(current);
      const prepared = incoming.map((row) =>
        Object.assign({}, row, { id: row.id ?? id++, updatedAt: row.updatedAt ?? now() }),
      );
      appendCachedRows(table, prepared as unknown as CachedRow[]);
      return prepared.map((row) => Object.assign({}, row));
    },
    async update(id, changes) {
      const current = rows().find((row) => row.id === id);
      if (!current) throw new Error(`Нет строки ${table}#${id}`);
      const next: AnyRow = { ...current, ...changes, id, updatedAt: now() };
      upsertCachedRow(table, next as unknown as CachedRow);
      return { ...next };
    },
    async clear() {
      removeCachedRows(table, () => true);
    },
  };
}

export function installTestSeam(): void {
  if (!import.meta.env.DEV) return;

  window.appCache = {
    customers: testTable("customers"),
    parcels: testTable("parcels"),
    parcelItems: testTable("parcelItems"),
    payments: testTable("payments"),
  };
  window.appSchema = {
    parcelStatus: PARCEL_STATUSES,
    itemStatus: ITEM_STATUSES,
    paymentType: PAYMENT_TYPES,
    unit: UNITS,
    async replaceAll(snapshot) {
      replaceCache(snapshot);
    },
  };
  window.appAuth = { enterTestMode: enableTestSession };
}

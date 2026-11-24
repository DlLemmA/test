// ============================================
// In-memory read cache. Supabase remains the source of truth; this snapshot
// only keeps navigation instant. The DEV e2e snapshot is mirrored to
// sessionStorage so fixtures survive page reloads; production never persists.
// ============================================

import type { PostgrestError } from "@supabase/supabase-js";
import { cloudError } from "./cloudErrors";
import type { DbSnapshot } from "./dbSchema";
import type { Json } from "./supabase.types";
import { isTestMode } from "./testMode";
import {
  fromCloudCustomer,
  fromCloudParcel,
  fromCloudParcelItem,
  fromCloudPayment,
  type CachedParcelItemRow,
  type CachedParcelRow,
  type CachedPaymentRow,
  type CachedRow,
  type CachedSnapshot,
  type CachedTable,
} from "./rowMappers";
import { getSupabaseClient } from "./supabase";

type Listener = () => void;

const TEST_CACHE_KEY = "pindo-e2e-cache";

function isRows(value: unknown): boolean {
  return Array.isArray(value);
}

export function emptySnapshot(): CachedSnapshot {
  return { customers: [], parcels: [], parcelItems: [], payments: [] };
}

function loadTestSnapshot(): CachedSnapshot | null {
  if (!isTestMode()) return null;
  try {
    const raw = sessionStorage.getItem(TEST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSnapshot>;
    if (
      !isRows(parsed.customers) ||
      !isRows(parsed.parcels) ||
      !isRows(parsed.parcelItems) ||
      !isRows(parsed.payments)
    ) {
      return null;
    }
    return parsed as CachedSnapshot;
  } catch {
    return null;
  }
}

let snapshot = loadTestSnapshot() ?? emptySnapshot();
const listeners = new Set<Listener>();

function persistTestSnapshot(next: CachedSnapshot): void {
  if (!isTestMode()) return;
  try {
    sessionStorage.setItem(TEST_CACHE_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage can be unavailable or full; e2e fixtures will simply not survive reload.
  }
}

export function getSnapshot(): CachedSnapshot {
  return snapshot;
}

export function subscribeCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSnapshot(next: CachedSnapshot): void {
  snapshot = {
    customers: next.customers.map((row) => ({ ...row })),
    parcels: next.parcels.map((row) => ({ ...row })),
    parcelItems: next.parcelItems.map((row) => ({ ...row })),
    payments: next.payments.map((row) => ({ ...row })),
  };
  persistTestSnapshot(snapshot);
  for (const listener of listeners) listener();
}

export function clearCache(): void {
  try {
    sessionStorage.removeItem(TEST_CACHE_KEY);
  } catch {
    // Ignore storage errors; the in-memory snapshot is still cleared.
  }
  setSnapshot(emptySnapshot());
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw cloudError(error);
}

/** RLS is silent about missing membership; ask explicitly so the UI can explain it. */
export async function assertWorkspaceMember(): Promise<void> {
  const { data, error } = await getSupabaseClient().rpc("is_workspace_member");
  throwIfError(error);
  if (data !== true) {
    throw new Error("Этот аккаунт не добавлен в общий доступ");
  }
}

export async function refreshCache(): Promise<void> {
  const supabase = getSupabaseClient();
  const [customers, parcels, parcelItems, payments] = await Promise.all([
    supabase.from("customers").select("*").order("id"),
    supabase.from("parcels").select("*").order("id"),
    supabase.from("parcel_items").select("*").order("id"),
    supabase.from("payments").select("*").order("id"),
  ]);

  for (const result of [customers, parcels, parcelItems, payments]) throwIfError(result.error);

  setSnapshot({
    customers: (customers.data ?? []).map(fromCloudCustomer),
    parcels: (parcels.data ?? []).map(fromCloudParcel),
    parcelItems: (parcelItems.data ?? []).map(fromCloudParcelItem),
    payments: (payments.data ?? []).map(fromCloudPayment),
  });
}

/** Atomic remote replacement used by demo seed and deterministic fixtures. */
export async function replaceWorkspace(snapshotToReplace: DbSnapshot): Promise<void> {
  if (isTestMode()) {
    replaceCache(snapshotToReplace);
    return;
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("replace_workspace", {
    p_snapshot: snapshotToReplace as unknown as Json,
  });
  throwIfError(error);
  await refreshCache();
}

function normalize<T extends { id?: number; updatedAt?: string }>(
  rows: readonly T[],
): Array<T & { id: number; updatedAt: string }> {
  const maxId = rows.reduce((max, row) => Math.max(max, row.id ?? 0), 0);
  let nextId = maxId + 1;
  const now = new Date().toISOString();
  return rows.map((row) => ({
    ...row,
    id: row.id ?? nextId++,
    updatedAt: row.updatedAt ?? now,
  }));
}

/** Replace the in-memory snapshot without a network call (dev/e2e fixture seam). */
export function replaceCache(snapshotToReplace: DbSnapshot): void {
  setSnapshot({
    customers: normalize(snapshotToReplace.customers),
    parcels: normalize(snapshotToReplace.parcels),
    parcelItems: normalize(snapshotToReplace.parcelItems),
    payments: normalize(snapshotToReplace.payments),
  });
}

function mutateTable(table: CachedTable, update: (rows: CachedRow[]) => CachedRow[]): void {
  const rows = snapshot[table] as CachedRow[];
  setSnapshot({ ...snapshot, [table]: update(rows) } as CachedSnapshot);
}

export function upsertCachedRow(table: CachedTable, row: CachedRow): void {
  mutateTable(table, (rows) => {
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    if (index === -1) return [...rows, row];
    return [...rows.slice(0, index), row, ...rows.slice(index + 1)];
  });
}

export function appendCachedRows(table: CachedTable, incoming: CachedRow[]): void {
  if (incoming.length === 0) return;
  mutateTable(table, (rows) => [...rows, ...incoming]);
}

function upsertRows<T extends CachedRow>(rows: readonly T[], incoming: readonly T[]): T[] {
  const next = [...rows];
  for (const row of incoming) {
    const index = next.findIndex((candidate) => candidate.id === row.id);
    if (index === -1) next.push(row);
    else next[index] = row;
  }
  return next;
}

/** Patch all three tables from one composite write with a single notification. */
export function applyCachedBatch(rows: {
  parcel: CachedParcelRow;
  items: CachedParcelItemRow[];
  payments: CachedPaymentRow[];
}): void {
  setSnapshot({
    ...snapshot,
    parcels: upsertRows(snapshot.parcels, [rows.parcel]),
    parcelItems: upsertRows(snapshot.parcelItems, rows.items),
    payments: upsertRows(snapshot.payments, rows.payments),
  });
}

function nextCachedId(table: CachedTable): number {
  return (snapshot[table] as CachedRow[]).reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

/** Cache-only insert/upsert used by the dev e2e facade and test-mode writes. */
export function insertCachedRow<T extends CachedRow>(
  table: CachedTable,
  row: Omit<T, "id" | "updatedAt"> & { id?: number },
): T {
  const saved = {
    ...row,
    id: row.id ?? nextCachedId(table),
    updatedAt: new Date().toISOString(),
  } as T;
  upsertCachedRow(table, saved);
  return saved;
}

/** Cache-only update used when no network call is allowed (dev fixtures). */
export function updateCachedRow<T extends CachedRow>(
  table: CachedTable,
  id: number,
  changes: Partial<T>,
): T {
  const current = (snapshot[table] as T[]).find((row) => row.id === id);
  if (!current) throw new Error(`Нет строки ${table}#${id}`);
  const saved = {
    ...current,
    ...changes,
    id,
    updatedAt: new Date().toISOString(),
  } as T;
  upsertCachedRow(table, saved);
  return saved;
}

export function removeCachedRow(table: CachedTable, id: number): void {
  mutateTable(table, (rows) => rows.filter((row) => row.id !== id));
}

export function removeCachedRows(table: CachedTable, predicate: (row: CachedRow) => boolean): void {
  mutateTable(table, (rows) => rows.filter((row) => !predicate(row)));
}

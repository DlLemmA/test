// ============================================
// Backup / Restore (JSON)
// ============================================

import {
  db,
  type CustomerRow,
  type ParcelRow,
  type ParcelItemRow,
  type PaymentRow,
} from "./database";

const FORMAT = "pinduoduo-backup";
const VERSION = 1;

export interface BackupData {
  format: string;
  version: number;
  exportedAt: string;
  customers: CustomerRow[];
  parcels: ParcelRow[];
  parcelItems: ParcelItemRow[];
  payments: PaymentRow[];
}

export interface ImportResult {
  customers: number;
  parcels: number;
  items: number;
  payments: number;
}

export async function createBackup(): Promise<BackupData> {
  const [customers, parcels, parcelItems, payments] = await Promise.all([
    db.customers.toArray(),
    db.parcels.toArray(),
    db.parcelItems.toArray(),
    db.payments.toArray(),
  ]);

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    customers,
    parcels,
    parcelItems,
    payments,
  };
}

export async function downloadBackup(): Promise<void> {
  const data = await createBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pinduoduo-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Parsing and validation ----

type UnknownRow = Record<string, unknown>;

function asRows(value: unknown, label: string): UnknownRow[] {
  if (!Array.isArray(value)) throw new Error(`Раздел «${label}» должен быть массивом`);
  return value.map((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${label}[${index}]: ожидается объект`);
    }
    return row as UnknownRow;
  });
}

function requiredText(row: UnknownRow, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label}.${key}: обязательное поле-строка`);
  }
  return value;
}

function optionalText(row: UnknownRow, key: string, label: string): string | undefined {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${label}.${key}: ожидается строка`);
  return value;
}

function requiredNumber(row: UnknownRow, key: string, label: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key}: обязательное поле-число`);
  }
  return value;
}

function optionalNumber(row: UnknownRow, key: string, label: string): number | undefined {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key}: ожидается число`);
  }
  return value;
}

function requiredBool(row: UnknownRow, key: string, label: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw new Error(`${label}.${key}: ожидается true/false`);
  return value;
}

function oneOf<T extends string>(
  row: UnknownRow,
  key: string,
  allowed: readonly T[],
  label: string,
): T {
  const value = row[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label}.${key}: недопустимое значение «${String(value)}»`);
  }
  return value as T;
}

function jsonArrayString(row: UnknownRow, key: string, label: string): string {
  const value = optionalText(row, key, label) ?? "[]";
  try {
    if (!Array.isArray(JSON.parse(value))) throw new Error();
  } catch {
    throw new Error(`${label}.${key}: ожидается JSON-массив`);
  }
  return value;
}

const PARCEL_STATUSES = ["draft", "shipped", "received", "done"] as const;
const ITEM_STATUSES = ["ordered", "shipped", "received", "lost"] as const;
const PAYMENT_TYPES = ["item", "shipping"] as const;

function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Файл не содержит корректный JSON");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Ожидается объект с данными базы");
  }
  const root = raw as UnknownRow;
  // Старые копии сохранялись без полей format/version — принимаем и их.
  if (root.format !== undefined && root.format !== FORMAT) {
    throw new Error("Неизвестный формат резервной копии");
  }
  const version = root.version === undefined ? VERSION : requiredNumber(root, "version", "backup");
  if (version > VERSION) {
    throw new Error(`Версия копии ${version} новее поддерживаемой (${VERSION})`);
  }

  const now = new Date().toISOString();

  const customers: CustomerRow[] = asRows(root.customers, "customers").map((row, i) => {
    const label = `customers[${i}]`;
    return {
      id: optionalNumber(row, "id", label),
      name: requiredText(row, "name", label),
      isSelf: requiredBool(row, "isSelf", label),
    };
  });

  const parcels: ParcelRow[] = asRows(root.parcels, "parcels").map((row, i) => {
    const label = `parcels[${i}]`;
    return {
      id: optionalNumber(row, "id", label),
      name: optionalText(row, "name", label),
      status: oneOf(row, "status", PARCEL_STATUSES, label),
      comment: optionalText(row, "comment", label),
      boxWeightG: optionalNumber(row, "boxWeightG", label),
      shippingCostBYN: optionalNumber(row, "shippingCostBYN", label),
      shippedAt: optionalText(row, "shippedAt", label),
      receivedAt: optionalText(row, "receivedAt", label),
      completedAt: optionalText(row, "completedAt", label),
      createdAt: optionalText(row, "createdAt", label) ?? now,
    };
  });

  const parcelItems: ParcelItemRow[] = asRows(root.parcelItems, "parcelItems").map((row, i) => {
    const label = `parcelItems[${i}]`;
    return {
      id: optionalNumber(row, "id", label),
      parcelId: requiredNumber(row, "parcelId", label),
      name: requiredText(row, "name", label),
      priceCNY: optionalNumber(row, "priceCNY", label) ?? 0,
      priceBYN: requiredNumber(row, "priceBYN", label),
      quantity: requiredNumber(row, "quantity", label),
      unit: oneOf(row, "unit", ["pcs", "packs", "pairs"] as const, label),
      customerId: requiredNumber(row, "customerId", label),
      trackNumbers: jsonArrayString(row, "trackNumbers", label),
      weightsG: jsonArrayString(row, "weightsG", label),
      status: oneOf(row, "status", ITEM_STATUSES, label),
      tracksCompletedAt: optionalText(row, "tracksCompletedAt", label),
      createdAt: optionalText(row, "createdAt", label) ?? now,
    };
  });

  const payments: PaymentRow[] = asRows(root.payments ?? [], "payments").map((row, i) => {
    const label = `payments[${i}]`;
    return {
      id: optionalNumber(row, "id", label),
      parcelId: requiredNumber(row, "parcelId", label),
      customerId: requiredNumber(row, "customerId", label),
      itemId: optionalNumber(row, "itemId", label),
      type: oneOf(row, "type", PAYMENT_TYPES, label),
      paid: requiredBool(row, "paid", label),
      paidAt: optionalText(row, "paidAt", label),
      createdAt: optionalText(row, "createdAt", label) ?? now,
    };
  });

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: optionalText(root, "exportedAt", "backup") ?? now,
    customers,
    parcels,
    parcelItems,
    payments,
  };
}

function checkUniqueIds(rows: Array<{ id?: number }>, label: string): void {
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.id === undefined) continue;
    if (seen.has(row.id)) throw new Error(`Дублирующийся id ${row.id} в разделе «${label}»`);
    seen.add(row.id);
  }
}

function resolveId(map: Map<number, number>, id: number | undefined, label: string): number {
  if (id === undefined) throw new Error(`${label}: отсутствует id в копии`);
  const resolved = map.get(id);
  if (resolved === undefined) throw new Error(`${label}: ссылка на несуществующую запись (${id})`);
  return resolved;
}

export async function importBackup(text: string): Promise<ImportResult> {
  const data = parseBackup(text);
  checkUniqueIds(data.customers, "customers");
  checkUniqueIds(data.parcels, "parcels");
  checkUniqueIds(data.parcelItems, "parcelItems");
  checkUniqueIds(data.payments, "payments");

  const customerIds = new Map<number, number>();
  const parcelIds = new Map<number, number>();
  const itemIds = new Map<number, number>();

  await db.transaction("rw", db.customers, db.parcels, db.parcelItems, db.payments, async () => {
    await Promise.all([
      db.customers.clear(),
      db.parcels.clear(),
      db.parcelItems.clear(),
      db.payments.clear(),
    ]);

    for (const row of data.customers) {
      const newId = await db.customers.add({ name: row.name, isSelf: row.isSelf });
      if (row.id !== undefined) customerIds.set(row.id, newId);
    }

    for (const row of data.parcels) {
      const newId = await db.parcels.add({
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
      if (row.id !== undefined) parcelIds.set(row.id, newId);
    }

    for (const row of data.parcelItems) {
      const newId = await db.parcelItems.add({
        parcelId: resolveId(parcelIds, row.parcelId, "товар.parcelId"),
        name: row.name,
        priceCNY: row.priceCNY,
        priceBYN: row.priceBYN,
        quantity: row.quantity,
        unit: row.unit,
        customerId: resolveId(customerIds, row.customerId, "товар.customerId"),
        trackNumbers: row.trackNumbers,
        weightsG: row.weightsG,
        status: row.status,
        tracksCompletedAt: row.tracksCompletedAt,
        createdAt: row.createdAt,
      });
      if (row.id !== undefined) itemIds.set(row.id, newId);
    }

    for (const row of data.payments) {
      await db.payments.add({
        parcelId: resolveId(parcelIds, row.parcelId, "платёж.parcelId"),
        customerId: resolveId(customerIds, row.customerId, "платёж.customerId"),
        itemId:
          row.itemId === undefined ? undefined : resolveId(itemIds, row.itemId, "платёж.itemId"),
        type: row.type,
        paid: row.paid,
        paidAt: row.paidAt,
        createdAt: row.createdAt,
      });
    }
  });

  return {
    customers: data.customers.length,
    parcels: data.parcels.length,
    items: data.parcelItems.length,
    payments: data.payments.length,
  };
}

// ============================================
// Storage vocabulary — the single owner of row shapes, status/unit strings,
// the CNY rate and JSON field codecs. Supabase is the only persistent store;
// adapters map these camelCase rows to snake_case columns.
// ============================================

import raw from "./schema.json";

export const SELF_CUSTOMER_NAME = raw.selfCustomerName;
export const CNY_TO_BYN = raw.cnyToByn;

export const TABLES = raw.tables as unknown as readonly [
  "customers",
  "parcels",
  "parcelItems",
  "payments",
];
export type TableName = (typeof TABLES)[number];

export const PARCEL_STATUSES = raw.parcelStatuses as unknown as readonly [
  "draft",
  "shipped",
  "received",
  "done",
];
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

export const ITEM_STATUSES = raw.itemStatuses as unknown as readonly [
  "ordered",
  "shipped",
  "received",
  "lost",
];
export type ParcelItemStatus = (typeof ITEM_STATUSES)[number];

export const PAYMENT_TYPES = raw.paymentTypes as unknown as readonly ["item", "shipping"];
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const UNITS = raw.units as unknown as readonly ["pcs", "packs", "pairs"];
export type Unit = (typeof UNITS)[number];

// ============================================
// Row shapes
// ============================================

export interface CustomerRow {
  id?: number;
  name: string;
  isSelf: boolean;
}

export interface ParcelRow {
  id?: number;
  name?: string;
  status: ParcelStatus;
  comment?: string;
  boxWeightG?: number;
  shippingCostBYN?: number;
  shippedAt?: string;
  receivedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ParcelItemRow {
  id?: number;
  parcelId: number;
  name: string;
  priceCNY: number;
  priceBYN: number;
  quantity: number;
  unit: Unit;
  customerId: number;
  trackNumbers: string;
  weightsG: string;
  status: ParcelItemStatus;
  tracksCompletedAt?: string;
  createdAt: string;
}

export interface PaymentRow {
  id?: number;
  parcelId: number;
  customerId: number;
  itemId?: number;
  type: PaymentType;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

export interface DbSnapshot {
  customers: CustomerRow[];
  parcels: ParcelRow[];
  parcelItems: ParcelItemRow[];
  payments: PaymentRow[];
}

// ============================================
// JSON field codec — the only place that knows how arrays are stored
// ============================================

function decodeArray<T>(value: string | undefined | null, fallback: T[]): T[] {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Поле хранит не JSON-массив");
  return parsed as T[];
}

export const stringArray = {
  encode: (value: readonly string[]): string => JSON.stringify(value),
  decode: (value: string | undefined | null): string[] => decodeArray<string>(value, []),
};

export const numberArray = {
  encode: (value: readonly number[]): string => JSON.stringify(value),
  decode: (value: string | undefined | null): number[] => decodeArray<number>(value, []),
};
